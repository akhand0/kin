import Link from "next/link";
import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";

// The hero heartbeat. Tells the whole story without a paragraph:
// a steady rhythm, three silent days, then the alert.
const RHYTHM: ("ok" | "nudge" | "quiet" | "alert")[] = [
  "ok", "ok", "ok", "nudge", "ok", "ok", "ok", "ok", "ok", "nudge",
  "ok", "ok", "ok", "ok", "ok", "ok", "quiet", "quiet", "quiet", "alert",
];

const HEIGHTS = [52, 68, 44, 60, 76, 50, 66, 58, 72, 46, 62, 80, 54, 70, 48, 64, 0, 0, 0, 96];

const TONE = {
  ok: "#4ade80",
  nudge: "#fbbf24",
  quiet: "transparent",
  alert: "#f87171",
};

export default async function Home() {
  // Reflect the session so a signed-in visitor can continue to their view
  // instead of being told to sign in again.
  const session = await getSession();
  const dest = session
    ? session.role === "clinician"
      ? "/dashboard"
      : "/talk"
    : "/login";

  return (
    <main className="relative min-h-screen overflow-hidden bg-kin-bg">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-14rem] h-[34rem] w-[52rem] -translate-x-1/2 rounded-full opacity-[0.18] blur-[110px]"
        style={{
          background:
            "radial-gradient(circle at 30% 40%, #7c9cff, transparent 60%), radial-gradient(circle at 70% 60%, #4ade80, transparent 60%)",
        }}
      />

      <nav className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-lg font-bold tracking-tight">Kin</span>
        {session ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-kin-muted sm:inline">
              {session.name}
            </span>
            <Link
              href={dest}
              className="rounded-full border border-kin-border px-4 py-1.5 text-sm text-kin-text transition hover:bg-kin-panel"
            >
              Continue →
            </Link>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-full border border-kin-border px-4 py-1.5 text-sm text-kin-text transition hover:bg-kin-panel"
          >
            Sign in
          </Link>
        )}
      </nav>

      <div className="relative mx-auto max-w-3xl px-6 pb-24 pt-10 text-center sm:pt-16">
        <h1
          className="kin-fade-up text-[2rem] font-bold leading-[1.08] tracking-tight text-kin-text sm:text-[2.75rem] lg:text-[3.5rem]"
          style={{ animationDelay: "60ms" }}
        >
          Listens when they talk.
          <br />
          <span className="text-kin-muted">Notices when they don&apos;t.</span>
        </h1>

        <p
          className="kin-fade-up mx-auto mt-6 max-w-md text-lg text-kin-muted"
          style={{ animationDelay: "160ms" }}
        >
          A voice companion for chronic patients — that tells your care team
          <span className="text-kin-text"> who needs you today.</span>
        </p>

        {/* the heartbeat */}
        <div
          className="kin-fade-up mx-auto mt-14 max-w-xl"
          style={{ animationDelay: "260ms" }}
        >
          <div className="flex h-24 items-end justify-center gap-[4px] sm:h-28 sm:gap-[6px]">
            {RHYTHM.map((tone, i) => {
              const delay = 380 + i * 55;
              if (tone === "quiet") {
                return (
                  <div
                    key={i}
                    className="kin-fade-up flex w-[10px] justify-center pb-[3px] sm:w-[14px]"
                    style={{ animationDelay: `${delay}ms` }}
                  >
                    <span className="h-[3px] w-[3px] rounded-full bg-kin-border" />
                  </div>
                );
              }
              const isAlert = tone === "alert";
              return (
                <div
                  key={i}
                  className={`w-[10px] rounded-full sm:w-[14px] ${isAlert ? "kin-flare" : "kin-rise"}`}
                  style={{
                    height: `${HEIGHTS[i]}%`,
                    background: TONE[tone],
                    animationDelay: `${delay}ms`,
                    boxShadow: isAlert ? "0 0 24px #f8717188" : undefined,
                  }}
                />
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-kin-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-kin-calm" /> patient rhythm
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-[3px] rounded-full bg-kin-border" />{" "}
              they go quiet
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-kin-alert" /> care team
              alerted
            </span>
          </div>
        </div>

        <div
          className="kin-fade-up mt-14 flex flex-wrap justify-center gap-3"
          style={{ animationDelay: "1500ms" }}
        >
          {session ? (
            <>
              <Link
                href={dest}
                className="rounded-full bg-kin-accent px-6 py-3 font-semibold text-black transition hover:opacity-90"
              >
                Continue to Kin →
              </Link>
              <SignOutButton className="rounded-full border border-kin-border px-6 py-3 font-medium text-kin-text transition hover:bg-kin-panel" />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full bg-kin-accent px-6 py-3 font-semibold text-black transition hover:opacity-90"
              >
                Sign in →
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-kin-border px-6 py-3 font-medium text-kin-text transition hover:bg-kin-panel"
              >
                I&apos;m a patient
              </Link>
            </>
          )}
        </div>

        <div
          className="kin-fade-up mt-20 grid gap-px overflow-hidden rounded-2xl border border-kin-border bg-kin-border sm:grid-cols-3"
          style={{ animationDelay: "1650ms" }}
        >
          <Pillar
            k="Pull"
            v="Patients talk, in their own language."
            dot="#7c9cff"
          />
          <Pillar k="Baseline" v="Kin learns each rhythm." dot="#4ade80" />
          <Pillar k="Triage" v="Only who needs you today." dot="#f87171" />
        </div>
      </div>
    </main>
  );
}

function Pillar({ k, v, dot }: { k: string; v: string; dot: string }) {
  return (
    <div className="bg-kin-panel px-5 py-6 text-left">
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: dot }}
        />
        <span className="text-sm font-semibold text-kin-text">{k}</span>
      </div>
      <p className="mt-1.5 text-sm text-kin-muted">{v}</p>
    </div>
  );
}
