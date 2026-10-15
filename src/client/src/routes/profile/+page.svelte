<script lang="ts">
    import {user} from "#lib/stores.ts";
    import {onMount} from "svelte";
    import {goto} from "$app/navigation";
    import {updateAvatar} from "#lib/api.ts";
    import {API_ROOT} from "#lib";

    let error = $state<string>()
    let success = $state<string>()

    async function handleAvatarClick(ev: MouseEvent) {
        const input = document.querySelector(".avatar-input") as HTMLInputElement;
        input.click();

        const fnInput = async (ev: Event) => {
            input.removeEventListener("change", fnInput)

            const target = ev.target as HTMLInputElement;
            const file = target.files?.[0];

            console.log(file)

            if (!file) return;

            const res = await updateAvatar(file);
            if (res.ok) {
                success = "Avatar updated"
            } else {
                error = "Failed to update avatar"
            }

        }

        input.addEventListener("change", fnInput)
    }

    onMount(async () => {
        if (!$user) {
            await goto("/login")
        }
    });

    async function handleUsernameEdit(ev: Event) {
        const target = ev.target as HTMLInputElement

        const res = await fetch(`${API_ROOT}/users/@me`, {
            method: "PUT",
            body: JSON.stringify({username: target.value}),
            headers: {
                "Content-Type": "application/json"
            }
        })

        if (res.ok) {
            success = "Username updated"
        } else {
            error = "Failed to update username"
        }

    }
</script>


{#if $user}
    <div class="flex items-center justify-center h-full w-full">
        <div class="card bg-base-100 w-96 shadow-sm">
            <input style="display: none" hidden class="avatar-input" type="file">

            <div class="card-body">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="avatar" onclick={handleAvatarClick}>
                    <div class="w-48 rounded-full">
                        <img alt="Tailwind-CSS-Avatar-component" src={`${API_ROOT}/avatars/${$user.id}`}/>
                    </div>
                </div>
                <input type="text" value={$user.username} class="input input-ghost card-title text-center text-4xl"
                       onblur={handleUsernameEdit}/>

            </div>


            {#if error}
                <p class="alert alert-error">
                    {error}
                </p>
            {/if}

            {#if success}
                <p class="alert alert-success">
                    {success}
                </p>
            {/if}
        </div>
    </div>
{/if}
