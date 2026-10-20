<script lang="ts">
  import type { GroupMessage } from "#lib/types.ts";

  const { groupId }: { groupId: string } = $props();

  let messages = $state<GroupMessage[]>([]);
</script>
