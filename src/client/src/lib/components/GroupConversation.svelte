<script lang="ts">
  import { tick, untrack, onDestroy } from "svelte";
  import { API_ROOT } from "#lib";
  import { uploadEncryptedAttachment } from "#lib/api.ts";
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
  import E2eeGate from "./E2eeGate.svelte";

  const { groupId }: { groupId: string } = $props();
  let valid = $state(false);

  let messages = $state<GroupMessage[]>([]);
  let decrypted = $state<Record<string, DecryptResult>>({});

  // ── E2EE state ──
  type KeyStatus = "loading" | "ready" | "waiting-owner" | "no-key" | "error";
  type Recipients = {
    keyVersion: number;
    recipients: { id: string; publicKey: string; hasKey: boolean }[];
  };

  let keyStatus = $state<KeyStatus>("loading");
  let keyVersion = 0; // current version on the server (only used inside functions)
  let group: any = null;

  // ── Composer ──
  type PendingAttachment = {
    id: string; // Media.id of the uploaded ciphertext
    ref: Omit<AttachmentRef, "id">; // key/name/mime/size, goes inside the encrypted payload
    preview: string | null; // local object URL (the server only has ciphertext)
  };

  let draft = $state("");
  let pending = $state<PendingAttachment[]>([]);
  let uploading = $state(false);
  let uploadError = $state<string>();
  let sending = $state(false);
  let sendError = $state<string>();

  let fileInput: HTMLInputElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();
  let stickToBottom = true;

  // ── Decrypted attachments (blob URLs) ──
  // SVG is excluded on purpose: it can carry script
  const SAFE_IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/;
  let attachmentUrls = $state<Record<string, string>>({});
  let attachmentFailed = $state<Record<string, true>>({});
  const loadingAttachments = new Set<string>();

  const canSend = $derived(
    (!!draft.trim() || pending.length > 0) &&
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
      // No envelope for me yet: an online member will share it when they open the chat
      keyStatus = "no-key";
    }

    redecryptMissing();
  }

  async function createFirstKey() {
    const r = await ask<Recipients | null>("group:keys:recipients");
    if (!r) {
      keyStatus = "error";
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
    if (!$user || !$token || !$identity) return;

    const socket = getSocket();
    let cancelled = false;

    valid = false;
    messages = [];
    decrypted = {};
    keyStatus = "loading";

    const onSend = (message: GroupMessage) => {
      messages = [...messages, message];
      decryptRow(message);

      // Sent with a key we don't have: it may have just rotated
      const r = decrypted[message.id];
      if (!r!.ok && r!.reason === "missing-key") void refreshKeys(false);
      handleScroll();
    };

    const onDelete = (messageId: string) => {
      messages = messages.filter((message) => message.id !== messageId);
    };

    const onKeysUpdated = () => void refreshKeys(false);

    socket.on("group:messages:send", onSend);
    socket.on("group:messages:delete", onDelete);
    socket.on("group:keys:updated", onKeysUpdated);

    (async () => {
      const res = await ask<any>("group:select", groupId);
      if (!res || cancelled) return;
      group = res;

      // Keys first, so history can be decrypted in one pass
      await refreshKeys();

      const rows = await ask<GroupMessage[] | null>("group:messages:retrieve");
      if (!rows || cancelled) return;

      messages = rows;
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
      {#each messages as message (message.id)}
        {@const mine = message.sender.id === $user?.id}
        {@const result = decrypted[message.id]}
        <ContextMenu
          items={generateContextMenuForMessage(message)}
          onselect={(item) => onSelectItemForMessage(item)}
        >
          <div class={["chat w-full", mine ? "chat-end" : "chat-start"]}>
            <div class="chat-image avatar">
              <div class="w-10 rounded-full border-2 border-neutral">
                <img
                  alt=""
                  src={message.sender.avatarUrl
                    ? `${API_ROOT}${message.sender.avatarUrl}`
                    : "/default-avatar.png"}
                />
              </div>
            </div>
            <div class="chat-header font-bold">
              {message.sender.displayName || message.sender.username}
              <time class="text-xs font-normal opacity-60"
                >{formatTime(message.createdAt)}</time
              >
            </div>
            <div
              class={[
                "chat-bubble flex flex-col gap-2",
                mine ? "chat-bubble-primary" : "chat-bubble-secondary",
              ]}
            >
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

                <!-- Stickers/emotes are plaintext library items, referenced by id -->
                {#each result.payload.stickers ?? [] as stickerId (stickerId)}
                  <img
                    src={`${API_ROOT}/files/${encodeURIComponent(stickerId)}`}
                    alt="Sticker"
                    class="max-h-32 object-contain"
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
                      class="max-h-72 rounded-box object-contain"
                    />
                  {/each}
                {/if}
              {/if}
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
        {:else if keyStatus === "error"}
          <p role="alert" class="font-bold text-error">
            Couldn't set up encryption for this group.
          </p>
        {/if}

        {#if pending.length}
          <div class="flex items-center gap-3 overflow-x-auto p-2">
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
          <Button
            variant="outline"
            class="btn-circle"
            aria-label="Attach files"
            loading={uploading}
            disabled={keyStatus !== "ready"}
            onclick={openAttachmentDialog}
          >
            +
          </Button>
          <Input
            placeholder="Type your message..."
            aria-label="Message"
            autocomplete="off"
            disabled={keyStatus !== "ready"}
            bind:value={draft}
          />
          <Button type="submit" disabled={!canSend}>Send</Button>
        </form>
      </div>
    </div>
  </div>
{:else}
  <div class="mx-auto mt-40 w-full max-w-md px-4">
    <EmptyState
      icon="🔒"
      title="Can't open this chat"
      description="You might not be logged in."
    >
      <Link href="/login">Login</Link>
    </EmptyState>
  </div>
{/if}
