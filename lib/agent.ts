// Kin, the AI care coordinator.
//
// The anomaly rules in anomaly.ts say *what* is happening. This module decides
// *who acts*: Kin handles routine coordination itself and escalates to a human
// clinician only when a clinical judgement is genuinely required.
//
//   nudge / missed doses      → Kin nudges the patient          (autonomous)
//   gone quiet                → Kin calls the patient back      (autonomous)
//   still unreachable after   → escalate to clinician
//     the ladder is exhausted
//   red flag / meds stopped   → escalate to clinician, Kin does NOT advise
//
// The invariant that keeps Kin out of medical-device territory: Kin never makes
// a clinical decision. It classifies, it chases, and it hands over.

import type {
  Alert,
  AgentAction,
  AgentActionKind,
  Patient,
  Signal,
} from "./types";

export interface AgentDecision {
  // What Kin does on its own authority.
  actions: Omit<AgentAction, "id" | "ts">[];
  // Alerts raised for the clinician. Empty means Kin handled it.
  escalations: Alert[];
  // Whether Kin should place an outbound check-in call to the patient.
  callPatient: boolean;
}

// Alerts that always require a human clinician.
const ESCALATING_KINDS: Alert["kind"][] = [
  "loud_anomaly",
  "unreachable",
  "care_request",
];

// Decide what Kin does with a fresh check-in signal.
export function decideOnSignal(
  patient: Patient,
  signal: Signal,
  candidateAlerts: Alert[],
): AgentDecision {
  const actions: Omit<AgentAction, "id" | "ts">[] = [
    {
      patient_id: patient.id,
      kind: "triaged",
      rationale: `Classified check-in as ${labelFor(signal.triage)}.`,
      alert_id: null,
    },
  ];

  const escalations = candidateAlerts.filter((a) =>
    ESCALATING_KINDS.includes(a.kind),
  );

  if (escalations.length > 0) {
    for (const a of escalations) {
      actions.push({
        patient_id: patient.id,
        kind: "escalated",
        rationale:
          a.kind === "loud_anomaly"
            ? "Clinical red flag — handed to the on-call clinician without advising the patient."
            : a.kind === "care_request"
              ? "Patient requested care-team contact — handed over for a human response."
              : "Patient unreachable after repeated attempts — handed to the on-call clinician.",
        alert_id: a.id,
      });
    }
  } else if (signal.triage === "nudge") {
    // Kin handles routine adherence slips itself.
    actions.push({
      patient_id: patient.id,
      kind: "nudged",
      rationale:
        signal.med_adherence === "missed"
          ? "Missed dose reported — Kin reminded the patient and will re-check tomorrow."
          : "Low mood or minor symptom — Kin acknowledged and scheduled a follow-up.",
      alert_id: null,
    });
  }

  return { actions, escalations, callPatient: false };
}

// Decide what Kin does with anomalies found by the scheduled sweep.
export function decideOnSweep(
  patient: Patient,
  candidateAlerts: Alert[],
  failedPushes: number,
): AgentDecision {
  const actions: Omit<AgentAction, "id" | "ts">[] = [];
  const escalations: Alert[] = [];
  let callPatient = false;

  for (const a of candidateAlerts) {
    if (a.kind === "quiet_anomaly") {
      // The push ladder: Kin reaches out first. Only once its own attempts are
      // exhausted does a human get involved.
      if (failedPushes >= 2) {
        escalations.push({
          ...a,
          kind: "unreachable",
          severity: 4,
          context: `${patient.name} has not checked in and did not answer ${failedPushes} follow-up attempts from Kin.`,
          suggested_action: "Attempt direct contact; consider welfare check.",
        });
        actions.push({
          patient_id: patient.id,
          kind: "escalated",
          rationale: `Kin tried ${failedPushes} times and got no answer — escalating rather than assuming everything is fine.`,
          alert_id: a.id,
        });
      } else {
        callPatient = true;
        actions.push({
          patient_id: patient.id,
          kind: "called_back",
          rationale: `No check-in for longer than usual — Kin called the patient (attempt ${failedPushes + 1} of 2).`,
          alert_id: null,
        });
      }
    } else if (ESCALATING_KINDS.includes(a.kind)) {
      escalations.push(a);
      actions.push({
        patient_id: patient.id,
        kind: "escalated",
        rationale:
          a.kind === "unreachable"
            ? "Patient unreachable after repeated attempts — handed to the on-call clinician."
            : "Clinical red flag — handed to the on-call clinician.",
        alert_id: a.id,
      });
    }
  }

  return { actions, escalations, callPatient };
}

function labelFor(t: Signal["triage"]): string {
  return t === "red_flag" ? "a red flag" : t === "nudge" ? "needing a nudge" : "on track";
}

// Roll the action log up into the "what Kin did today" summary.
export interface AgentSummary {
  triaged: number;
  nudged: number;
  called_back: number;
  escalated: number;
}

export function summarise(
  actions: AgentAction[],
  sinceMs = 24 * 3600 * 1000,
  now = Date.now(),
): AgentSummary {
  const recent = actions.filter(
    (a) => now - new Date(a.ts).getTime() <= sinceMs,
  );
  const count = (k: AgentActionKind) =>
    recent.filter((a) => a.kind === k).length;
  return {
    triaged: count("triaged"),
    nudged: count("nudged"),
    called_back: count("called_back"),
    escalated: count("escalated"),
  };
}
