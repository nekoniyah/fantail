<script lang="ts">
  import { friends, invitations, sentInvitations } from "#lib/stores.ts";
  import {
    fetchInvitations,
    fetchSentInvitations,
    fetchUser,
  } from "#lib/api.ts";
  import { API_ROOT } from "#lib";
  import { Button, Card } from "#lib/components/index.ts";

  type UserData = Awaited<ReturnType<typeof fetchUser>>;

  let error = $state<string>();
  let busy = $state<{ id: string; action: "accept" | "decline" | "cancel" }>();

  $effect(() => {
    (async () => {
      sentInvitations.set(await fetchSentInvitations());
      invitations.set(await fetchInvitations());
    })();
  });

  function removeInvitation(invitationId: string) {
    invitations.update((invitations) =>
      invitations
        ? invitations.filter((invitation) => invitation.id !== invitationId)
        : null,
    );
  }

  async function handleDecline(invitationId: string) {
    error = undefined;
    busy = { id: invitationId, action: "decline" };

    try {
      const response = await fetch(
        `${API_ROOT}/friends/invitations/${invitationId}`,
        {
          method: "DELETE",
        },
      );

      if (response.ok) {
        removeInvitation(invitationId);
      } else {
        error = "Could not decline the invitation. Please try again.";
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      busy = undefined;
    }
  }

  // Withdraws an invitation you sent (same endpoint as declining one)
  async function handleCancel(invitationId: string) {
    error = undefined;
    busy = { id: invitationId, action: "cancel" };

    try {
      const response = await fetch(
        `${API_ROOT}/friends/invitations/${invitationId}`,
        {
          method: "DELETE",
        },
      );

      if (response.ok) {
        sentInvitations.update((sent) =>
          sent
            ? sent.filter((invitation) => invitation.id !== invitationId)
            : null,
        );
      } else {
        error = "Could not cancel the invitation. Please try again.";
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      busy = undefined;
    }
  }

  // Takes the already-fetched sender, so the new friend is the person who
  // invited you (the old code looked the user up with the invitation id).
  async function handleAccept(invitationId: string, sender: UserData) {
    error = undefined;
    busy = { id: invitationId, action: "accept" };

    try {
      const response = await fetch(
        `${API_ROOT}/friends/invitations/${invitationId}`,
        {
          method: "POST",
        },
      );

      if (response.ok) {
        removeInvitation(invitationId);
        friends.set([...($friends ?? []), sender]);
      } else {
        error = "Could not accept the invitation. Please try again.";
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      busy = undefined;
    }
  }
</script>

{#snippet person(user: UserData, avatarSize: string)}
  <div class="avatar">
    <div class="{avatarSize} rounded-full border-2 border-neutral">
      <img
        src={user.avatarUrl
          ? `${API_ROOT}${user.avatarUrl}`
          : "/default-avatar.png"}
        alt=""
      />
    </div>
  </div>
  <div class="min-w-0 grow">
    <div class="truncate text-lg font-bold">
      {user.displayName || user.username}
    </div>
    {#if user.displayName}
      <div class="truncate text-sm text-base-content/60">@{user.username}</div>
    {/if}
  </div>
{/snippet}

<div class="mx-auto mt-40 flex w-full max-w-xl flex-col gap-8 px-4 pb-12">
  {#if error}
    <div
      role="alert"
      class="alert border-2 border-neutral alert-error font-bold"
    >
      {error}
    </div>
  {/if}

  <Card title="Sent Invitations" class="w-full">
    <div class="flex flex-col gap-3">
      {#each $sentInvitations ?? [] as invitation (invitation.id)}
        {#await fetchUser(invitation.targetId)}
          <div class="skeleton h-16 w-full rounded-box"></div>
        {:then user}
          <div
            class="flex items-center gap-3 rounded-box border-2 border-neutral bg-base-200 p-3 shadow-[0_3px_0_0_var(--color-neutral)]"
          >
            {@render person(user, "w-12")}
            <div class="flex items-center gap-2">
              <span
                class="badge border-2 border-neutral badge-secondary font-bold"
                >Pending</span
              >
              <Button
                size="sm"
                variant="outline"
                loading={busy?.id === invitation.id &&
                  busy?.action === "cancel"}
                disabled={busy?.id === invitation.id}
                onclick={() => handleCancel(invitation.id)}
              >
                Cancel
              </Button>
            </div>
          </div>
        {:catch}
          <p class="font-bold text-error">Couldn't load this user.</p>
        {/await}
      {:else}
        <p class="text-base-content/70">No sent invitations</p>
      {/each}
    </div>
  </Card>

  <Card title="Received Invitations" class="w-full">
    <div class="flex flex-col gap-3">
      {#each $invitations ?? [] as invitation (invitation.id)}
        {#await fetchUser(invitation.senderId)}
          <div class="skeleton h-24 w-full rounded-box"></div>
        {:then user}
          <div
            class="flex flex-wrap items-center gap-3 rounded-box border-2 border-neutral bg-base-200 p-3 shadow-[0_3px_0_0_var(--color-neutral)]"
          >
            {@render person(user, "w-16")}
            <div class="flex gap-2">
              <Button
                size="sm"
                loading={busy?.id === invitation.id &&
                  busy?.action === "accept"}
                disabled={busy?.id === invitation.id}
                onclick={() => handleAccept(invitation.id, user)}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy?.id === invitation.id &&
                  busy?.action === "decline"}
                disabled={busy?.id === invitation.id}
                onclick={() => handleDecline(invitation.id)}
              >
                Decline
              </Button>
            </div>
          </div>
        {:catch}
          <p class="font-bold text-error">Couldn't load this user.</p>
        {/await}
      {:else}
        <p class="text-base-content/70">Nobody requested you as friend yet!</p>
      {/each}
    </div>
  </Card>
</div>
