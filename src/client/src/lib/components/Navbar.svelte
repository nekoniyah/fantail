<script lang="ts">
  import { page } from "$app/state";
  import { API_ROOT } from "#lib";
  import {
    friends,
    invitations,
    token,
    user,
    notifications,
  } from "#lib/stores.ts";

  import { fetchFriends, fetchMe, fetchNotifications } from "#lib/api.ts";
  import UserSearch from "./UserSearch.svelte";

  // Re-check on every navigation, since login/logout change localStorage then navigate.
  $effect(() => {
    page.url.pathname;

    const localToken = localStorage.getItem("token");
    token.set(localToken);
  });

  $effect(() => {
    $token;
    (async () => {
      const data = await fetchMe();
      if (data) user.set(data);

      friends.set(await fetchFriends());
      notifications.set(await fetchNotifications());
    })();
  });
</script>

<div class="navbar bg-base-100 h-30 shadow-sm fixed z-100">
  <div class="navbar-start h-full">
    <a class="btn btn-ghost text-xl" href="/">Fantail</a>
  </div>
  <div class="navbar-end gap-2 h-full">
    <UserSearch />

    <div class="dropdown dropdown-end">
      <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar">
        <div class="w-20 rounded-full">
          <img
            alt=""
            src={$user?.avatarUrl
              ? `${API_ROOT}${$user?.avatarUrl}`
              : "/default-avatar.png"}
          />
        </div>
        {#if $notifications && $notifications.length}
          <div
            class="badge badge-error absolute flex items-center top-7 right-7"
          >
            {$notifications.length}
          </div>
        {/if}
      </div>
      <ul
        tabindex="-1"
        class="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow"
      >
        {#if $user}
          <li>
            <!-- svelte-ignore a11y_missing_attribute -->
            <a class="justify-between" href="/profile"> Profile </a>
          </li>
          <li>
            <a href="/invitations"
              >Friend Invitations
              {#if $invitations && $invitations.length}
                <span class="badge">{$invitations.length}</span>
              {/if}
            </a>
          </li>
          <li><a href="/settings">Settings</a></li>
          <li><a href="/logout">Logout</a></li>
        {:else}
          <li><a href="/login">Login</a></li>
          <li><a href="/register">Register</a></li>
        {/if}
      </ul>
    </div>
  </div>
</div>
