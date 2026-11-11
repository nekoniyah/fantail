<script lang="ts">
  import { tick } from "svelte";
  import { API_ROOT } from "#lib";
  import { uploadAttachment } from "#lib/api.ts";
  import getSocket from "#lib/io.ts";
  import { token, user } from "#lib/stores.ts";
  import type { GroupMessage } from "#lib/types.ts";
  import { Button, EmptyState, Input, Link } from "#lib/components/index.ts";
  import ContextMenu from "./ContextMenu.svelte";

  const { groupId }: { groupId: string } = $props();
  let valid = $state(false);

  let messages = $state<GroupMessage[]>([]);

  let draft = $state("");
  let uploadedFileIds = $state<string[]>([]);
  let uploading = $state(false);
  let uploadError = $state<string>();

  let fileInput: HTMLInputElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();
  let stickToBottom = true;

  const canSend = $derived(!!draft.trim() || uploadedFileIds.length > 0);

  const timeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const formatTime = (value: string | Date) =>
    timeFormat.format(new Date(value));

  $effect(() => {
    if (!$user || !$token) return;

    const socket = getSocket();

    const onSend = (message: GroupMessage) => {
      messages = [...messages, message];
    };

    const onDelete = (messageId: string) => {
      messages = messages.filter((message) => message.id !== messageId);
    };

    socket.on("group:messages:send", onSend);
    socket.on("group:messages:delete", onDelete);

    socket.emit("group:select", groupId, async (res: any) => {
      if (!res) return;

      socket.emit(
        "group:messages:retrieve",
        async (messagesx: GroupMessage[]) => {
          messages = messagesx;
          valid = true;
        },
      );
    });

    // Without this, every re-run stacked another set of listeners
    // and each new message showed up multiple times.
    return () => {
      socket.off("group:messages:send", onSend);
      socket.off("group:messages:delete", onDelete);
    };
  });

  // Keep the newest message in view, unless you've scrolled up to read history
  $effect(() => {
    messages.length;
    tick().then(() => {
      if (stickToBottom) scroller?.scrollTo({ top: scroller.scrollHeight });
    });
  });

  function handleScroll() {
    if (!scroller) return;
    stickToBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  function sendMessage(event: SubmitEvent) {
    event.preventDefault();
    if (!canSend) return;

    const socket = getSocket();
    socket.emit("group:messages:send", draft.trim(), uploadedFileIds);

    draft = "";
    uploadedFileIds = [];
    uploadError = undefined;
    stickToBottom = true;
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
        const r = await uploadAttachment(file);

        if ("media" in r) {
          uploadedFileIds = [...uploadedFileIds, r.media.id];
        } else {
          uploadError = `Could not upload ${file.name}`;
        }
      }
    } finally {
      uploading = false;
      // Lets the same file be picked again later
      target.value = "";
    }
  }

  function removeAttachment(fileId: string) {
    uploadedFileIds = uploadedFileIds.filter((id) => id !== fileId);
  }
</script>

{#if valid}
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
              {#if message.content}
                <p class="wrap-break-word whitespace-pre-wrap">
                  {message.content}
                </p>
              {/if}

              {#each message.attachments as attachment (attachment.id)}
                <img
                  src={`${API_ROOT}/files/${attachment.id}`}
                  alt="Attachment"
                  class="max-h-72 rounded-box object-contain"
                />
              {/each}
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
        {#if uploadedFileIds.length}
          <div class="flex items-center gap-3 overflow-x-auto p-2">
            {#each uploadedFileIds as fileId (fileId)}
              <div class="relative shrink-0">
                <img
                  src={`${API_ROOT}/files/${fileId}`}
                  alt="Uploaded file preview"
                  class="size-20 rounded-box border-2 border-neutral object-cover"
                />
                <button
                  type="button"
                  class="btn absolute -top-2 -right-2 border-2 border-neutral btn-circle btn-xs btn-primary"
                  aria-label="Remove attachment"
                  onclick={() => removeAttachment(fileId)}
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

        <form onsubmit={sendMessage} class="flex items-center gap-2">
          <Button
            variant="outline"
            class="btn-circle"
            aria-label="Attach files"
            loading={uploading}
            onclick={openAttachmentDialog}
          >
            +
          </Button>
          <Input
            placeholder="Type your message..."
            aria-label="Message"
            autocomplete="off"
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
