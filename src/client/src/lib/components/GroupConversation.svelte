<script lang="ts">
    import {token, user} from "#lib/stores.ts";
    import type {Group, PublicUser} from "#lib/types.ts";
    import {API_ROOT} from "#lib";

    let selectedGroup = $state<Group>()
    let fetchedGroups = $state<Group[]>()

    let creatingGroup = $state<boolean>(false)

    let selectedFriends = $state<PublicUser[]>([])
    let friends = $state<PublicUser[]>()
    let filteredFriends = $state<PublicUser[]>();

    let searchTerm = $state<string>();

    let show = $derived(!!$user);

    $effect(() => {
        if ($user) {
            fetch(`${API_ROOT}/groups`, {
                headers: {
                    "Authorization": `Bearer ${$token}`
                }
            }).then(res => res.json()).then(res => fetchedGroups = res)


            if (creatingGroup)
                fetch(`${API_ROOT}/friends`, {
                    headers: {
                        "Authorization": `Bearer ${$token}`
                    }
                }).then(res => res.json()).then(res => friends = res)
        }
    })


    async function handleCreateGroup(event: SubmitEvent) {
        event.preventDefault();
        selectedFriends = [];
        creatingGroup = false;
    }
</script>

{#if show}
    <div class="fab">
        <div tabindex="0" role="button" class="btn btn-lg w-28 btn-primary">Groups</div>

        {#if fetchedGroups && fetchedGroups.length}
            {#each fetchedGroups as group}
                <div> {group.name}
                    <button class="btn btn-lg btn-circle" onclick={() => selectedGroup = group}>Select</button>
                </div>
            {/each}
        {/if}


        <button class="btn btn-lg btn-circle"
                onclick={() => {
                    document.querySelector<HTMLDialogElement>("#create_group_dialog")?.showModal()
                    creatingGroup = true;
                }}>+
        </button>
    </div>

    <dialog id="create_group_dialog" class="modal">
        <div class="modal-box gap-3 flex flex-col">
            <h3 class="text-lg font-bold">Create Group</h3>
            <!-- if there is a button in form, it will close the modal -->


            {#if friends && !friends.length}
                <p>No friends found. Search for one first.</p>
            {:else}

                <input type="text" class="input input-bordered w-full " placeholder="Search friends"
                       bind:value={searchTerm}/>

                {#each filteredFriends as friend}
                    <div>
                        <label class="label">
                            <input type="checkbox" checked={selectedFriends.includes(friend)} class="checkbox"/>
                            {friend.username}
                        </label>
                    </div>
                {/each}

            {/if}

            <div class="modal-action">
                <form method="dialog" onsubmit={handleCreateGroup}>
                    {#if selectedFriends.length}
                        <button class="btn" type="submit">Create</button>
                    {/if}

                    <button class="btn" type="button" onclick={() => {
                         document.querySelector<HTMLDialogElement>("#create_group_dialog")?.close();creatingGroup = false}}>
                        Cancel
                    </button>
                </form>
            </div>
        </div>
    </dialog>
{/if}