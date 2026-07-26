// Deterministic synthetic data: a care coordinator's caseload of 10 chronic
// patients with 30 days of engagement history, derived signals, and alerts.
// Used by the in-memory demo store and by scripts/seed.ts to populate Supabase.
// Deterministic so demos are stable.

import type {
  Alert,
  AgentAction,
  EngagementEvent,
  Patient,
  PeerConnection,
  PeerMessage,
  Prescription,
  Signal,
  TriageResult,
} from "./types";

// Demo password for every seeded patient. Shown on the login screen when
// running without Supabase — this is demo data, not a secret.
export const DEMO_PASSWORD = "kin1234";
export const DEMO_CLINICIAN = {
  id: "u_clinician",
  username: "clinician",
  name: "Dr. Sarah Okonkwo",
};

// Small seeded PRNG (mulberry32) for reproducible jitter.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

interface DayScript {
  transcript: string;
  triage: TriageResult;
}

const ON_TRACK_LINES: Record<string, string> = {
  en: "Feeling alright today. Took my morning tablets and had a short walk.",
  hi: "Sab theek hai. Subah ki dawai le li, thoda tehla bhi.",
  es: "Todo bien hoy. Tomé mis pastillas por la mañana y caminé un poco.",
  fr: "Ça va aujourd'hui. J'ai pris mes comprimés ce matin.",
  pt: "Tudo bem hoje. Tomei os meus comprimidos de manhã.",
  pl: "Wszystko w porządku. Rano wziąłem tabletki.",
};

const MISSED_LINES: Record<string, string> = {
  en: "Felt a bit tired today and forgot my midday tablet.",
  hi: "Aaj thodi thakan thi, dopahar ki dawai lena bhool gayi.",
  es: "Hoy me sentí cansado y olvidé la pastilla del mediodía.",
  fr: "J'étais fatigué aujourd'hui et j'ai oublié mon comprimé de midi.",
  pt: "Hoje senti-me cansado e esqueci-me do comprimido do meio-dia.",
  pl: "Byłem dziś zmęczony i zapomniałem o tabletce w południe.",
};

function onTrack(lang: string, name: string): DayScript {
  return {
    transcript: ON_TRACK_LINES[lang] ?? ON_TRACK_LINES.en,
    triage: {
      language: lang,
      med_adherence: "taken",
      symptoms: [],
      mood: "ok",
      red_flags: [],
      triage: "on_track",
      summary_en: `${name} checked in as usual — medicines taken, no new concerns.`,
      suggested_action: null,
    },
  };
}

function nudgeMissedDose(lang: string, name: string): DayScript {
  return {
    transcript: MISSED_LINES[lang] ?? MISSED_LINES.en,
    triage: {
      language: lang,
      med_adherence: "missed",
      symptoms: [{ name: "fatigue", severity: "mild", new: false }],
      mood: "ok",
      red_flags: [],
      triage: "nudge",
      summary_en: `${name} missed a dose and reported fatigue. No red flags.`,
      suggested_action: "Reinforce midday dose at next contact.",
    },
  };
}

export interface SeedData {
  patients: Patient[];
  events: EngagementEvent[];
  signals: Signal[];
  alerts: Alert[];
  agentActions: AgentAction[];
  prescriptions: Prescription[];
  peerConnections: PeerConnection[];
  peerMessages: PeerMessage[];
}

// Patients who've opted in to peer support (so the directory has content).
const PEER_OPTED_IN = new Set([
  "p_priya",
  "p_doreen",
  "p_wei",
  "p_miguel",
  "p_aisha",
  "p_fatima",
]);

// The caseload. `pattern` drives how each patient's 30-day history is built:
//   clean   — engaged right up to yesterday (ready for the live demo)
//   quiet   — stopped checking in N days ago
//   steady  — engaged throughout, with occasional nudge days
interface Spec {
  id: string;
  name: string;
  ref: string;
  username: string;
  language: string;
  timezone: string;
  conditions: string[];
  medicines: string[];
  pattern: "clean" | "quiet" | "steady";
  quietDays?: number;
  failedPushes?: number;
  nudgeOn?: number[]; // days-ago that should be a missed-dose check-in
}

const CASELOAD: Spec[] = [
  {
    id: "p_priya",
    name: "Priya Sharma",
    ref: "PT-1042",
    username: "priya",
    language: "hi",
    timezone: "Asia/Kolkata",
    conditions: ["Hypertension", "Type 2 diabetes"],
    medicines: ["Amlodipine 5mg", "Metformin 500mg"],
    pattern: "clean",
    nudgeOn: [18, 7],
  },
  {
    id: "p_miguel",
    name: "Miguel Torres",
    ref: "PT-1188",
    username: "miguel",
    language: "es",
    timezone: "Europe/Madrid",
    conditions: ["COPD"],
    medicines: ["Tiotropium inhaler", "Salbutamol (reliever)"],
    pattern: "quiet",
    quietDays: 3,
    failedPushes: 2,
  },
  {
    id: "p_aisha",
    name: "Aisha Khan",
    ref: "PT-1203",
    username: "aisha",
    language: "en",
    timezone: "Europe/London",
    conditions: ["Heart failure"],
    medicines: ["Bisoprolol 2.5mg", "Furosemide 40mg"],
    pattern: "quiet",
    quietDays: 4,
  },
  {
    id: "p_doreen",
    name: "Doreen Baptiste",
    ref: "PT-1067",
    username: "doreen",
    language: "en",
    timezone: "Europe/London",
    conditions: ["Type 2 diabetes"],
    medicines: ["Metformin 1g", "Gliclazide 40mg"],
    pattern: "steady",
    nudgeOn: [12],
  },
  {
    id: "p_wei",
    name: "Wei Chen",
    ref: "PT-1121",
    username: "wei",
    language: "en",
    timezone: "Europe/London",
    conditions: ["Hypertension"],
    medicines: ["Ramipril 5mg"],
    pattern: "steady",
  },
  {
    id: "p_fatima",
    name: "Fatima Al-Rashid",
    ref: "PT-1156",
    username: "fatima",
    language: "fr",
    timezone: "Europe/Paris",
    conditions: ["Asthma", "Type 2 diabetes"],
    medicines: ["Salbutamol inhaler", "Metformin 500mg"],
    pattern: "steady",
    nudgeOn: [21, 9],
  },
  {
    id: "p_samuel",
    name: "Samuel Okafor",
    ref: "PT-1094",
    username: "samuel",
    language: "en",
    timezone: "Europe/London",
    conditions: ["Chronic kidney disease (stage 3)"],
    medicines: ["Ramipril 10mg", "Atorvastatin 20mg"],
    pattern: "steady",
  },
  {
    id: "p_elena",
    name: "Elena Popescu",
    ref: "PT-1175",
    username: "elena",
    language: "pl",
    timezone: "Europe/Warsaw",
    conditions: ["Atrial fibrillation"],
    medicines: ["Apixaban 5mg", "Bisoprolol 1.25mg"],
    pattern: "steady",
    nudgeOn: [16],
  },
  {
    id: "p_grace",
    name: "Grace Mensah",
    ref: "PT-1138",
    username: "grace",
    language: "en",
    timezone: "Europe/London",
    conditions: ["Hypertension", "Osteoarthritis"],
    medicines: ["Amlodipine 10mg", "Paracetamol PRN"],
    pattern: "steady",
  },
  {
    id: "p_tomas",
    name: "Tomás Novák",
    ref: "PT-1210",
    username: "tomas",
    language: "pt",
    timezone: "Europe/Lisbon",
    conditions: ["COPD", "Type 2 diabetes"],
    medicines: ["Tiotropium inhaler", "Metformin 500mg"],
    pattern: "steady",
    nudgeOn: [5],
  },
];

export function buildSeed(now = Date.now()): SeedData {
  const patients: Patient[] = CASELOAD.map((s) => ({
    id: s.id,
    clinician_id: DEMO_CLINICIAN.id,
    name: s.name,
    patient_ref: s.ref,
    username: s.username,
    email: null,
    language: s.language,
    timezone: s.timezone,
    conditions: s.conditions,
    medicines: s.medicines,
    baseline_gap_hours: 24,
    peer_opt_in: PEER_OPTED_IN.has(s.id),
  }));

  const events: EngagementEvent[] = [];
  const signals: Signal[] = [];
  const alerts: Alert[] = [];
  const agentActions: AgentAction[] = [];
  const rand = rng(42);

  CASELOAD.forEach((spec, pi) => {
    const patient = patients[pi];
    // Where the history stops: `clean`/`steady` run to yesterday, `quiet`
    // patients stop N days ago so the gap is visible on load.
    const stopAt = spec.pattern === "quiet" ? (spec.quietDays ?? 3) : 1;
    let idx = 0;

    for (let d = 29; d >= stopAt; d--) {
      const script = spec.nudgeOn?.includes(d)
        ? nudgeMissedDose(spec.language, spec.name)
        : onTrack(spec.language, spec.name);

      const jitter = Math.floor(rand() * 3 * HOUR);
      const ts = new Date(
        now - d * DAY + 10 * HOUR - jitter,
      ).toISOString();
      const eventId = `evt_${spec.id}_${idx}`;

      events.push({
        id: eventId,
        patient_id: spec.id,
        ts,
        direction: "pull",
        channel: "voice_widget",
        answered: true,
        transcript: script.transcript,
        duration_s: 40 + Math.floor(rand() * 90),
      });

      const t = script.triage;
      signals.push({
        id: `sig_${spec.id}_${idx}`,
        event_id: eventId,
        patient_id: spec.id,
        ts,
        language: t.language,
        med_adherence: t.med_adherence,
        symptoms: t.symptoms,
        mood: t.mood,
        red_flags: t.red_flags,
        triage: t.triage,
        summary_en: t.summary_en,
        suggested_action: t.suggested_action,
      });
      idx++;
    }

    // Unanswered follow-up attempts (drives the `unreachable` rule).
    if (spec.failedPushes) {
      const hours = [20, 8].slice(0, spec.failedPushes);
      for (const hoursAgo of hours) {
        events.push({
          id: `evt_${spec.id}_push_${hoursAgo}`,
          patient_id: spec.id,
          ts: new Date(now - hoursAgo * HOUR).toISOString(),
          direction: "push",
          channel: "voice_widget",
          answered: false,
          transcript: null,
          duration_s: null,
        });
      }
    }

    // Kin logs a triage action for every check-in it classified. Only the
    // last few days are kept in the log to keep the audit view readable.
    signals
      .filter((sig) => sig.patient_id === spec.id)
      .slice(-4)
      .forEach((sig, i) => {
        agentActions.push({
          id: `act_${spec.id}_triaged_${i}`,
          patient_id: spec.id,
          ts: sig.ts,
          kind: "triaged",
          rationale: `Classified check-in as ${
            sig.triage === "red_flag"
              ? "a red flag"
              : sig.triage === "nudge"
                ? "needing a nudge"
                : "on track"
          }.`,
          alert_id: null,
        });
        if (sig.triage === "nudge") {
          agentActions.push({
            id: `act_${spec.id}_nudged_${i}`,
            patient_id: spec.id,
            ts: sig.ts,
            kind: "nudged",
            rationale:
              "Missed dose reported — Kin reminded the patient and will re-check tomorrow.",
            alert_id: null,
          });
        }
      });

    if (spec.pattern === "quiet") {
      const days = spec.quietDays ?? 3;

      if (spec.failedPushes) {
        // Kin worked the ladder and got nowhere — this one needs a human.
        const alertId = `alert_${spec.id}_unreachable`;
        alerts.push({
          id: alertId,
          patient_id: spec.id,
          kind: "unreachable",
          severity: 4,
          context: `${spec.name} has not checked in for ${days} days and did not answer ${spec.failedPushes} follow-up attempts from Kin.`,
          suggested_action: "Attempt direct contact; consider welfare check.",
          status: "open",
          created_at: new Date(now - 6 * HOUR).toISOString(),
          resolved_at: null,
        });
        spec.failedPushes &&
          [20, 8].slice(0, spec.failedPushes).forEach((h, i) => {
            agentActions.push({
              id: `act_${spec.id}_call_${i}`,
              patient_id: spec.id,
              ts: new Date(now - h * HOUR).toISOString(),
              kind: "called_back",
              rationale: `No check-in for longer than usual — Kin called the patient (attempt ${i + 1} of 2).`,
              alert_id: null,
            });
          });
        agentActions.push({
          id: `act_${spec.id}_escalated`,
          patient_id: spec.id,
          ts: new Date(now - 6 * HOUR).toISOString(),
          kind: "escalated",
          rationale:
            "Kin tried twice and got no answer — escalating rather than assuming everything is fine.",
          alert_id: alertId,
        });
      } else {
        // Kin is still working this one itself — no clinician involvement yet.
        agentActions.push({
          id: `act_${spec.id}_call_0`,
          patient_id: spec.id,
          ts: new Date(now - 5 * HOUR).toISOString(),
          kind: "called_back",
          rationale: `No check-in for ${days} days — Kin called the patient (attempt 1 of 2).`,
          alert_id: null,
        });
      }
    }
  });

  // A resolved escalation from two weeks ago — shows outcome history.
  alerts.push({
    id: "alert_doreen_past",
    patient_id: "p_doreen",
    kind: "loud_anomaly",
    severity: 3,
    context: "Doreen Baptiste missed diabetes medication two days running.",
    suggested_action: "Reviewed dosing routine; adherence recovered next day.",
    status: "resolved",
    created_at: new Date(now - 14 * DAY).toISOString(),
    resolved_at: new Date(now - 13 * DAY).toISOString(),
  });

  events.sort((a, b) => a.ts.localeCompare(b.ts));
  signals.sort((a, b) => a.ts.localeCompare(b.ts));
  agentActions.sort((a, b) => b.ts.localeCompare(a.ts));

  // One established peer connection with a little history (Priya ↔ Doreen),
  // so "Your connections" isn't empty in the demo.
  const pcId = "pc_priya_doreen";
  const peerConnections: PeerConnection[] = [
    {
      id: pcId,
      requester_id: "p_doreen",
      addressee_id: "p_priya",
      status: "accepted",
      created_at: new Date(now - 5 * DAY).toISOString(),
      updated_at: new Date(now - 5 * DAY).toISOString(),
    },
  ];
  const peerMessages: PeerMessage[] = [
    {
      id: "pm_1",
      connection_id: pcId,
      sender_id: "p_doreen",
      body: "Hi Priya! Kin suggested we connect — I've had type 2 for years, happy to share what's worked for me.",
      created_at: new Date(now - 5 * DAY + 3600 * 1000).toISOString(),
    },
    {
      id: "pm_2",
      connection_id: pcId,
      sender_id: "p_priya",
      body: "Thank you, that means a lot. How do you remember your evening dose?",
      created_at: new Date(now - 5 * DAY + 7200 * 1000).toISOString(),
    },
    {
      id: "pm_3",
      connection_id: pcId,
      sender_id: "p_doreen",
      body: "I keep the tablets next to the kettle — tea time is my reminder. 😊",
      created_at: new Date(now - 5 * DAY + 8000 * 1000).toISOString(),
    },
  ];

  return {
    patients,
    events,
    signals,
    alerts,
    agentActions,
    prescriptions: [],
    peerConnections,
    peerMessages,
  };
}
