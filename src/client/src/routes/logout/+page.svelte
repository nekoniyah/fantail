<script lang="ts">
  import { onMount } from "svelte";
  import { token, user } from "#lib/stores.ts";
  import { lockIdentity } from "#lib/crypto.ts";

  onMount(async () => {
    localStorage.removeItem("token");
    localStorage.removeItem("passphrase");
    token.set(null);
    user.set(null);
    lockIdentity();
    window.location.href = "/login";
  });
</script>
