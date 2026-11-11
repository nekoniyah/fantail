<script lang="ts">
  import { user } from "#lib/stores.ts";
  import { updateAvatar, fetchMe } from "#lib/api.ts";
  import { API_ROOT } from "#lib";
  import {
    Button,
    Card,
    EmptyState,
    Input,
    Tabs,
    Textarea,
  } from "#lib/components/index.ts";
  import { page } from "$app/state";
  import { goto, replaceState } from "$app/navigation";

  type Field = "displayName" | "username" | "description";

  const fieldLabels: Record<Field, string> = {
    displayName: "Display name",
    username: "Username",
    description: "Description",
  };

  // To add a tab: add it here, then give it a panel in the markup below.
  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "emoji", label: "Emoji" },
    { id: "stickers", label: "Stickers" },
    { id: "ocs", label: "OCs" },
  ] as const;

  type TabId = (typeof tabs)[number]["id"];

  // Placeholders for tabs the backend doesn't support yet. Once a tab has real
  // data, replace its entry here with a dedicated panel in the markup.
  const comingSoon: Record<
    Exclude<TabId, "profile">,
    { icon: string; title: string; description: string }
  > = {
    emoji: {
      icon: "😀",
      title: "Custom emoji",
      description: "Upload your own emoji to use across Fantail.",
    },
    stickers: {
      icon: "🌟",
      title: "Stickers",
      description: "Collect and share stickers with your friends.",
    },
    ocs: {
      icon: "🎨",
      title: "Original characters",
      description: "Show off your OCs, each with a page of their own.",
    },
  };

  // The selected tab lives in the URL (?tab=emoji), so refreshing keeps it
  const tabIds: string[] = tabs.map((t) => t.id);
  const initialTab = page.url.searchParams.get("tab") ?? "";
  let tab = $state<TabId>(
    tabIds.includes(initialTab) ? (initialTab as TabId) : "profile",
  );

  function handleTabChange(id: TabId) {
    const url = new URL(page.url.href);
    url.searchParams.set("tab", id);
    goto(url, {});
  }

  let error = $state<string>();
  let success = $state<string>();

  let fileInput: HTMLInputElement | undefined = $state();

  function handleAvatarClick() {
    fileInput?.click();
  }

  async function handleAvatarChange(ev: Event) {
    const target = ev.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    error = undefined;
    success = undefined;

    const res = await updateAvatar(file);
    if (res.ok) {
      success = "Avatar updated";
      $user!.avatarUrl = `/avatars/${$user!.id}?t=${Date.now()}`;
    } else {
      error = "Failed to update avatar";
    }

    // Lets the same file be picked again later
    target.value = "";
  }

  // Saves one field when it loses focus, then re-reads the profile so the
  // page always shows what the server actually stored.
  async function saveField(field: Field, ev: Event) {
    const target = ev.target as HTMLInputElement | HTMLTextAreaElement;
    const value = target.value.trim();

    if (value === ($user?.[field] ?? "")) return;

    error = undefined;
    success = undefined;

    const res = await fetch(`${API_ROOT}/users/@me`, {
      method: "PUT",
      body: JSON.stringify({ [field]: value }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      error = `Failed to update ${fieldLabels[field].toLowerCase()}`;
      return;
    }

    const me = await fetchMe();
    if (me) user.set(me);

    if ((me?.[field] ?? "") === value) {
      success = `${fieldLabels[field]} updated`;
    } else {
      error = `${fieldLabels[field]} could not be changed`;
    }
  }
</script>

<div class="mx-auto mt-40 flex w-full max-w-lg flex-col gap-6 px-4 pb-12">
  {#if $user}
    <Tabs
      {tabs}
      bind:active={tab}
      idPrefix="profile-tabs"
      label="Profile sections"
      onchange={handleTabChange}
    />
  {/if}

  <Card class="w-full">
    {#if $user}
      <div
        role="tabpanel"
        id="profile-tabs-panel-{tab}"
        aria-labelledby="profile-tabs-tab-{tab}"
      >
        {#if tab === "profile"}
          <input
            bind:this={fileInput}
            onchange={handleAvatarChange}
            type="file"
            accept="image/*"
            class="hidden"
          />

          <div class="flex flex-col items-center gap-4">
            <button
              type="button"
              class="group avatar cursor-pointer rounded-full"
              onclick={handleAvatarClick}
              aria-label="Change avatar"
            >
              <div
                class="w-48 rounded-full border-2 border-neutral shadow-[0_5px_0_0_var(--color-neutral)] transition-transform group-hover:-translate-y-1"
              >
                <img
                  alt="Your avatar"
                  src={$user.avatarUrl
                    ? `${API_ROOT}${$user.avatarUrl}`
                    : "/default-avatar.png"}
                />
              </div>
              <span
                class="absolute inset-0 grid place-items-center rounded-full bg-neutral/60 font-display text-lg font-bold text-neutral-content opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                Change
              </span>
            </button>

            <div class="flex w-full flex-col gap-1">
              <Input
                label="Display name"
                hint="How your name appears to others."
                placeholder={$user.username}
                value={$user.displayName ?? ""}
                onblur={(ev: any) => saveField("displayName", ev)}
              />

              <Input
                label="Username"
                value={$user.username}
                autocomplete="username"
                onblur={(ev: any) => saveField("username", ev)}
              />

              <Textarea
                label="Description"
                hint="Tell people a bit about yourself. Saves when you click away."
                placeholder="Nothing here yet…"
                rows={4}
                value={$user.description ?? ""}
                onblur={(ev: any) => saveField("description", ev)}
              />
            </div>
          </div>

          {#if error}
            <div
              role="alert"
              class="alert mt-2 border-2 border-neutral alert-error font-bold"
            >
              {error}
            </div>
          {/if}

          {#if success}
            <div
              role="alert"
              class="alert mt-2 border-2 border-neutral alert-success font-bold"
            >
              {success}
            </div>
          {/if}
        {:else}
          {@const info = comingSoon[tab]}
          <EmptyState
            icon={info.icon}
            title={info.title}
            description={info.description}
          >
            <span
              class="badge border-2 border-neutral badge-secondary font-bold"
              >Coming soon</span
            >
          </EmptyState>
        {/if}
      </div>
    {:else}
      <h1 class="text-center text-3xl font-bold">
        Please log in to view your profile
      </h1>
      <Button
        size="lg"
        block
        class="mt-2"
        onclick={() => window.location.assign("/login")}
      >
        Login
      </Button>
    {/if}
  </Card>
</div>
