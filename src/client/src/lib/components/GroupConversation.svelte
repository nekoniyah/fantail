<script lang="ts">
  import { tick, untrack, onDestroy } from "svelte";
  import { API_ROOT } from "#lib";
  import { uploadEncryptedAttachment, fetchUser } from "#lib/api.ts";
  import getSocket from "#lib/io.ts";
  import { identity, token, user } from "#lib/stores.ts";
  import {
    buildEnvelopes,
    createGroupKeyVersion,
    decryptAttachment,
    decryptMessage,
    encodeBase64,
    encryptAttachment,
    encryptMessage,
    getGroupKey,
    loadEnvelopes,
    type AttachmentRef,
    type DecryptResult,
    type EncryptedRow,
  } from "#lib/crypto.ts";
  import type { GroupMessage } from "#lib/types.ts";
  import { Button, EmptyState, Input, Link } from "#lib/components/index.ts";
  import ContextMenu from "./ContextMenu.svelte";
  import EmojiStickerPicker from "./EmojiStickerPicker.svelte";
  import E2eeGate from "./E2eeGate.svelte";
  import GroupCall from "./GroupCall.svelte";
  import { callState, hangUp, startCall } from "#lib/callService.ts";
  import type { MediaItem } from "#lib/types.ts";

  const { groupId }: { groupId: string } = $props();
  let valid = $state(false);

  let messages = $state<GroupMessage[]>([]);
  let decrypted = $state<Record<string, DecryptResult>>({});

  // Last loaded history per group: makes revisiting a chat show content
  // instantly while a fresh retrieve runs in the background.
  const historyCache: Record<string, GroupMessage[]> = {};

  // ── E2EE state ──
  type KeyStatus = "loading" | "ready" | "waiting-owner" | "no-key" | "recover" | "error";
  type Recipients = {
    keyVersion: number;
    recipients: { id: string; publicKey: string; hasKey: boolean }[];
  };

  let keyStatus = $state<KeyStatus>("loading");
  let keyVersion = 0; // current version on the server (only used inside functions)
  // $state so the identity-unlock retry effect below re-runs when the
  // group:select ack lands (the two can complete in either order).
  let group: any = $state(null);

  // ── Composer ──
  type PendingAttachment = {
    id: string; // Media.id of the uploaded ciphertext
    ref: Omit<AttachmentRef, "id">; // key/name/mime/size, goes inside the encrypted payload
    preview: string | null; // local object URL (the server only has ciphertext)
  };

  let draft = $state("");
  let pending = $state<PendingAttachment[]>([]);
  let pendingStickerIds = $state<string[]>([]);
  let uploading = $state(false);
  let uploadError = $state<string>();
  let sending = $state(false);
  let sendError = $state<string>();

  let fileInput: HTMLInputElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();
  let stickToBottom = true;

  // ── Emoji & sticker picker ──
  let pickerOpen = $state(false);
  let pickerWrap: HTMLDivElement | undefined = $state();

  // Click outside the picker (or Escape) closes it. Effect only active while open.
  $effect(() => {
    if (!pickerOpen) return;

    const onPointerDown = (ev: Event) => {
      if (!pickerWrap?.contains(ev.target as Node)) pickerOpen = false;
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") pickerOpen = false;
    };

    // Defer so the very click that opened the picker can't close it
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKey);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  });

  // ── Decrypted attachments (blob URLs) ──
  // SVG is excluded on purpose: it can carry script
  const SAFE_IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;
  let attachmentUrls = $state<Record<string, string>>({});
  let attachmentFailed = $state<Record<string, true>>({});
  const loadingAttachments = new Set<string>();

  const canSend = $derived(
    (!!draft.trim() || pending.length > 0 || pendingStickerIds.length > 0) &&
      keyStatus === "ready" &&
      !sending &&
      !uploading,
  );

  const failureText: Record<string, string> = {
    "missing-key":
      "🔒 You don't have the key for this message (it was sent before you joined).",
    "bad-signature": "⚠️ This message couldn't be verified.",
    "decrypt-failed": "⚠️ This message couldn't be decrypted.",
    malformed: "⚠️ This message is malformed.",
  };

  const timeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const formatTime = (value: string | Date) =>
    timeFormat.format(new Date(value));

  // ─────────────── Socket helpers ───────────────

  function ask<T>(event: string, ...args: unknown[]) {
    return new Promise<T>((resolve) =>
      getSocket().emit(event, ...args, resolve),
    );
  }

  // ─────────────── Keys ───────────────

  async function refreshKeys(allowCreate = true) {
    const res = await ask<{
      keyVersion: number;
      envelopes: { version: number; wrappedKey: string }[];
    } | null>("group:keys:retrieve");

    if (!res) {
      keyStatus = "error";
      return;
    }

    keyVersion = res.keyVersion;
    loadEnvelopes(groupId, res.envelopes);

    const isOwner = group?.ownerId === $user?.id;

    if (keyVersion === 0) {
      // Nobody has enabled encryption yet: the owner creates the first key
      if (isOwner && allowCreate) await createFirstKey();
      else keyStatus = isOwner ? "error" : "waiting-owner";
    } else if (getGroupKey(groupId, keyVersion)) {
      keyStatus = "ready";
      await shareWithNewMembers();
    } else {
      // No unwrappable envelope for me: either an online member will share
      // the key, or (owner) my identity doesn't pair with the registered one
      // and I must rotate the key to recover.
      keyStatus = isOwner ? "recover" : "no-key";
    }

    redecryptMissing();
  }

  // Owner recovery: publish a new key version wrapped for MY current
  // registered keys, replacing an unreadable previous version. Old-version
  // messages stay unreadable (accepted loss — that is what rotation means).
  async function rotateKey() {
    const r = await ask<Recipients | null>("group:keys:recipients");
    if (!r) {
      keyStatus = "error";
      return;
    }
    if (!r.recipients.length) {
      // No one (including me) has registered keys yet: a key wrapped for
      // nobody would be unreadable and unshareable. Wait instead.
      keyStatus = "waiting-owner";
      return;
    }
    if (r.recipients.some((x) => !x.publicKey)) {
      keyStatus = "error";
      return;
    }
    const { version, envelopes } = createGroupKeyVersion(
      groupId,
      r.keyVersion,
      r.recipients,
    );
    const ok = await ask<boolean>("group:keys:publish", version, envelopes);
    if (ok) await refreshKeys(false);
    else keyStatus = "error";
  }

  async function createFirstKey() {
    const r = await ask<Recipients | null>("group:keys:recipients");
    if (!r) {
      keyStatus = "error";
      return;
    }

    // Never publish a key wrapped for nobody: that bumps the version while
    // making it permanently unreadable/unshareable (a bricked group). Wait
    // until at least one member has registered keys; shareWithNewMembers and
    // a later refresh handle late registrations afterwards.
    if (!r.recipients.length) {
      keyStatus = "waiting-owner";
      return;
    }

    const { version, envelopes } = createGroupKeyVersion(
      groupId,
      0,
      r.recipients,
    );
    const ok = await ask<boolean>("group:keys:publish", version, envelopes);

    if (ok) {
      keyVersion = version;
      keyStatus = "ready";
    } else {
      // Someone else may have published first: load what the server has
      await refreshKeys(false);
    }
  }

  // Hand the current key to members who don't have it yet (e.g. just added)
  async function shareWithNewMembers() {
    const key = getGroupKey(groupId, keyVersion);
    const me = $user?.id;
    if (!key || !me) return;

    const r = await ask<Recipients | null>("group:keys:recipients");
    if (!r || r.keyVersion !== keyVersion) return;

    const missing = r.recipients.filter((x) => !x.hasKey && x.id !== me);
    if (!missing.length) return;

    await ask<boolean>(
      "group:keys:share",
      keyVersion,
      buildEnvelopes(key, missing),
    );
  }

  // ─────────────── Decrypting ───────────────

  function decryptRow(row: GroupMessage) {
    decrypted[row.id] = decryptMessage(row as unknown as EncryptedRow, groupId);
  }

  // After new keys arrive, retry messages that were waiting for one
  function redecryptMissing() {
    for (const row of messages) {
      const r = decrypted[row.id];
      if (!r || (!r.ok && r.reason === "missing-key")) decryptRow(row);
    }
  }

  async function loadAttachment(message: GroupMessage, ref: AttachmentRef) {
    if (
      loadingAttachments.has(ref.id) ||
      untrack(() => attachmentUrls[ref.id] || attachmentFailed[ref.id])
    ) {
      return;
    }
    loadingAttachments.add(ref.id);

    try {
      const nonce = (message.attachments as any[]).find(
        (a) => a.id === ref.id,
      )?.nonce;
      if (!nonce) throw new Error("Missing nonce");

      // Ciphertext: safe to fetch without auth, only members hold the key
      const res = await fetch(
        `${API_ROOT}/files/${encodeURIComponent(ref.id)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const bytes = decryptAttachment(
        { data: encodeBase64(await res.bytes()), nonce },
        ref,
      );

      // The MIME type comes from the sender, so only trust known-safe image types
      const type = SAFE_IMAGE.test(ref.mime)
        ? ref.mime
        : "application/octet-stream";
      attachmentUrls[ref.id] = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type }),
      );
    } catch {
      attachmentFailed[ref.id] = true;
    } finally {
      loadingAttachments.delete(ref.id);
    }
  }

  // ─────────────── Effects ───────────────

  $effect(() => {
    if (!$user || !$token) return;

    const socket = getSocket();
    let cancelled = false;

    // Paint from the plain cache first (untracked: historyCache is reactive-
    // muted), then let the async load replace it. Never read `messages` here,
    // this effect also writes it (effect_update_depth_exceeded if you do).
    // Runs even while identity is still unlocking, so a revisit shows cached
    // rows immediately; encrypted previews stay "missing-key" until unlock.
    valid = false;
    untrack(() => {
      const cached = historyCache[groupId];
      if (cached === undefined) return;
      messages = cached;
      decrypted = {};
      for (const row of cached) decryptRow(row);
      if (cached.length) valid = true;
    });
    keyStatus = "loading";

    const onSend = (message: GroupMessage) => {
      messages = [...messages, message];
      historyCache[groupId] = messages;
      decryptRow(message);

      // Sent with a key we don't have: it may have just rotated
      const r = decrypted[message.id];
      if (!r!.ok && r!.reason === "missing-key") void refreshKeys(false);
      handleScroll();
    };

    const onDelete = (messageId: string) => {
      messages = messages.filter((message) => message.id !== messageId);
      historyCache[groupId] = messages;
    };

    const onKeysUpdated = () => void refreshKeys(false);

    socket.on("group:messages:send", onSend);
    socket.on("group:messages:delete", onDelete);
    socket.on("group:keys:updated", onKeysUpdated);

      (async () => {
      const res = await ask<any>("group:select", groupId);
      if (!res || cancelled) return;
      group = res;

      // The owner isn't among members; fetch their profile once so call
      // tiles (and any other owner-name display) can resolve it.
      if (res.ownerId && res.members) {
        void fetchUser(res.ownerId).then((owner) => {
          if (owner && !cancelled) group = { ...group, ownerProfile: owner };
        });
      }

      // Fetch history in parallel with the keys: the rows render as
      // "waiting for key" and redecryptMissing() fills them in when keys land.
      const rowsPromise = ask<GroupMessage[] | null>(
        "group:messages:retrieve",
      );
      await refreshKeys();
      const rows = await rowsPromise;
      if (!rows || cancelled) return;

      messages = rows;
      historyCache[groupId] = rows;
      for (const row of rows) decryptRow(row);
      valid = true;
    })();

    // Without this, every re-run stacked another set of listeners
    // and each new message showed up multiple times.
    return () => {
      cancelled = true;
      socket.off("group:messages:send", onSend);
      socket.off("group:messages:delete", onDelete);
      socket.off("group:keys:updated", onKeysUpdated);
    };
  });

  // Decrypt attachments as their messages appear
  $effect(() => {
    for (const message of messages) {
      const result = decrypted[message.id];
      if (!result?.ok) continue;
      for (const ref of result.payload.attachments ?? []) {
        void loadAttachment(message, ref);
      }
    }
  });

  // The main effect runs before the E2EE gate finishes: envelopes fetched with
  // the identity still locked all fail to unwrap and are then lost. Once BOTH
  // an identity (unlock / setup / import) and a selected group exist, load the
  // group's envelopes again from the server — keys cached, messages redecrypt.
  // Tracks $identity and group ($state), so it re-runs whichever arrives last.
  $effect(() => {
    if (!$identity || !group) return;
    void refreshKeys(false);
  });

  // Keep the newest message in view, unless you've scrolled up to read history
  $effect(() => {
    messages.length;
    tick().then(() => {
      if (stickToBottom) scroller?.scrollTo({ top: scroller.scrollHeight });
    });
  });

  onDestroy(() => {
    for (const url of Object.values(attachmentUrls)) URL.revokeObjectURL(url);
    for (const p of pending) if (p.preview) URL.revokeObjectURL(p.preview);
  });

  function handleScroll() {
    if (!scroller) return;
    stickToBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 100;
  }

  // ─────────────── Sending ───────────────

  function clearPending() {
    for (const p of pending) if (p.preview) URL.revokeObjectURL(p.preview);
    pending = [];
    pendingStickerIds = [];
    pickerOpen = false;
  }

  // ─────────────── Voice call ───────────────

  // Tiles must resolve the OWNER too: the roster contains owner+members, but
  // group.members excludes the owner, so check both before falling back.
  const callNameOf = (userId: string) => {
    if (userId === $user?.id) return $user.displayName || $user.username;
    const member = group?.members?.find((m: any) => m.id === userId);
    if (member) return member.displayName || member.username;
    const owner = group?.ownerProfile; // populated by fetchGroup below when present
    if (owner && owner.id === userId) return owner.displayName || owner.username;
    return "loading…"; // GroupCall fetches profiles it can't resolve
  };
  const callAvatarOf = (userId: string) => {
    const member =
      userId === $user?.id
        ? $user
        : group?.members?.find((m: any) => m.id === userId) ??
          (group?.ownerProfile?.id === userId ? group.ownerProfile : undefined);
    return member?.avatarUrl
      ? `${API_ROOT}${member.avatarUrl}`
      : "/default-avatar.png";
  };
  function toggleCall() {
    if ($callState.active || $callState.connecting) void hangUp();
    else void startCall(groupId);
  }

  // ─────────────── Emoji & sticker picker ───────────────

  function togglePicker() {
    pickerOpen = !pickerOpen;
  }

  function onPickerItem(item: MediaItem) {
    if (item.type === "sticker") {
      // A sticker is its own visual block: it goes out as payload.stickers
      if (!pendingStickerIds.includes(item.id)) {
        pendingStickerIds = [...pendingStickerIds, item.id];
      }
    } else {
      // An emoji drops inline at the cursor position of the text draft
      const el = document.getElementById("composer-input") as
        | HTMLInputElement
        | undefined;
      const pos = el?.selectionStart ?? draft.length;
      draft = draft.slice(0, pos) + item.name + draft.slice(pos);
    }
  }

  async function sendMessage(event: SubmitEvent) {
    event.preventDefault();
    if (!canSend) return;

    sending = true;
    sendError = undefined;

    try {
      const enc = encryptMessage(
        {
          text: draft.trim(),
          stickers: pendingStickerIds,
          attachments: pending.map((p) => ({ id: p.id, ...p.ref })),
        },
        groupId,
        keyVersion,
      );

      const res = await ask<{ ok: boolean; error?: string }>(
        "group:messages:send",
        enc.content,
        enc.nonce,
        enc.keyVersion,
        enc.signature,
        pending.map((p) => p.id),
      );

      if (res?.ok) {
        draft = "";
        clearPending();
        uploadError = undefined;
        stickToBottom = true;
      } else if (res?.error === "stale-key") {
        // The key rotated while we were typing: reload keys, keep the draft
        await refreshKeys(false);
        sendError = "The group key just changed. Please send again.";
      } else {
        sendError = "Couldn't send your message.";
      }
    } catch {
      sendError = "Couldn't encrypt your message.";
    } finally {
      sending = false;
    }
  }

  function generateContextMenuForMessage(message: GroupMessage) {
    const items = [
      {
        label: "Reply",
        action: () => {
          console.log("Reply to message:", message);
        },
      },
    ];

    if (message.sender.id === $user?.id) {
      items.push(
        {
          label: "Edit",
          action: () => {
            console.log("Edit message:", message);
          },
        },
        {
          label: "Delete",
          action: () => {
            const socket = getSocket();
            socket.emit("group:messages:delete", message.id);
          },
        },
      );
    }

    return items;
  }

  function onSelectItemForMessage(item: any) {
    item.action();
  }

  // Discord-style grouping: a message "starts" when the sender differs from the
  // previous one or it's much later (15 min+); continuation rows hide the
  // avatar and header to keep the list compact.
  const GROUPING_WINDOW_MS = 15 * 60 * 1000;

  function startsGroup(message: GroupMessage, index: number): boolean {
    if (index === 0) return true;
    const prev = messages[index - 1];
    if (!prev || prev.sender.id !== message.sender.id) return true;
    return (
      new Date(message.createdAt).getTime() -
        new Date(prev.createdAt).getTime() >
      GROUPING_WINDOW_MS
    );
  }

  function openAttachmentDialog() {
    fileInput?.click();
  }

  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (!files?.length) return;

    uploadError = undefined;
    uploading = true;

    try {
      for (const file of files) {
        // Step 1: encrypt locally
        let encrypted: ReturnType<typeof encryptAttachment> | undefined;
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          encrypted = encryptAttachment(bytes, {
            name: file.name,
            mime: file.type || "application/octet-stream",
          });
        } catch (e) {
          uploadError =
            e instanceof Error && e.message === "Attachment too large"
              ? `${file.name} is too large (10 MB max)`
              : `Could not encrypt ${file.name}`;
        }
        if (!encrypted) continue;

        // Step 2: upload the ciphertext (failures here are NOT encryption errors)
        try {
          const r = await uploadEncryptedAttachment(encrypted.upload);

          if ("media" in r) {
            pending = [
              ...pending,
              {
                id: r.media.id,
                ref: encrypted.ref,
                preview: SAFE_IMAGE.test(file.type)
                  ? URL.createObjectURL(file)
                  : null,
              },
            ];
          } else {
            uploadError = `Could not upload ${file.name}: ${r.message}`;
          }
        } catch {
          uploadError = `Could not upload ${file.name}: the request failed`;
        }
      }
    } finally {
      uploading = false;
      // Lets the same file be picked again later
      target.value = "";
    }
  }

  function removeAttachment(fileId: string) {
    const removed = pending.find((p) => p.id === fileId);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    pending = pending.filter((p) => p.id !== fileId);
  }
</script>

{#snippet attachmentView(ref: AttachmentRef)}
  {#if attachmentUrls[ref.id]}
    {#if SAFE_IMAGE.test(ref.mime)}
      <img
        src={attachmentUrls[ref.id]}
        alt={ref.name}
        class="max-h-72 rounded-box object-contain"
      />
    {:else}
      <a class="link" href={attachmentUrls[ref.id]} download={ref.name}>
        📎 {ref.name}
      </a>
    {/if}
  {:else if attachmentFailed[ref.id]}
    <p class="italic opacity-70">Couldn't load {ref.name}</p>
  {:else}
    <p class="italic opacity-70">Decrypting {ref.name}…</p>
  {/if}
{/snippet}

{#if $user && !$identity}
  <E2eeGate />
{:else if !($user && $token)}
  <div class="mx-auto mt-40 w-full max-w-md px-4">
    <EmptyState
      icon="🔒"
      title="Can't open this chat"
      description="You might not be logged in."
    >
      <Link href="/login">Login</Link>
    </EmptyState>
  </div>
{:else if valid}
  <input
    bind:this={fileInput}
    type="file"
    name="file"
    class="hidden"
    multiple
    onchange={handleFileChange}
  />

  <!-- Fills the space under the fixed navbar (h-30) -->
  <div class="fixed inset-x-0 top-30 bottom-0 flex flex-col bg-base-200">
    <div
      bind:this={scroller}
      onscroll={handleScroll}
      class="mx-auto w-full max-w-3xl grow overflow-y-auto px-4 py-4"
    >
      {#each messages as message, i (message.id)}
        {@const mine = message.sender.id === $user?.id}
        {@const result = decrypted[message.id]}
        {@const first = startsGroup(message, i)}
        <ContextMenu
          items={generateContextMenuForMessage(message)}
          onselect={(item) => onSelectItemForMessage(item)}
        >
          <!-- Discord-style row: full-width rectangle, avatar + name only on group starts -->
          <div
            class={[
              "group/row relative mt-1 flex gap-3 px-2 py-1",
              !first && "-mt-1",
              "hover:bg-base-300/40 transition-colors rounded-md",
              mine && "pr-2",
            ]}
          >
            <div class="w-10 shrink-0">
              {#if first}
                <div class="mt-3.5 size-10 overflow-hidden rounded-full border-2 border-neutral">
                  <img
                    alt=""
                    class="size-full object-cover"
                    src={message.sender.avatarUrl
                      ? `${API_ROOT}${message.sender.avatarUrl}`
                      : "/default-avatar.png"}
                  />
                </div>
              {/if}
            </div>

            <div class="min-w-0 grow">
              {#if first}
                <div class="flex items-baseline gap-2 leading-tight">
                  <span class="font-display text-sm font-bold"
                    >{message.sender.displayName || message.sender.username}</span
                  >
                  <time class="text-xs opacity-60"
                    >{formatTime(message.createdAt)}</time
                  >
                </div>
              {/if}
              <div class="flex flex-col gap-2">
                {#if !result}
                  <p class="italic opacity-70">Decrypting…</p>
                {:else if !result.ok}
                  <p class="italic opacity-70">{failureText[result.reason]}</p>
                {:else}
                  {#if result.payload.text}
                    <p class="wrap-break-word whitespace-pre-wrap">
                      {result.payload.text}
                    </p>
                  {/if}

                  <!-- Stickers are plaintext library items, referenced by id -->
                  {#each result.payload.stickers ?? [] as stickerId (stickerId)}
                    <img
                      src={`${API_ROOT}/files/${encodeURIComponent(stickerId)}`}
                      alt="Sticker"
                      class="max-h-40 rounded-md object-contain"
                      loading="lazy"
                    />
                  {/each}

                  {#each result.payload.attachments ?? [] as ref (ref.id)}
                    {@render attachmentView(ref)}
                  {/each}

                  <!-- Messages from before E2EE kept their plaintext attachments -->
                  {#if result.legacy}
                    {#each message.attachments as attachment (attachment.id)}
                      <img
                        src={`${API_ROOT}/files/${attachment.id}`}
                        alt="Attachment"
                        class="max-h-72 rounded-md object-contain"
                      />
                    {/each}
                  {/if}
                {/if}
              </div>
            </div>
          </div>
        </ContextMenu>
      {:else}
        <EmptyState
          icon="💬"
          title="No messages yet"
          description="Say hi and start the conversation."
          class="mt-10"
        />
      {/each}
    </div>

    <div class="border-t-2 border-neutral bg-base-100">
      <!-- Right padding keeps Send clear of the floating Groups button -->
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-3 py-3 pr-24 pl-4">
        {#if keyStatus === "waiting-owner"}
          <p role="status" class="font-bold">
            🔒 Waiting for the group owner to enable encryption.
          </p>
        {:else if keyStatus === "no-key"}
          <p role="status" class="font-bold">
            🔒 You don't have this group's key yet. It will be shared with you
            when another member opens this chat.
          </p>
        {:else if keyStatus === "recover"}
          <div role="alert" class="flex flex-wrap items-center gap-3">
            <p class="font-bold text-error">
              🔒 You can't read this group's current key — your device keys
              don't match the ones this group key was wrapped for.
            </p>
            <Button variant="outline" onclick={() => void rotateKey()}>
              Rotate the group key (owner)
            </Button>
          </div>
        {:else if keyStatus === "error"}
          <p role="alert" class="font-bold text-error">
            Couldn't set up encryption for this group.
          </p>
        {/if}

        {#if pending.length || pendingStickerIds.length}
          <div class="flex items-center gap-3 overflow-x-auto p-2">
            {#each pendingStickerIds as stickerId (stickerId)}
              <div class="relative shrink-0">
                <img
                  src={`${API_ROOT}/files/${encodeURIComponent(stickerId)}`}
                  alt="Sticker"
                  class="size-20 rounded-box border-2 border-neutral object-contain"
                />
                <button
                  type="button"
                  class="btn absolute -top-2 -right-2 border-2 border-neutral btn-circle btn-xs btn-primary"
                  aria-label="Remove sticker"
                  onclick={() =>
                    (pendingStickerIds = pendingStickerIds.filter(
                      (id) => id !== stickerId,
                    ))}
                >
                  ✕
                </button>
              </div>
            {/each}
            {#each pending as p (p.id)}
              <div class="relative shrink-0">
                {#if p.preview}
                  <img
                    src={p.preview}
                    alt="Uploaded file preview"
                    class="size-20 rounded-box border-2 border-neutral object-cover"
                  />
                {:else}
                  <div
                    class="flex size-20 items-center justify-center rounded-box border-2 border-neutral p-1 text-center text-xs wrap-anywhere"
                  >
                    📎 {p.ref.name}
                  </div>
                {/if}
                <button
                  type="button"
                  class="btn absolute -top-2 -right-2 border-2 border-neutral btn-circle btn-xs btn-primary"
                  aria-label="Remove attachment"
                  onclick={() => removeAttachment(p.id)}
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}

        {#if uploadError}
          <p role="alert" class="font-bold text-error">{uploadError}</p>
        {/if}

        {#if sendError}
          <p role="alert" class="font-bold text-error">{sendError}</p>
        {/if}

        <form onsubmit={sendMessage} class="flex items-center gap-2">
          <!-- Emoji / sticker picker -->
          <div class="relative" bind:this={pickerWrap}>
            <Button
              variant="outline"
              class="btn-circle"
              aria-label="Pick emoji or sticker"
              aria-expanded={pickerOpen}
              disabled={keyStatus === "loading"}
              onclick={togglePicker}
            >
              😀
            </Button>
            {#if pickerOpen}
              <div class="absolute bottom-14 left-0 z-50">
                <EmojiStickerPicker onpick={onPickerItem} />
              </div>
            {/if}
          </div>
          <Button
            variant="outline"
            class="btn-circle"
            aria-label="Attach files"
            loading={uploading}
            disabled={keyStatus === "loading"}
            onclick={openAttachmentDialog}
          >
            +
          </Button>
          <Button
            variant={$callState.active ? "accent" : "outline"}
            class="btn-circle"
            aria-label={$callState.active ? "Leave voice call" : "Start voice call"}
            aria-pressed={$callState.active}
            onclick={toggleCall}
          >
            {$callState.active ? "📴" : "📞"}
          </Button>
          <Input
            placeholder="Type your message..."
            aria-label="Message"
            autocomplete="off"
            id="composer-input"
            disabled={keyStatus === "loading"}
            bind:value={draft}
          />
          <Button type="submit" disabled={!canSend}>Send</Button>
        </form>
      </div>
    </div>

    <!-- Voice call (P2P via PeerJS) -->
    <GroupCall {groupId} nameOf={callNameOf} avatarOf={callAvatarOf} />
  </div>
{:else}
  <div class="fixed inset-x-0 top-30 bottom-0 flex items-center justify-center bg-base-200">
    <span class="loading loading-spinner"></span>
  </div>
{/if}
