<script lang="ts">
  import { onMount } from "svelte";
  import { token, user } from "#lib/stores.ts";

  onMount(async () => {
    localStorage.removeItem("token");
    token.set(null);
    user.set(null);
    window.location.href = "/login";
  });
</script>
