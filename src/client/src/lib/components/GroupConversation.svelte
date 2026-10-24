<script lang="ts">
  import { API_ROOT } from "#lib";
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

  async function sendMessage(event: SubmitEvent) {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);
    const content = formData.get("content") as string;

    if (!content.trim()) return;

    const socket = getSocket();
    socket.emit("group:messages:send", content);

    (event.target as HTMLFormElement).reset();
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
</script>

{#if valid}
  <div class="messages absolute bottom-30 left-20 w-full">
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
                  alt="Tailwind CSS chat bubble component"
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
      {/each}
    {/key}
  </div>

  <form
    onsubmit={sendMessage}
    class="flex items-center justify-start absolute bottom-0 w-full p-4 bg-gray-100"
  >
    <input
      type="text"
      name="content"
      placeholder="Type your message..."
      class="input input-bordered w-[80%] mr-2"
    />
    <button type="submit" class="btn btn-primary">Send</button>
  </form>
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
