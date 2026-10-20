<script lang="ts">
    import {API_ROOT} from "#lib";
    import {goto} from "$app/navigation";

    let error: string | null = $state(null);
    let success: string | null = $state(null);

    async function handleRegister(ev: MouseEvent) {
        ev.preventDefault()

        const fieldset = document.querySelector('fieldset') as HTMLFieldSetElement;

        const usernameInput = fieldset.elements.namedItem('username') as HTMLInputElement;
        const passwordInput = fieldset.elements.namedItem('password') as HTMLInputElement;
        const emailInput = fieldset.elements.namedItem('email') as HTMLInputElement;

        const res = await fetch(`${API_ROOT}/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({username: usernameInput.value, password: passwordInput.value, email: emailInput.value || undefined})
        })

        const data = await res.json();

        if (res.ok) {
            success = data.message ?? "Login successful";
            localStorage.setItem("token", data.token);
            window.location.assign("/profile");
        } else {
            error = data.message ?? "Login failed";
        }
    }
</script>

<div class="card text-neutral-content mx-auto top-50 w-xl">
    <div class="card-body items-center text-center w-full h-full">
        <fieldset class="fieldset border-base-300 rounded-box w-full h-full border p-4">
            <legend class="fieldset-legend card-title">Register</legend>

            <label class="label" for="username">Username</label>
            <input type="text" class="input input-lg w-full" name="username" id="username"
                   placeholder="Username" required/>

            <label class="label" for="password" >Password</label>
            <input type="password" class="input input-lg w-full" name="password" id="password" placeholder="Password" required />

            <label class="label" for="email">Email (optional)</label>
            <input type="email" name="email" class="input input-lg w-full" placeholder="Email (optional)"/>

            {#if error}
                <p>{error}</p>
            {/if}

            {#if success}
                <p>{success}</p>
            {/if}

            {#if !error && !success}
                <p>Already have an account? <a href="/login">Login</a></p>
            {/if}

            <div class="justify-end">
                <button class="btn btn-neutral mt-4" onclick={handleRegister}>Register</button>
            </div>
        </fieldset>
    </div>
</div>