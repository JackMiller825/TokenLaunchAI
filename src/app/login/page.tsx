"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error || "Could not sign in.");
    router.push(params.get("next") || "/dashboard");
    router.refresh();
  }
  return (
    <form className="panel mx-auto mt-24 max-w-md p-6" onSubmit={submit}>
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Use the account created for this desk. Local development can sign the owner in automatically.
      </p>
      <label className="mt-4 block text-sm">
        Email
        <input className="field mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="mt-3 block text-sm">
        Password
        <input
          className="field mt-1"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />
      </label>
      <button className="btn btn-primary mt-4 w-full">Continue</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
