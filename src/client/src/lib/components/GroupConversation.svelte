<script lang="ts">
  import { API_ROOT } from "#lib";
  import { uploadAttachment } from "#lib/api.ts";
  import getSocket from "#lib/io.ts";
  import { token, user } from "#lib/stores.ts";
  import type { GroupMessage } from "#lib/types.ts";
  import ContextMenu from "./ContextMenu.svelte";

  const { groupId }: { groupId: string } = $props();
  let valid = $state(false);

  let messages = $state<GroupMessage[]>([]);

  $effect(() => {
    if ($user && $token) {
      const socket = getSocket();

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

      socket.on("group:messages:send", async (message: GroupMessage) => {
        messages = [...messages, message];
      });

      socket.on("group:messages:delete", async (messageId: string) => {
        messages = messages.filter((message) => message.id !== messageId);
      });
    }
  });

  let uploadedFileIds = $state<string[]>([]);

  async function sendMessage(event: SubmitEvent) {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);
    const content = formData.get("content") as string;

    const socket = getSocket();
    socket.emit("group:messages:send", content, uploadedFileIds);

    (event.target as HTMLFormElement).reset();
    uploadedFileIds = [];
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
    const fileInput = document.querySelector("#file") as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (!files) return;

    for (let file of files) {
      const r = await uploadAttachment(file);

      if ("media" in r) {
        uploadedFileIds = [...uploadedFileIds, r.media.id];
      }
    }
  }
</script>

{#if valid}
  <input
    type="file"
    name="file"
    id="file"
    style="display: none;"
    onchange={handleFileChange}
    min="1"
    max="20"
    maxlength="20"
  />

  <div
    class="messages bottom-30 w-full h-[calc(100vh-120px-60px-60px)] overflow-y-scroll absolute"
  >
    {#key messages.length}
      {#each messages as message (message.id)}
        <ContextMenu
          items={generateContextMenuForMessage(message)}
          onselect={(item) => onSelectItemForMessage(item)}
        >
          <div class="chat chat-start w-full">
            <div class="chat-image avatar">
              <div class="w-10 rounded-full">
                <img
                  alt=""
                  src={message.sender.avatarUrl
                    ? `${API_ROOT}${message.sender.avatarUrl}`
                    : "/default-avatar.png"}
                />
              </div>
            </div>
            <div class="chat-header">
              {message.sender.displayName || message.sender.username}
              <time class="text-xs opacity-50">{message.createdAt}</time>
            </div>
            <div class="chat-bubble">
              {message.content}
            </div>
          </div>
        </ContextMenu>

        {#if message.attachments.length > 0}
          <div class="attachments flex relative left-[3vw] w-fit">
            {#each message.attachments as attachment (attachment.id)}
              <img
                src={`${API_ROOT}/files/${attachment.id}`}
                alt="Attachment"
                class="w-100 object-contain"
              />
            {/each}
          </div>
        {/if}
      {/each}
    {/key}
  </div>

  <div
    class="flex flex-col items-center justify-start absolute bottom-0 w-full p-4 bg-gray-100"
  >
    <div
      class="file-previews flex flex-row items-center justify-start w-full overflow-x-auto"
    >
      {#each uploadedFileIds as fileId (fileId)}
        <div class="file-preview">
          <img
            src={`${API_ROOT}/files/${fileId}`}
            alt="Uploaded file preview"
            class="w-20 h-20 object-cover"
          />
        </div>
      {/each}
    </div>

    <form
      onsubmit={sendMessage}
      class="flex items-center justify-start w-full p-4 bg-gray-100"
    >
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button
        type="button"
        class="btn btn-ghost mr-2"
        onclick={openAttachmentDialog}
      >
        +
      </button>
      <input
        type="text"
        name="content"
        placeholder="Type your message..."
        class="input input-bordered w-[80%] mr-2"
      />
      <button type="submit" class="btn btn-primary">Send</button>
    </form>
  </div>
{/if}

{#if !valid}
  <div class="absolute top-50 left-20">
    <div class="text-gray-500">
      You might not be logged in. <a href="/login" class="link link-primary"
        >Login</a
      >.
    </div>
  </div>
{/if}
