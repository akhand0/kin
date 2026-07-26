"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        setSso(Boolean(j.sso));
        if (j.session) {
          router.replace(j.session.role === "clinician" ? "/dashboard" : "/talk");
        }
      })
      .catch(() => {});
  }, [router]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Login failed.");
        return;
      }
      router.replace(json.redirect);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithProvider(provider: "google" | "apple") {
    const supa = supabaseBrowser();
    if (!supa) return;
    setError(null);
    await supa.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-kin-bg px-5 py-10">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center text-2xl font-bold tracking-tight"
        >
          Kin
        </Link>

        <div className="rounded-2xl border border-kin-border bg-kin-panel p-6">
          <h1 className="text-lg font-semibold text-kin-text">Sign in</h1>
          <p className="mt-1 text-sm text-kin-muted">
            Your check-ins are private. Kin only shares what your care team
            needs to keep you safe.
          </p>

          {/* SSO */}
          <div className="mt-5 space-y-2">
            <ProviderButton
              label="Continue with Google"
              disabled={!sso}
              onClick={() => signInWithProvider("google")}
            />
            <ProviderButton
              label="Continue with Apple"
              disabled={!sso}
              onClick={() => signInWithProvider("apple")}
            />
            {!sso && (
              <p className="pt-1 text-center text-[11px] text-kin-muted">
                Single sign-on activates once Supabase Auth is configured.
              </p>
            )}
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-kin-border" />
            <span className="text-xs text-kin-muted">or</span>
            <span className="h-px flex-1 bg-kin-border" />
          </div>

          {/* Username + password */}
          <form onSubmit={signIn} className="space-y-3">
            <Field
              label="Username"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              placeholder="priya"
            />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
            />

            {error && (
              <p className="rounded-lg bg-kin-alert/10 px-3 py-2 text-sm text-kin-alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !username || !password}
              className="w-full rounded-lg bg-kin-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        {/* Demo credentials — only meaningful without a real auth backend. */}
        {!sso && (
          <div className="mt-4 rounded-xl border border-dashed border-kin-border bg-kin-panel/50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-kin-muted">
              Demo accounts
            </div>
            <div className="mt-2 space-y-1 text-xs text-kin-muted">
              <Row who="Patient" cred="priya / kin1234" />
              <Row who="Patient" cred="miguel / kin1234" />
              <Row who="Clinician" cred="clinician / kin1234" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ who, cred }: { who: string; cred: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{who}</span>
      <code className="text-kin-accent">{cred}</code>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-kin-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-kin-border bg-kin-bg px-3 py-2 text-sm text-kin-text placeholder:text-kin-muted focus:border-kin-accent focus:outline-none"
      />
    </label>
  );
}

function ProviderButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "Requires Supabase Auth" : undefined}
      className="w-full rounded-lg border border-kin-border bg-kin-panel2 px-4 py-2.5 text-sm font-medium text-kin-text transition hover:bg-kin-bg disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}
