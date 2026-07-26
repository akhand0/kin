// Anomaly rules — MVP, no ML. Pure functions over events + signals.
//
//   quiet_anomaly  — no pull event for longer than 2× the rolling median gap
//                    (minimum 48h).
//   loud_anomaly   — triage = red_flag, medicines missed twice in a row, or
//                    med_adherence = stopped.
//   unreachable    — two push attempts unanswered within 24h.
//
// Hard red flags are handled at triage time (they always escalate); here we
// surface them as high-severity loud anomalies too.

import { randomUUID } from "node:crypto";
import type { Alert, EngagementEvent, Patient, Signal } from "./types";

const HOUR = 3600 * 1000;

export function medianGapHours(pullEvents: EngagementEvent[]): number {
  const ts = pullEvents
    .filter((e) => e.direction === "pull")
    .map((e) => new Date(e.ts).getTime())
    .sort((a, b) => a - b)
    // rolling window: last ~14 gaps is plenty for a daily rhythm
    .slice(-15);
  if (ts.length < 2) return 24;
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) gaps.push((ts[i] - ts[i - 1]) / HOUR);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

// Real UUID so the alert satisfies the Supabase `uuid` column.
function newId(_kind: string, _patientId: string) {
  return randomUUID();
}

export interface AnomalyContext {
  patient: Patient;
  events: EngagementEvent[];
  signals: Signal[];
  openAlerts: Alert[];
  now?: number;
}

// Returns NEW alerts that should be created (already deduped against open ones).
export function detectAnomalies({
  patient,
  events,
  signals,
  openAlerts,
  now = Date.now(),
}: AnomalyContext): Alert[] {
  const out: Alert[] = [];
  const hasOpen = (kind: Alert["kind"]) =>
    openAlerts.some((a) => a.patient_id === patient.id && a.kind === kind && a.status === "open");

  const pulls = events
    .filter((e) => e.patient_id === patient.id && e.direction === "pull")
    .sort((a, b) => a.ts.localeCompare(b.ts));

  // ── quiet_anomaly ────────────────────────────────────────────
  if (pulls.length > 0 && !hasOpen("quiet_anomaly")) {
    const median = medianGapHours(pulls);
    const threshold = Math.max(48, 2 * median);
    const lastPull = new Date(pulls[pulls.length - 1].ts).getTime();
    const gapH = (now - lastPull) / HOUR;
    if (gapH > threshold) {
      const days = Math.round(gapH / 24);
      out.push({
        id: newId("quiet", patient.id),
        patient_id: patient.id,
        kind: "quiet_anomaly",
        severity: 3,
        context: `No check-in from ${patient.name} for ${
          days >= 1 ? `${days} day${days > 1 ? "s" : ""}` : `${Math.round(gapH)}h`
        } (usual gap ~${Math.round(median)}h).`,
        suggested_action: `Call patient to re-establish contact.`,
        status: "open",
        created_at: new Date(now).toISOString(),
        resolved_at: null,
      });
    }
  }

  // ── unreachable ──────────────────────────────────────────────
  if (!hasOpen("unreachable")) {
    const failedPushes = events.filter(
      (e) =>
        e.patient_id === patient.id &&
        e.direction === "push" &&
        !e.answered &&
        now - new Date(e.ts).getTime() <= 24 * HOUR,
    );
    if (failedPushes.length >= 2) {
      out.push({
        id: newId("unreachable", patient.id),
        patient_id: patient.id,
        kind: "unreachable",
        severity: 4,
        context: `${failedPushes.length} follow-up attempts to ${patient.name} went unanswered in the last 24h.`,
        suggested_action: `Attempt direct contact; consider welfare check.`,
        status: "open",
        created_at: new Date(now).toISOString(),
        resolved_at: null,
      });
    }
  }

  // ── loud_anomaly ─────────────────────────────────────────────
  if (!hasOpen("loud_anomaly")) {
    const mySignals = signals
      .filter((s) => s.patient_id === patient.id)
      .sort((a, b) => a.ts.localeCompare(b.ts));
    const latest = mySignals[mySignals.length - 1];
    const lastTwo = mySignals.slice(-2);

    let loud: { severity: number; context: string; action: string | null } | null =
      null;

    if (latest?.triage === "red_flag") {
      loud = {
        severity: 5,
        context:
          latest.red_flags.length > 0
            ? `Red flag from ${patient.name}: ${latest.red_flags.join(", ")}. ${latest.summary_en}`
            : `Red flag from ${patient.name}. ${latest.summary_en}`,
        action: latest.suggested_action,
      };
    } else if (latest?.med_adherence === "stopped") {
      loud = {
        severity: 4,
        context: `${patient.name} appears to have stopped medication. ${latest.summary_en}`,
        action: latest.suggested_action ?? "Discuss why medication was stopped.",
      };
    } else if (
      lastTwo.length === 2 &&
      lastTwo.every((s) => s.med_adherence === "missed")
    ) {
      loud = {
        severity: 3,
        context: `${patient.name} missed medication two check-ins in a row.`,
        action: "Check in about the missed doses.",
      };
    }

    if (loud) {
      out.push({
        id: newId("loud", patient.id),
        patient_id: patient.id,
        kind: "loud_anomaly",
        severity: loud.severity,
        context: loud.context,
        suggested_action: loud.action,
        status: "open",
        created_at: new Date(now).toISOString(),
        resolved_at: null,
      });
    }
  }

  return out;
}
