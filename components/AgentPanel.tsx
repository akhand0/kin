"use client";

import type { AgentSummary } from "@/lib/agent";

// "What Kin did today" — the autonomous work, with escalations called out as
// the only thing the clinician actually has to act on.
export default function AgentPanel({
  summary,
  escalations,
}: {
  summary: AgentSummary | null;
  escalations: number;
}) {
  const s = summary ?? { triaged: 0, nudged: 0, called_back: 0, escalated: 0 };

  return (
    <section className="rounded-xl border border-kin-border bg-kin-panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-kin-text">
          <span className="kin-pulse text-kin-accent">◆</span>
          Kin · last 24 hours
        </h2>
        <span className="rounded-full bg-kin-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-kin-accent">
          autonomous
        </span>
      </div>

      <ul className="mt-3 space-y-1.5 text-sm text-kin-muted">
        <Line n={s.triaged} label="check-ins triaged" />
        <Line n={s.nudged} label="patients nudged about medication" />
        <Line n={s.called_back} label="quiet patients called back" />
      </ul>

      <div className="mt-4 border-t border-kin-border pt-3">
        {escalations === 0 ? (
          <p className="text-sm text-kin-calm">
            ✓ Nothing needs you. Kin handled the caseload.
          </p>
        ) : (
          <p className="text-sm font-medium text-kin-alert">
            ⚠ {escalations} escalated to you — Kin did not act. Clinical
            decision required.
          </p>
        )}
      </div>
    </section>
  );
}

function Line({ n, label }: { n: number; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={n > 0 ? "text-kin-calm" : "text-kin-border"}>✓</span>
      <span className={n > 0 ? "text-kin-text" : "text-kin-muted"}>
        {n} {label}
      </span>
    </li>
  );
}
