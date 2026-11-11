<script lang="ts">
  import { friends, user } from "#lib/stores.ts";
  import type { Group, PublicUser } from "#lib/types.ts";
  import { createGroup, deleteGroup, fetchGroups } from "#lib/api.ts";
  import { API_ROOT } from "#lib";
  import ContextMenu from "#lib/components/ContextMenu.svelte";
  import { Button, EmptyState, Input } from "#lib/components/index.ts";

  let fetchedGroups = $state<Group[] | null>(null);

  let dialog = $state<HTMLDialogElement>();
  let selectedFriends = $state<PublicUser[]>([]);
  let searchTerm = $state("");
  let creating = $state(false);
  let error = $state<string>();

  let show = $derived(!!$user);

  // Without a search, only the first 10 friends are listed
  const filteredFriends = $derived.by(() => {
    if (!$friends) return [];

    const term = searchTerm.trim().toLowerCase();
    if (!term) return $friends.slice(0, 10);

    return $friends.filter(
      (friend) =>
        friend.username.toLowerCase().includes(term) ||
        friend.displayName?.toLowerCase().includes(term),
    );
  });

  $effect(() => {
    window.location.pathname;
    (async () => {
      if ($user) fetchedGroups = await fetchGroups();
    })();

    $inspect("fetched groups", fetchedGroups);
  });

  function openModal() {
    error = undefined;
    dialog?.showModal();
  }

  function closeModal() {
    dialog?.close();
  }

  // Runs however the dialog closes (Cancel, Esc, backdrop click, after creating)
  function handleClose() {
    selectedFriends = [];
    searchTerm = "";
    error = undefined;
  }

  async function handleCreateGroup() {
    if (!selectedFriends.length) return;

    error = undefined;
    creating = true;

    try {
      const res = await createGroup(selectedFriends.map((friend) => friend.id));

      if (res.ok) {
        fetchedGroups = await fetchGroups();
        closeModal();
      } else {
        error = "Could not create the group. Please try again.";
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      creating = false;
    }
  }

  const isSelected = (friend: PublicUser) =>
    selectedFriends.some((selected) => selected.id === friend.id);

  function toggleFriendSelection(friend: PublicUser) {
    selectedFriends = isSelected(friend)
      ? selectedFriends.filter((selected) => selected.id !== friend.id)
      : [...selectedFriends, friend];
  }

  function generateContextMenuForGroup(group: Group) {
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

  async function onSelectItemForGroup(item: any) {
    await item.action();
  }

  const groupLabel = (group: Group) =>
    `Open group with ${group.members.map((m) => m.displayName || m.username).join(", ")}`;
</script>

{#if show}
  <div class="fab">
    <div
      tabindex="0"
      role="button"
      class="btn w-28 rounded-full border-2 border-neutral btn-lg font-bold shadow-[0_4px_0_0_var(--color-neutral)] btn-primary"
    >
      Groups
    </div>

    <Button
      variant="secondary"
      size="lg"
      class="btn-circle"
      aria-label="Create group"
      onclick={openModal}
    >
      +
    </Button>

    {#if fetchedGroups && fetchedGroups.length}
      {#each fetchedGroups as group (group.id)}
        <ContextMenu
          items={generateContextMenuForGroup(group)}
          onselect={(item) => onSelectItemForGroup(item)}
        >
          <Button
            variant="outline"
            size="lg"
            class="h-auto px-3 py-2"
            aria-label={groupLabel(group)}
            onclick={() => {
              window.location.href = `/groups/${group.id}`;
            }}
          >
            <div class="avatar-group -space-x-6">
              {#each [...group.members, group.owner] as member (member.id)}
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
          </Button>
        </ContextMenu>
      {/each}
    {/if}
  </div>

  <dialog bind:this={dialog} class="modal" onclose={handleClose}>
    <div
      class="modal-box flex flex-col gap-3 rounded-box border-2 border-neutral shadow-[0_6px_0_0_var(--color-neutral)]"
    >
      <h3 class="font-display text-2xl font-bold">Create Group</h3>

      {#if $friends && !$friends.length}
        <EmptyState
          icon="🤝"
          title="No friends yet"
          description="Search for someone first and send them a friend request."
          class="py-6"
        />
      {:else}
        <Input
          placeholder="Search friends"
          aria-label="Search friends"
          autocomplete="off"
          bind:value={searchTerm}
        />

        <ul class="flex max-h-72 flex-col gap-2 overflow-y-auto p-1">
          {#each filteredFriends as friend (friend.id)}
            {@const selected = isSelected(friend)}
            <li>
              <label
                class={[
                  "flex cursor-pointer items-center gap-3 rounded-box border-2 border-neutral p-2 transition-colors",
                  selected ? "bg-secondary" : "bg-base-100 hover:bg-base-200",
                ]}
              >
                <img
                  class="size-10 rounded-box border-2 border-neutral object-cover"
                  alt=""
                  src={friend.avatarUrl
                    ? `${API_ROOT}${friend.avatarUrl}`
                    : "/default-avatar.png"}
                />
                <div class="min-w-0 grow">
                  <div class="truncate font-bold">
                    {friend.displayName || friend.username}
                  </div>
                  <div
                    class="truncate text-xs font-semibold text-base-content/60"
                  >
                    {friend.description || "No description"}
                  </div>
                </div>
                <input
                  type="checkbox"
                  class="checkbox border-2 checkbox-primary"
                  checked={selected}
                  onchange={() => toggleFriendSelection(friend)}
                />
              </label>
            </li>
          {:else}
            <li class="p-4 text-center text-base-content/70">
              No friends match “{searchTerm}”.
            </li>
          {/each}
        </ul>
      {/if}

      {#if error}
        <div
          role="alert"
          class="alert border-2 border-neutral alert-error font-bold"
        >
          {error}
        </div>
      {/if}

      <div class="modal-action mt-0">
        <Button variant="outline" onclick={closeModal}>Cancel</Button>
        <Button
          disabled={!selectedFriends.length}
          loading={creating}
          onclick={handleCreateGroup}
        >
          Create{selectedFriends.length ? ` (${selectedFriends.length})` : ""}
        </Button>
      </div>
    </div>

    <!-- Click outside the box to close -->
    <form method="dialog" class="modal-backdrop">
      <button aria-label="Close">close</button>
    </form>
  </dialog>
{/if}
