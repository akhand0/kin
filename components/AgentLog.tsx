"use client";

import type { AgentAction } from "@/lib/types";
import { shortDateTime } from "@/lib/format";

// The audit trail: every autonomous decision Kin made for this patient, with
// its reasoning. This is what makes an AI coordinator reviewable.
const META: Record<
  AgentAction["kind"],
  { label: string; color: string; icon: string }
> = {
  triaged: { label: "Triaged", color: "#7c9cff", icon: "◆" },
  nudged: { label: "Nudged patient", color: "#fbbf24", icon: "↻" },
  called_back: { label: "Called patient", color: "#fb923c", icon: "☎" },
  escalated: { label: "Escalated to you", color: "#f87171", icon: "⚠" },
};

export default function AgentLog({ actions }: { actions: AgentAction[] }) {
  const rows = [...actions]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 12);

  if (rows.length === 0) {
    return <p className="text-sm text-kin-muted">No agent activity yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {rows.map((a) => {
        const m = META[a.kind];
        return (
          <li key={a.id} className="flex gap-3">
            <span
              className="mt-0.5 text-xs"
              style={{ color: m.color }}
              aria-hidden
            >
              {m.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className="text-xs font-semibold"
                  style={{ color: m.color }}
                >
                  {m.label}
                </span>
                <span className="text-[11px] text-kin-muted">
                  {shortDateTime(a.ts)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-kin-muted">{a.rationale}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
