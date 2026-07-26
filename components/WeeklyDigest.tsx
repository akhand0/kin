"use client";

import type { Alert, Signal } from "@/lib/types";

const WEEK = 7 * 24 * 3600 * 1000;

// A plain-English weekly summary for the coordinator's notes / handover.
export default function WeeklyDigest({
  signals,
  alerts,
  now = Date.now(),
}: {
  signals: Signal[];
  alerts: Alert[];
  now?: number;
}) {
  const week = signals.filter((s) => now - new Date(s.ts).getTime() <= WEEK);
  const checkins = week.length;
  const taken = week.filter((s) => s.med_adherence === "taken").length;
  const missed = week.filter((s) => s.med_adherence === "missed" || s.med_adherence === "stopped").length;
  const adherencePct =
    taken + missed > 0 ? Math.round((taken / (taken + missed)) * 100) : null;
  const symptomsMentioned = new Set(
    week.flatMap((s) => s.symptoms.map((x) => x.name)),
  );
  const openAlerts = alerts.filter((a) => a.status === "open").length;

  const lines: string[] = [];
  if (checkins === 0) {
    lines.push("No check-ins recorded this week.");
  } else {
    lines.push(
      `${checkins} check-in${checkins > 1 ? "s" : ""} this week.`,
    );
    if (adherencePct !== null) {
      lines.push(
        adherencePct >= 80
          ? `Self-reported adherence ${adherencePct}% — on track.`
          : `Self-reported adherence ${adherencePct}% — below target.`,
      );
    }
    if (symptomsMentioned.size > 0) {
      lines.push(`Symptoms reported: ${[...symptomsMentioned].join(", ")}.`);
    } else {
      lines.push("No new symptoms reported.");
    }
  }
  lines.push(
    openAlerts === 0
      ? "No open alerts."
      : `${openAlerts} open alert${openAlerts > 1 ? "s" : ""} — see above.`,
  );

  return (
    <div className="rounded-xl border border-kin-border bg-kin-panel2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-kin-text">
          7-day summary
        </span>
        <span className="rounded-full bg-kin-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-kin-muted">
          handover note
        </span>
      </div>
      <ul className="space-y-1.5 text-sm text-kin-muted">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-kin-accent">·</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
