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

  // Magic-link state
  const [email, setEmail] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const supa = supabaseBrowser();
    if (!supa || !email.trim()) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      const { error } = await supa.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setLinkError(error.message);
      } else {
        setLinkSent(true);
      }
    } catch {
      setLinkError("Couldn't send the link. Please try again.");
    } finally {
      setLinkBusy(false);
    }
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

          {/* Magic link */}
          {sso ? (
            linkSent ? (
              <div className="mt-5 rounded-lg border border-kin-calm/30 bg-kin-calm/10 px-4 py-3 text-sm text-kin-text">
                ✉️ Check your inbox — we sent a sign-in link to{" "}
                <span className="font-medium">{email}</span>. Open it on this
                device to continue.
                <button
                  onClick={() => {
                    setLinkSent(false);
                    setEmail("");
                  }}
                  className="mt-2 block text-xs text-kin-muted underline hover:text-kin-text"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={sendMagicLink} className="mt-5 space-y-2">
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                />
                {linkError && (
                  <p className="rounded-lg bg-kin-alert/10 px-3 py-2 text-sm text-kin-alert">
                    {linkError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={linkBusy || !email.trim()}
                  className="w-full rounded-lg bg-kin-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
                >
                  {linkBusy ? "Sending…" : "Email me a sign-in link"}
                </button>
              </form>
            )
          ) : (
            <p className="mt-5 rounded-lg border border-dashed border-kin-border px-3 py-2 text-center text-[11px] text-kin-muted">
              Email sign-in activates once Supabase Auth is configured.
            </p>
          )}

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-kin-border" />
            <span className="text-xs text-kin-muted">or use a password</span>
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
              className="w-full rounded-lg border border-kin-border px-4 py-2.5 text-sm font-medium text-kin-text transition hover:bg-kin-panel2 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in with password"}
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
