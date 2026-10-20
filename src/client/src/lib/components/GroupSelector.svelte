<script lang="ts">
  import { friends, user } from "#lib/stores.ts";
  import type { Group, PublicUser } from "#lib/types.ts";
  import { createGroup, deleteGroup, fetchGroups } from "#lib/api.ts";
  import { API_ROOT } from "#lib";
  import ContextMenu from "#lib/components/ContextMenu.svelte";
  import GroupConversation from "./GroupConversation.svelte";

  let selectedGroup = $state<Group>();
  let fetchedGroups = $state<Group[] | null>(null);

  let creatingGroup = $state<boolean>(false);

  let selectedFriends = $state<PublicUser[]>([]);
  let filteredFriends = $state<PublicUser[]>();

  let searchTerm = $state<string>();

  let show = $derived(!!$user);

  $effect(() => {
    window.location.pathname;
    (async () => {
      if ($user) fetchedGroups = await fetchGroups();
    })();
  });

  $effect(() => {
    if ($friends) {
      if (searchTerm) {
        filteredFriends = $friends.filter((friend) =>
          friend.username.toLowerCase().includes(searchTerm!.toLowerCase()),
        );
      } else filteredFriends = $friends.slice(0, 10);
    }
  });

  async function toggleGroupModal() {
    creatingGroup = !creatingGroup;
    const dialog = document.querySelector<HTMLDialogElement>(
      "#create_group_dialog",
    )!;

    if (creatingGroup) dialog?.showModal();
    else dialog?.close();
  }

  async function handleCreateGroup(event: MouseEvent) {
    event.preventDefault();
    document.querySelector<HTMLDialogElement>("#create_group_dialog")?.close();

    console.log(selectedFriends);
    const res = await createGroup(selectedFriends.map((friend) => friend.id));
    if (res.ok) fetchedGroups = await fetchGroups();

    selectedFriends = [];
    creatingGroup = false;
  }

  async function toggleFriendSelection(friend: any) {
    if (selectedFriends.includes(friend)) {
      selectedFriends = selectedFriends.filter((friend) => friend !== friend);
    } else {
      selectedFriends.push(friend);
    }
  }

  function generateContextMenuForGroup(group: any) {
    return [
      {
        label: "Delete",
        action: async () => {
          await deleteGroup(group.id);
          fetchedGroups = await fetchGroups();
        },
      },
    ];
  }

  async function onSelectItemForGroup(item: any, group: any) {
    await item.action();
  }
</script>

{#if show}
  <div class="fab">
    <div tabindex="0" role="button" class="btn btn-lg w-28 btn-primary">
      Groups
    </div>

    <button class="btn btn-lg btn-circle" onclick={toggleGroupModal}>+ </button>

    {#if fetchedGroups && fetchedGroups.length}
      {#each fetchedGroups as group}
        <ContextMenu
          items={generateContextMenuForGroup(group)}
          onselect={(item) => onSelectItemForGroup(item, group)}
        >
          <button
            class="btn btn-lg"
            onclick={() => {
              selectedGroup = group;
            }}
          >
            <div class="avatar-group -space-x-6">
              {#each [...group.members, $user!] as member}
                <div class="avatar">
                  <div class="w-12">
                    <img
                      src={member.avatarUrl
                        ? `${API_ROOT}${member.avatarUrl}`
                        : `/default-avatar.png`}
                      alt=""
                    />
                  </div>
                </div>
              {/each}
            </div>
          </button>
        </ContextMenu>
      {/each}
    {/if}
  </div>

  <dialog id="create_group_dialog" class="modal">
    <div class="modal-box gap-3 flex flex-col">
      <h3 class="text-lg font-bold">Create Group</h3>
      <!-- if there is a button in form, it will close the modal -->

      {#if $friends && !$friends.length}
        <p>No friends found. Search for one first.</p>
      {:else}
        <ul class="list bg-base-100 rounded-box shadow-md w-full">
          <input
            type="text"
            class="input input-sm outline-none border-accent m-2 w-85"
            placeholder="Search friends"
            bind:value={searchTerm}
          />

          {#each filteredFriends as user}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              class="list-row cursor-pointer {selectedFriends.includes(user)
                ? 'bg-red-100'
                : ''}"
              onclick={() => toggleFriendSelection(user)}
            >
              <div>
                <img
                  class="size-10 rounded-box"
                  alt="Tailwind CSS list item"
                  src={`${API_ROOT}/avatars/${user.id}`}
                />
              </div>
              <div>
                <div>{user.username}</div>
                <div class="text-xs uppercase font-semibold opacity-60">
                  {user.description || "No description"}
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="modal-action">
        <form method="dialog">
          {#if selectedFriends.length}
            <button class="btn" onclick={handleCreateGroup}>Create</button>
          {/if}
          <button class="btn" type="button" onclick={toggleGroupModal}
            >Cancel</button
          >
        </form>
      </div>
    </div>
  </dialog>

  {#if selectedGroup}
    <GroupConversation groupId={selectedGroup.id} />
  {/if}
{/if}
