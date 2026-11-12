<script lang="ts">
  import { onMount } from "svelte";
  import getSocket from "#lib/io.ts";
  import { identity, passphrase, user } from "#lib/stores.ts";
  import {
    hasStoredIdentity,
    setupIdentity,
    unlockIdentity,
    importIdentityBackup,
    deleteStoredIdentity,
    lockIdentity,
    WrongPassphraseError,
  } from "#lib/crypto.ts";
  import { Button, Input } from "#lib/components/index.ts";

  type Mode = "loading" | "unlock" | "setup" | "import";

  let mode = $state<Mode>("loading");

  let confirmation = $state("");
  let backup = $state("");
  let error = $state<string>();
  let busy = $state(false);

  let formUnlock = $state<HTMLFormElement>();

  onMount(async () => {
    const lsPassphrase = localStorage.getItem("passphrase");
    if (lsPassphrase) passphrase.set(lsPassphrase);

    mode = (await hasStoredIdentity($user!.id)) ? "unlock" : "setup";

    const inter = setInterval(() => {
      if (formUnlock && lsPassphrase) {
        clearInterval(inter);
        run(async () => {
          await unlockIdentity($user!.id, $passphrase);
          await finish(false);
        });
      }
    }, 1000);
  });

  $effect(() => {
    $passphrase;
    localStorage.setItem("passphrase", $passphrase);
  });

  function switchMode(next: Mode) {
    mode = next;
    error = undefined;
    passphrase.set((confirmation = backup = ""));
  }

  function registerKeys(): Promise<
    { ok: boolean; error?: string } | undefined
  > {
    const id = $identity!;
    return new Promise((resolve) =>
      getSocket().emit(
        "user:keys:register",
        id.publicKey,
        id.signingPublicKey,
        resolve,
      ),
    );
  }

  /**
   * The server only accepts the first registration. If the account already has
   * different keys, this device's identity is useless for it.
   */
  async function finish(deleteOnFail: boolean) {
    const res = await registerKeys();
    if (res?.ok) return; // $identity is set, the parent swaps this gate for the chat

    if (res?.error === "already-registered") {
      if (deleteOnFail) await deleteStoredIdentity($user!.id);
      else lockIdentity();
      switchMode("import");
      error =
        "Your account already has encryption keys from another device. Import the backup from that device.";
    } else {
      if (deleteOnFail) await deleteStoredIdentity($user!.id);
      else lockIdentity();
      error = "Couldn't register your keys with the server. Try again.";
    }
  }

  async function run(action: () => Promise<void>) {
    busy = true;
    error = undefined;
    try {
      await action();
    } catch (e) {
      error =
        e instanceof WrongPassphraseError
          ? "Wrong passphrase."
          : "Something went wrong. Check your input and try again.";
    } finally {
      busy = false;
    }
  }

  function submitSetup(event: SubmitEvent) {
    event.preventDefault();
    if ($passphrase.length < 8) {
      error = "Use at least 8 characters.";
      return;
    }
    if ($passphrase !== confirmation) {
      error = "The passphrases don't match.";
      return;
    }
    run(async () => {
      await setupIdentity($user!.id, $passphrase);
      await finish(true);
    });
  }

  function submitUnlock(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    run(async () => {
      await unlockIdentity($user!.id, $passphrase);
      await finish(false);
    });
  }

  function submitImport(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      await importIdentityBackup($user!.id, backup.trim(), $passphrase);
      await finish(true);
    });
  }
</script>

<div class="mx-auto mt-40 flex w-full max-w-md flex-col gap-4 px-4">
  <h2 class="text-2xl font-bold">🔒 Encrypted chats</h2>

  {#if mode === "unlock"}
    <p>Enter your passphrase to unlock your messages on this device.</p>
    <form
      onsubmit={submitUnlock}
      bind:this={formUnlock}
      class="flex flex-col gap-3"
    >
      <Input
        type="password"
        placeholder="Passphrase"
        aria-label="Passphrase"
        autocomplete="current-password"
        bind:value={$passphrase}
      />
      <Button type="submit" loading={busy}>Unlock</Button>
    </form>
    <button
      type="button"
      class="link text-left"
      onclick={() => switchMode("import")}
    >
      Use a backup from another device instead
    </button>
  {:else if mode === "setup"}
    <p>
      Messages are encrypted on your device. Your passphrase never leaves it,
      and if you forget it your message history can't be recovered.
    </p>
    <form onsubmit={submitSetup} class="flex flex-col gap-3">
      <Input
        type="password"
        placeholder="New passphrase"
        aria-label="New passphrase"
        autocomplete="new-password"
        bind:value={$passphrase}
      />
      <Input
        type="password"
        placeholder="Repeat passphrase"
        aria-label="Repeat passphrase"
        autocomplete="new-password"
        bind:value={confirmation}
      />
      <Button type="submit" loading={busy}>Create my keys</Button>
    </form>
    <button
      type="button"
      class="link text-left"
      onclick={() => switchMode("import")}
    >
      I already have a backup from another device
    </button>
  {:else if mode === "import"}
    <p>Paste the backup you exported from your other device.</p>
    <form onsubmit={submitImport} class="flex flex-col gap-3">
      <textarea
        class="textarea h-32 w-full font-mono text-xs"
        placeholder="Backup"
        aria-label="Backup"
        bind:value={backup}></textarea>
      <Input
        type="password"
        placeholder="Passphrase of that backup"
        aria-label="Backup passphrase"
        autocomplete="current-password"
        bind:value={$passphrase}
      />
      <Button type="submit" loading={busy}>Import</Button>
    </form>
    <button
      type="button"
      class="link text-left"
      onclick={() => switchMode("setup")}
    >
      Back
    </button>
  {/if}

  {#if error}
    <p role="alert" class="font-bold text-error">{error}</p>
  {/if}
</div>
