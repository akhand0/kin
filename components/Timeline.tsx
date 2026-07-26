"use client";

import type { Signal } from "@/lib/types";
import { shortDateTime, TRIAGE_COLOR, TRIAGE_LABEL } from "@/lib/format";

const ADHERENCE_LABEL: Record<string, string> = {
  taken: "Meds taken",
  missed: "Dose missed",
  stopped: "Meds stopped",
  unclear: "Meds unclear",
  na: "",
};

// The care timeline — most recent check-ins first.
export default function Timeline({ signals }: { signals: Signal[] }) {
  const rows = [...signals].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 20);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-kin-muted">No check-ins yet.</p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-kin-border pl-5">
      {rows.map((s) => (
        <li key={s.id} className="relative">
          <span
            className="absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-kin-panel"
            style={{ background: TRIAGE_COLOR[s.triage] }}
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="text-xs font-semibold"
              style={{ color: TRIAGE_COLOR[s.triage] }}
            >
              {TRIAGE_LABEL[s.triage]}
            </span>
            <span className="text-xs text-kin-muted">
              · {shortDateTime(s.ts)}
            </span>
            {s.language && s.language !== "en" && (
              <span className="rounded bg-kin-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-kin-muted">
                {s.language}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-kin-text">{s.summary_en}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {s.med_adherence !== "na" && ADHERENCE_LABEL[s.med_adherence] && (
              <Chip
                text={ADHERENCE_LABEL[s.med_adherence]}
                tone={s.med_adherence === "taken" ? "calm" : "warn"}
              />
            )}
            {s.symptoms.map((sym, i) => (
              <Chip key={i} text={`${sym.name}${sym.new ? " (new)" : ""}`} tone="warn" />
            ))}
            {s.mood !== "ok" && s.mood !== "unclear" && (
              <Chip text={`mood: ${s.mood}`} tone="warn" />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Chip({ text, tone }: { text: string; tone: "calm" | "warn" }) {
  const color = tone === "calm" ? "#4ade80" : "#fbbf24";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px]"
      style={{ background: `${color}1a`, color }}
    >
      {text}
    </span>
  );
}
