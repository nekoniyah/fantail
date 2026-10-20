<script lang="ts">
  import { API_ROOT } from "#lib";
  import { token } from "#lib/stores.ts";

  let error = $state<string>();
  let success = $state<string>();

  async function handleLogin(ev: MouseEvent) {
    ev.preventDefault();

    const fieldset = document.querySelector("fieldset") as HTMLFieldSetElement;

    const emailOrUsernameInput = fieldset.elements.namedItem(
      "emailOrUsername",
    ) as HTMLInputElement;
    const passwordInput = fieldset.elements.namedItem(
      "password",
    ) as HTMLInputElement;

    const res = await fetch(`${API_ROOT}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        emailOrUsername: emailOrUsernameInput.value,
        password: passwordInput.value,
      }),
    });

    const json = await res.json();
    if (res.ok) {
      success = "Login successful";
      localStorage.setItem("token", json.token);
      token.set(json.token);
    } else {
      error = json.message;
    }
  }
</script>

<div class="card text-neutral-content mx-auto top-50 w-xl">
  <div class="card-body items-center text-center w-full h-full">
    <fieldset
      class="fieldset border-base-300 rounded-box w-full h-full border p-4"
    >
      <legend class="fieldset-legend card-title">Login</legend>

      <label class="label" for="emailOrUsername">Email</label>
      <input
        type="text"
        class="input input-lg w-full"
        name="emailOrUsername"
        id="emailOrUsername"
        placeholder="Email or username"
      />

      <label class="label" for="password">Password</label>
      <input
        type="password"
        class="input input-lg w-full"
        name="password"
        id="password"
        placeholder="Password"
      />

      {#if error}
        <p>{error}</p>
      {/if}

      {#if success}
        <p>{success}</p>
      {/if}

      {#if !error && !success}
        <p>Don't have an account? <a href="/register">Register</a></p>
      {/if}

      <div class="justify-end">
        <button class="btn btn-neutral mt-4" onclick={handleLogin}>Login</button
        >
      </div>
    </fieldset>
  </div>
</div>
