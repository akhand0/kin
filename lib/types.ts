// Domain types — mirror the Supabase/Postgres schema in supabase/migrations.

export type MedAdherence = "taken" | "missed" | "stopped" | "unclear" | "na";
export type Mood = "ok" | "low" | "distressed" | "unclear";
export type Triage = "on_track" | "nudge" | "red_flag";
export type Direction = "pull" | "push";
export type Channel = "voice_widget" | "phone" | "whatsapp";
export type AlertKind = "quiet_anomaly" | "loud_anomaly" | "unreachable";
export type AlertStatus = "open" | "acked" | "resolved";

export interface Patient {
  id: string;
  clinician_id: string | null; // the clinician Kin escalates this patient to
  name: string;
  patient_ref: string; // clinic-facing reference, e.g. "PT-1042"
  username: string; // patient login handle (SSO users match on email instead)
  email: string | null; // set when the patient signs in via SSO
  language: string; // ISO code, e.g. "en", "hi", "es"
  timezone: string;
  conditions: string[];
  medicines: string[];
  baseline_gap_hours: number;
  peer_opt_in: boolean; // patient has opted in to peer support
}

// ── Peer support ────────────────────────────────────────────────
// Opted-in patients can browse each other (first name + condition), request a
// connection, and — once both consent — exchange text messages.
export type PeerStatus = "pending" | "accepted" | "declined";

export interface PeerConnection {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: PeerStatus;
  created_at: string;
  updated_at: string;
}

export interface PeerMessage {
  id: string;
  connection_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

// ── The AI coordinator ──────────────────────────────────────────
// Kin runs the caseload autonomously. Every decision it makes is logged as an
// AgentAction, so a clinician can audit what was handled without them.
export type AgentActionKind =
  | "triaged" // classified a check-in
  | "nudged" // reminded the patient (medication, appointment)
  | "called_back" // reached out after silence
  | "escalated"; // handed to a human clinician

export interface AgentAction {
  id: string;
  patient_id: string;
  ts: string;
  kind: AgentActionKind;
  rationale: string; // why Kin did this, in plain English
  alert_id: string | null; // set when kind === "escalated"
}

// A prescription the patient uploads (photo/PDF of their script). The clinician
// reviews it and updates the patient's `medicines`, then marks it reviewed.
export type PrescriptionStatus = "pending" | "reviewed" | "explained";

export interface Prescription {
  id: string;
  patient_id: string;
  file_name: string;
  mime_type: string;
  file_url: string; // data URL (demo) or storage URL — omitted from list payloads
  note: string | null; // optional note from the patient
  explanation: string | null; // Kin's plain-language explanation for the patient
  status: PrescriptionStatus;
  created_at: string;
  reviewed_at: string | null;
}

// Prescription without the (large) file body — used in list/bundle responses.
export type PrescriptionMeta = Omit<Prescription, "file_url">;

export interface EngagementEvent {
  id: string;
  patient_id: string;
  ts: string; // ISO timestamp
  direction: Direction;
  channel: Channel;
  answered: boolean;
  transcript: string | null;
  duration_s: number | null;
}

export interface Symptom {
  name: string;
  severity: "mild" | "moderate" | "severe";
  new: boolean;
}

export interface Signal {
  id: string;
  event_id: string;
  patient_id: string;
  ts: string;
  language: string;
  med_adherence: MedAdherence;
  symptoms: Symptom[];
  mood: Mood;
  red_flags: string[];
  triage: Triage;
  summary_en: string;
  suggested_action: string | null;
}

export interface Alert {
  id: string;
  patient_id: string;
  kind: AlertKind;
  severity: number; // 1 (info) .. 5 (critical)
  context: string;
  suggested_action: string | null;
  status: AlertStatus;
  created_at: string;
  resolved_at: string | null;
}

// The structured object the LLM returns from the triage prompt. `reply` is the
// patient-facing conversational message (not persisted on the Signal).
export interface TriageResult {
  language: string;
  med_adherence: MedAdherence;
  symptoms: Symptom[];
  mood: Mood;
  red_flags: string[];
  triage: Triage;
  summary_en: string;
  suggested_action: string | null;
  reply?: string;
}
