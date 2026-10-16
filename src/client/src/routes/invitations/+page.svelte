<script lang="ts">
    import {invitations, sentInvitations} from "#lib/stores.ts";
    import {fetchUser} from "#lib/api.ts";
    import {API_ROOT} from "#lib";


    async function handleDecline(invitationId: string) {
        const response = await fetch(`${API_ROOT}/friends/invitations/${invitationId}`, {
            method: "DELETE",
        });
        if (response.ok) {
            invitations.update((invitations) => invitations.filter((invitation) => invitation.id !== invitationId));
        }
    }

    async function handleAccept(invitationId: string) {
        const response = await fetch(`${API_ROOT}/friends/invitations/${invitationId}`, {
            method: "POST",
        });
        if (response.ok) {
            invitations.update((invitations) => invitations.filter((invitation) => invitation.id !== invitationId));
        }
    }
</script>


<div class="card bg-base-100 card-md shadow-md mx-20 top-50 w-xl">
    <div class="card-body">
        <h2 class="card-title">Sent Invitations</h2>

        {#if !$sentInvitations.length}
            <p>No sent invitations</p>
        {/if}

        {#each $sentInvitations as invitation}
           <div class="invitation">
               {#await fetchUser(invitation.targetId) then user}
               	{user.username}
               {/await}
           </div>
        {/each}
    </div>
</div>

<div class="card bg-base-100 card-md shadow-md mx-20 top-60 w-xl">
    <div class="card-body">
        <h2 class="card-title">Received Invitations</h2>

        {#if !$invitations.length}
            <p>Nobody requested you as friend yet!</p>
        {/if}

        {#each $invitations as invitation}
            <div class="invitation flex items-center justify-around gap-10 border rounded-md p-2 shadow-inner w-full">
                {#await fetchUser(invitation.senderId) then user}
                    <div class="avatar">
                        <div class="w-24 rounded-full">
                            <img src={`${API_ROOT}/avatars/${user.id}`} alt="">
                        </div>
                    </div>
                    <h3 class="text-xl font-bold">{user.username}</h3>
                    <div class="flex flex-col gap-2 flex-end">
                        <button class="btn btn-primary" on:click={() => handleAccept(invitation.id)}>Accept</button>
                        <button class="btn btn-error" on:click={() => handleDecline(invitation.id)}>Decline</button>
                    </div>
                {/await}
            </div>
        {/each}
    </div>
</div>