<script lang="ts">
    import {onMount} from "svelte";
    import {goto} from "$app/navigation";
    import {user} from "#lib/stores.ts";

    onMount(async () => {
        localStorage.removeItem("token");
        user.set(null)
        await goto("/login");
    })
</script>