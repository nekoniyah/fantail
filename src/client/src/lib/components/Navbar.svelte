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

  // Highlights the menu entry for the page you're on
  const isActive = (href: string) =>
    page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<div
  class="navbar fixed top-0 z-100 h-30 border-b-2 border-neutral bg-base-100/90 px-4 backdrop-blur"
>
  <div class="navbar-start h-full">
    <a
      href="/"
      class="group flex items-center gap-2 font-display text-2xl font-bold text-base-content"
    >
      <span
        class="grid size-10 place-items-center rounded-full border-2 border-neutral bg-primary text-primary-content shadow-[0_3px_0_0_var(--color-neutral)] group-hover:animate-wiggle"
        aria-hidden="true"
      >
        F
      </span>
      Fantail
    </a>
  </div>
  <div class="navbar-end h-full gap-2">
    <UserSearch />

    <div class="dropdown dropdown-end">
      <button
        tabindex="0"
        class="btn btn-ghost btn-square size-16 p-1 transition-transform hover:-translate-y-0.5"
        aria-label="Account menu"
      >
        <span
          class="block size-14 overflow-hidden rounded-full border-2 border-neutral shadow-[0_3px_0_0_var(--color-neutral)]"
        >
          <img
            alt=""
            class="size-full object-cover"
            src={$user?.avatarUrl
              ? `${API_ROOT}${$user?.avatarUrl}`
              : "/default-avatar.png"}
          />
        </span>
      </button>
      {#if $notifications && $notifications.length}
        <div
          class="badge absolute top-6 right-6 flex items-center border-2 border-neutral badge-primary font-bold"
        >
          {$notifications.length}
        </div>
      {/if}
      <ul
        tabindex="-1"
        class="menu dropdown-content z-1 mt-3 w-52 gap-1 rounded-box border-2 border-neutral bg-base-100 p-2 shadow-[0_5px_0_0_var(--color-neutral)] menu-sm"
      >
      {#if $user}
        <li>
          <a
            class={["justify-between", isActive("/profile") && "menu-active"]}
            href="/profile"
            aria-current={isActive("/profile") ? "page" : undefined}
          >
            Profile
          </a>
        </li>
        <li>
          <a
            class={isActive("/invitations") ? "menu-active" : undefined}
            href="/invitations"
            aria-current={isActive("/invitations") ? "page" : undefined}
          >
            Friend Invitations
            {#if $invitations && $invitations.length}
              <span
                class="badge border-2 border-neutral badge-secondary font-bold"
                >{$invitations.length}</span
              >
            {/if}
          </a>
        </li>
        <li>
          <a
            class={isActive("/settings") ? "menu-active" : undefined}
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
          >
            Settings
          </a>
        </li>
        <li><a href="/logout">Logout</a></li>
      {:else}
        <li>
          <a
            class={isActive("/login") ? "menu-active" : undefined}
            href="/login">Login</a
          >
        </li>
        <li>
          <a
            class={isActive("/register") ? "menu-active" : undefined}
            href="/register">Register</a
          >
        </li>
      {/if}
      </ul>
    </div>
  </div>
</div>
