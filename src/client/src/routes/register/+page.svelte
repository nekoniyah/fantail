<script lang="ts">
  import { API_ROOT } from "#lib";
  import { Button, Card, Input, Link } from "#lib/components/index.ts";

  let username = $state("");
  let password = $state("");
  let email = $state("");

  let error: string | null = $state(null);
  let success: string | null = $state(null);
  let loading = $state(false);

  async function handleRegister(ev: SubmitEvent) {
    ev.preventDefault();

    error = null;
    success = null;
    loading = true;

    try {
      const res = await fetch(`${API_ROOT}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          email: email || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        success = data.message ?? "Registration successful";
        localStorage.setItem("token", data.token);

        window.location.href = "/profile";
      } else {
        error = data.message ?? "Registration failed";
      }
    } catch {
      error = "Could not reach the server. Please try again.";
    } finally {
      loading = false;
    }
  }
</script>

<div class="mx-auto mt-[30vh] w-full max-w-xl px-4">
  <Card title="Register" class="w-full">
    <form onsubmit={handleRegister} class="flex flex-col gap-1">
      <Input
        label="Username"
        name="username"
        placeholder="Username"
        size="lg"
        autocomplete="username"
        required
        bind:value={username}
      />

      <Input
        label="Password"
        name="password"
        type="password"
        placeholder="Password"
        size="lg"
        autocomplete="new-password"
        required
        bind:value={password}
      />

      <Input
        label="Email (optional)"
        name="email"
        type="email"
        placeholder="you@example.com"
        size="lg"
        autocomplete="email"
        bind:value={email}
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

      <Button type="submit" size="lg" block {loading} class="mt-4"
        >Register</Button
      >

      <p class="mt-4 text-center">
        Already have an account? <Link href="/login">Login</Link>
      </p>
    </form>
  </Card>
</div>
