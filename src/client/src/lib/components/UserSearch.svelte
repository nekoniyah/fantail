<script lang="ts">
  import { API_ROOT } from "#lib";
  import {
    createFriendRequest,
    fetchFilteredUsers,
    fetchSentInvitations,
  } from "#lib/api.ts";
  import { friends, sentInvitations } from "#lib/stores.ts";

  let searchFieldValue = $state<string>();

  async function addFriend(userId: string) {
    await createFriendRequest(userId);
    sentInvitations.set(await fetchSentInvitations());
  }
</script>

<input
  type="text"
  placeholder="Search"
  class="input w-100"
  bind:value={searchFieldValue}
/>

{#if searchFieldValue}
  <ul
    class="list bg-base-100 rounded-box shadow-md absolute w-100 top-20 right-20"
  >
    <li class="p-4 pb-2 text-xs opacity-60 tracking-wide">Users</li>

    {#await fetchFilteredUsers(searchFieldValue) then users}
      {#each users as user}
        <li class="list-row">
          <div>
            <img
              class="size-10 rounded-box"
              alt="Tailwind CSS list item"
              src={user.avatarUrl
                ? `${API_ROOT}${user.avatarUrl}`
                : "/default-avatar.png"}
            />
          </div>
          <div>
            <div>{user.username}</div>
            <div class="text-xs uppercase font-semibold opacity-60">
              {user.description || "No description"}
            </div>
          </div>
          {#if $sentInvitations && $sentInvitations.find((i) => i.targetId === user.id)}
            <button
              class="btn btn-square btn-ghost w-full px-2 disabled"
              disabled
            >
              Pending
            </button>
          {:else}
            {#if $friends && $friends.find((f) => f.id === user.id)}
              <button
                class="btn btn-square btn-ghost w-full px-2 disabled"
                disabled
              >
                Friends
              </button>
            {:else}
              <button
                class="btn btn-square btn-ghost w-full px-2"
                onclick={() => addFriend(user.id)}
              >
                Add
              </button>
            {/if}
          {/if}
        </li>
      {/each}
    {/await}
  </ul>
{/if}
