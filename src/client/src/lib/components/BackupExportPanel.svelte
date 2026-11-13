<script lang="ts">
  import { onMount } from "svelte";
  import { user } from "#lib/stores.ts";
  import {
    getBackupPayload,
    copyText,
    downloadBackup,
    canExport,
    type BackupPayload,
  } from "#lib/backupExport.ts";
  import { Button, EmptyState } from "#lib/components/index.ts";

  let payload = $state<BackupPayload | null>(null);
  let hasIdentity = $state<boolean | null>(null);
  let copied = $state(false);
  let busy = $state(false);

  onMount(async () => {
    if (!$user) return;
    hasIdentity = await canExport($user.id);
    if (hasIdentity) await load();
  });

  async function load() {
    if (!$user) return;
    busy = true;
    try {
      payload = await getBackupPayload($user.id);
      hasIdentity = true;
    } catch {
      hasIdentity = false;
      payload = null;
    } finally {
      busy = false;
    }
  }

  async function handleCopy() {
    if (!payload) return;
    copied = await copyText(payload.backup);
    if (copied) setTimeout(() => (copied = false), 2000);
  }

  function handleDownload() {
    if (!payload || !$user) return;
    downloadBackup(payload.backup, $user.username);
  }
</script>

{#if hasIdentity === false}
  <EmptyState
    icon="🗝️"
    title="No encryption identity on this device"
    description="Create your keys by opening any encrypted group chat, or import a backup from another device there."
  />
{:else if !payload || busy}
  <div class="flex justify-center py-6">
    <span class="loading loading-spinner"></span>
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <h3 class="font-display text-lg font-bold">Device fingerprint</h3>
      <p class="text-sm text-base-content/70">
        Compare these blocks with the other device out of band (in person or
        with another trusted channel). They must match exactly.
      </p>
      <code
        class="rounded-box border-2 border-neutral bg-base-200 px-3 py-2 font-mono text-sm tracking-widest wrap-anywhere"
      >
        {payload.fingerprint}
      </code>
    </div>

    <div class="flex flex-col gap-1">
      <h3 class="font-display text-lg font-bold">Export backup</h3>
      <p class="text-sm text-base-content/70">
        Your keys, still encrypted with your passphrase. Import it on another
        device with the <em>same passphrase</em> to read your encrypted chats
        there. Anyone holding this backup can try to brute-force your
        passphrase, so keep the file private.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} onclick={handleDownload}>
          ⬇ Download backup
        </Button>
        <Button variant="outline" loading={busy} onclick={() => void handleCopy()}>
          {copied ? "✓ Copied" : "⧉ Copy to clipboard"}
        </Button>
      </div>
      {#if copied}
        <p role="status" class="text-sm font-bold text-success">
          Backup copied — paste it into the import box on your other device.
          Don't paste it into chats or untrusted apps.
        </p>
      {/if}
    </div>
  </div>
{/if}
