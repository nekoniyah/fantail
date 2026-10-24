<script lang="ts">
  import GroupConversation from "#lib/components/GroupConversation.svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<GroupConversation groupId={data.id} />
