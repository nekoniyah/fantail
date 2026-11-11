<script lang="ts">
  import { API_ROOT } from "#lib";
  import { token } from "#lib/stores.ts";
  import { Button, Card, Input, Link } from "#lib/components/index.ts";

  let emailOrUsername = $state("");
  let password = $state("");

  let error = $state<string>();
  let success = $state<string>();
  let loading = $state(false);

  async function handleLogin(ev: SubmitEvent) {
    ev.preventDefault();

    error = undefined;
    success = undefined;
    loading = true;

    try {
      let fantailPrivateKey = await cookieStore.get("fantail_private_key");

      if (!fantailPrivateKey) {
        const key = crypto.randomUUID();
        await cookieStore.set("fantail_private_key", key);
        await cookieStore.set(
          "fantail_expiration",
          String(60 * 60 * 24 * 1000),
        ); // 24 hours in milliseconds
      }

      const res = await fetch(`${API_ROOT}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailOrUsername,
          password,
        }),
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();
      if (res.ok) {
        success = "Login successful";
        localStorage.setItem("token", json.session.token);
        token.set(json.session.token);
        window.location.href = "/profile";
      } else {
        error = json.message ?? "Login failed";
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      loading = false;
    }
  }
</script>

<div class="mx-auto mt-[30vh] w-full max-w-xl px-4">
  <Card title="Login" class="w-full">
    <form onsubmit={handleLogin} class="flex flex-col gap-1">
      <Input
        label="Email or username"
        name="emailOrUsername"
        placeholder="Email or username"
        size="lg"
        autocomplete="username"
        required
        bind:value={emailOrUsername}
      />

      <Input
        label="Password"
        name="password"
        type="password"
        placeholder="Password"
        size="lg"
        autocomplete="current-password"
        required
        bind:value={password}
      />

      {#if error}
        <div
          role="alert"
          class="alert mt-2 border-2 border-neutral alert-error font-bold"
        >
          {error}
        </div>
      {/if}

      {#if success}
        <div
          role="alert"
          class="alert mt-2 border-2 border-neutral alert-success font-bold"
        >
          {success}
        </div>
      {/if}

      <Button type="submit" size="lg" block {loading} class="mt-4">Login</Button
      >

      <p class="mt-4 text-center">
        Don't have an account? <Link href="/register">Register</Link>
      </p>
    </form>
  </Card>
</div>
