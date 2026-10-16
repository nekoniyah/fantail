<script lang="ts">
    import {page} from '$app/state';
    import {API_ROOT} from '#lib';
    import {invitations, sentInvitations, token, user} from "#lib/stores.ts";
    import {
        createFriendRequest,
        fetchFilteredUsers,
        fetchInvitations,
        fetchMe,
        fetchSentInvitations
    } from "#lib/api.ts";

    let searchFieldValue = $state<string>()

    // Re-check on every navigation, since login/logout change localStorage then navigate.
    $effect(() => {
        page.url.pathname;

        const localToken = localStorage.getItem('token');
        token.set(localToken)
    });


    $effect(() => {
        $token;
        (async () => {
            const data = await fetchMe();
            if (data) user.set(data);

            fetchSentInvitations().then(async r => await r.json()).then(sentInvitations.set)
            fetchInvitations().then(async r => await r.json()).then(invitations.set)
        })()
    })

    async function addFriend(userId: string) {
        await createFriendRequest(userId);
        fetchSentInvitations().then(async r => await r.json()).then(sentInvitations.set)
    }
</script>

<div class="navbar bg-base-100 h-30 shadow-sm fixed">
    <div class="navbar-start h-full">
        <a class="btn btn-ghost text-xl" href="/">Fantail</a>
    </div>
    <div class="navbar-end gap-2 h-full">
        <input type="text" placeholder="Search" class="input w-100" bind:value={searchFieldValue}/>

        {#if searchFieldValue}
            <ul class="list bg-base-100 rounded-box shadow-md absolute w-100 top-20 right-20">
                <li class="p-4 pb-2 text-xs opacity-60 tracking-wide">Users</li>

                {#await fetchFilteredUsers(searchFieldValue) then users}
                    {#each users as user}
                        <li class="list-row">
                            <div>
                                <img class="size-10 rounded-box" alt="Tailwind CSS list item"
                                     src={`${API_ROOT}/avatars/${user.id}`}
                                />
                            </div>
                            <div>
                                <div>{user.username}</div>
                                <div class="text-xs uppercase font-semibold opacity-60">{user.description || 'No description'}</div>
                            </div>
                            {#if $sentInvitations && $sentInvitations.find(i => i.targetId === user.id)}
                                <button class="btn btn-square btn-ghost w-full px-2 disabled" disabled>
                                    Pending
                                </button>
                            {:else}
                                <button class="btn btn-square btn-ghost w-full px-2" onclick={() => addFriend(user.id)}>
                                    Add
                                </button>
                            {/if}

                        </li>

                    {/each}
                {/await}
            </ul>
        {/if}
        <div class="dropdown dropdown-end">
            <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar">
                <div class="w-20 rounded-full">
                    <img alt="" src={$user ? `${API_ROOT}/avatars/${$user?.id}` : '/default-avatar.png'}/>
                </div>
                {#if $invitations}
                    <div class="badge badge-error absolute flex items-center top-7 right-7">{$invitations.length}</div>
                {/if}
            </div>
            <ul tabindex="-1"
                class="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow">
                {#if $user}
                    <li>
                        <!-- svelte-ignore a11y_missing_attribute -->
                        <a class="justify-between" href="/profile">
                            Profile
                        </a>
                    </li>
                    <li><a href="/invitations">Friend Invitations
                        {#if $invitations && $invitations.length}
                            <span class="badge">{$invitations.length}</span>
                        {/if}
                    </a></li>
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