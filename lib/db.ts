// Data-access layer. Transparently uses Supabase when configured, otherwise an
// in-memory seeded store so the whole app runs with `npm run dev` and no keys.
//
// Higher-level operations (recordCheckin, runAnomalyChecks) live here so both
// backends share the same triage + anomaly logic.

import { randomUUID } from "node:crypto";
import { buildSeed } from "./seed";
import { detectAnomalies } from "./anomaly";
import { decideOnSignal, decideOnSweep } from "./agent";
import { isCareTeamRequest, triage } from "./triage";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase";
import type {
  Alert,
  AlertStatus,
  AgentAction,
  Channel,
  Direction,
  EngagementEvent,
  Patient,
  PeerConnection,
  PeerMessage,
  Prescription,
  PrescriptionMeta,
  Signal,
} from "./types";

// ── Raw store interface ─────────────────────────────────────────
interface Store {
  getPatients(): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | null>;
  getEvents(patientId?: string): Promise<EngagementEvent[]>;
  getSignals(patientId?: string): Promise<Signal[]>;
  getAlerts(patientId?: string): Promise<Alert[]>;
  getAgentActions(patientId?: string): Promise<AgentAction[]>;
  insertEvent(e: EngagementEvent): Promise<EngagementEvent>;
  insertSignal(s: Signal): Promise<Signal>;
  insertAlert(a: Alert): Promise<Alert>;
  insertAgentAction(a: AgentAction): Promise<AgentAction>;
  updateAlert(id: string, patch: Partial<Alert>): Promise<Alert | null>;
  updatePatient(id: string, patch: Partial<Patient>): Promise<Patient | null>;
  getPrescriptions(patientId?: string): Promise<PrescriptionMeta[]>;
  getPrescription(id: string): Promise<Prescription | null>;
  insertPrescription(p: Prescription): Promise<PrescriptionMeta>;
  updatePrescription(
    id: string,
    patch: Partial<Prescription>,
  ): Promise<PrescriptionMeta | null>;
  getPeerConnections(patientId?: string): Promise<PeerConnection[]>;
  getPeerConnection(id: string): Promise<PeerConnection | null>;
  insertPeerConnection(c: PeerConnection): Promise<PeerConnection>;
  updatePeerConnection(
    id: string,
    patch: Partial<PeerConnection>,
  ): Promise<PeerConnection | null>;
  getPeerMessages(connectionId: string): Promise<PeerMessage[]>;
  insertPeerMessage(m: PeerMessage): Promise<PeerMessage>;
}

// Columns returned in list/bundle payloads — everything except the file body.
const RX_META_COLS =
  "id, patient_id, file_name, mime_type, note, explanation, status, created_at, reviewed_at";

// ── In-memory store (default / demo) ────────────────────────────
interface MemState {
  patients: Patient[];
  events: EngagementEvent[];
  signals: Signal[];
  alerts: Alert[];
  agentActions: AgentAction[];
  prescriptions: Prescription[];
  peerConnections: PeerConnection[];
  peerMessages: PeerMessage[];
}

// Persist across HMR reloads in dev via globalThis.
const g = globalThis as unknown as { __kin?: MemState };
function mem(): MemState {
  if (!g.__kin) {
    const seed = buildSeed();
    g.__kin = {
      patients: seed.patients,
      events: seed.events,
      signals: seed.signals,
      alerts: seed.alerts,
      agentActions: seed.agentActions,
      prescriptions: seed.prescriptions,
      peerConnections: seed.peerConnections,
      peerMessages: seed.peerMessages,
    };
  }
  return g.__kin;
}

const memStore: Store = {
  async getPatients() {
    return [...mem().patients];
  },
  async getPatient(id) {
    return mem().patients.find((p) => p.id === id) ?? null;
  },
  async getEvents(patientId) {
    return mem()
      .events.filter((e) => !patientId || e.patient_id === patientId)
      .sort((a, b) => a.ts.localeCompare(b.ts));
  },
  async getSignals(patientId) {
    return mem()
      .signals.filter((s) => !patientId || s.patient_id === patientId)
      .sort((a, b) => a.ts.localeCompare(b.ts));
  },
  async getAlerts(patientId) {
    return mem()
      .alerts.filter((a) => !patientId || a.patient_id === patientId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getAgentActions(patientId) {
    return mem()
      .agentActions.filter((a) => !patientId || a.patient_id === patientId)
      .sort((a, b) => b.ts.localeCompare(a.ts));
  },
  async insertEvent(e) {
    mem().events.push(e);
    return e;
  },
  async insertSignal(s) {
    mem().signals.push(s);
    return s;
  },
  async insertAlert(a) {
    mem().alerts.push(a);
    return a;
  },
  async insertAgentAction(a) {
    mem().agentActions.push(a);
    return a;
  },
  async updateAlert(id, patch) {
    const a = mem().alerts.find((x) => x.id === id);
    if (!a) return null;
    Object.assign(a, patch);
    return a;
  },
  async updatePatient(id, patch) {
    const p = mem().patients.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    return p;
  },
  async getPrescriptions(patientId) {
    return mem()
      .prescriptions.filter((p) => !patientId || p.patient_id === patientId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(stripFile);
  },
  async getPrescription(id) {
    return mem().prescriptions.find((p) => p.id === id) ?? null;
  },
  async insertPrescription(p) {
    mem().prescriptions.push(p);
    return stripFile(p);
  },
  async updatePrescription(id, patch) {
    const p = mem().prescriptions.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    return stripFile(p);
  },
  async getPeerConnections(patientId) {
    return mem().peerConnections.filter(
      (c) =>
        !patientId ||
        c.requester_id === patientId ||
        c.addressee_id === patientId,
    );
  },
  async getPeerConnection(id) {
    return mem().peerConnections.find((c) => c.id === id) ?? null;
  },
  async insertPeerConnection(c) {
    mem().peerConnections.push(c);
    return c;
  },
  async updatePeerConnection(id, patch) {
    const c = mem().peerConnections.find((x) => x.id === id);
    if (!c) return null;
    Object.assign(c, patch);
    return c;
  },
  async getPeerMessages(connectionId) {
    return mem()
      .peerMessages.filter((m) => m.connection_id === connectionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  async insertPeerMessage(m) {
    mem().peerMessages.push(m);
    return m;
  },
};

// Drop the (large) file body — list/bundle payloads carry metadata only.
function stripFile(p: Prescription): PrescriptionMeta {
  const { file_url: _omit, ...meta } = p;
  return meta;
}

// ── Supabase store ──────────────────────────────────────────────
const supaStore: Store = {
  async getPatients() {
    const { data, error } = await supabaseAdmin().from("patients").select("*");
    if (error) throw error;
    return (data ?? []) as Patient[];
  },
  async getPatient(id) {
    const { data, error } = await supabaseAdmin()
      .from("patients")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as Patient) ?? null;
  },
  async getEvents(patientId) {
    let q = supabaseAdmin().from("engagement_events").select("*").order("ts");
    if (patientId) q = q.eq("patient_id", patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EngagementEvent[];
  },
  async getSignals(patientId) {
    let q = supabaseAdmin().from("signals").select("*").order("ts");
    if (patientId) q = q.eq("patient_id", patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Signal[];
  },
  async getAlerts(patientId) {
    let q = supabaseAdmin()
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false });
    if (patientId) q = q.eq("patient_id", patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Alert[];
  },
  async getAgentActions(patientId) {
    let q = supabaseAdmin()
      .from("agent_actions")
      .select("*")
      .order("ts", { ascending: false });
    if (patientId) q = q.eq("patient_id", patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AgentAction[];
  },
  async insertEvent(e) {
    const { data, error } = await supabaseAdmin()
      .from("engagement_events")
      .insert(e)
      .select()
      .single();
    if (error) throw error;
    return data as EngagementEvent;
  },
  async insertSignal(s) {
    const { data, error } = await supabaseAdmin()
      .from("signals")
      .insert(s)
      .select()
      .single();
    if (error) throw error;
    return data as Signal;
  },
  async insertAlert(a) {
    const { data, error } = await supabaseAdmin()
      .from("alerts")
      .insert(a)
      .select()
      .single();
    if (error) throw error;
    return data as Alert;
  },
  async insertAgentAction(a) {
    const { data, error } = await supabaseAdmin()
      .from("agent_actions")
      .insert(a)
      .select()
      .single();
    if (error) throw error;
    return data as AgentAction;
  },
  async updateAlert(id, patch) {
    const { data, error } = await supabaseAdmin()
      .from("alerts")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as Alert) ?? null;
  },
  async updatePatient(id, patch) {
    const { data, error } = await supabaseAdmin()
      .from("patients")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as Patient) ?? null;
  },
  async getPrescriptions(patientId) {
    // Defensive: if the prescriptions table doesn't exist yet (migration not
    // run), don't break the rest of the app — just return none.
    try {
      let q = supabaseAdmin()
        .from("prescriptions")
        .select(RX_META_COLS)
        .order("created_at", { ascending: false });
      if (patientId) q = q.eq("patient_id", patientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PrescriptionMeta[];
    } catch {
      return [];
    }
  },
  async getPrescription(id) {
    const { data, error } = await supabaseAdmin()
      .from("prescriptions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as Prescription) ?? null;
  },
  async insertPrescription(p) {
    const { data, error } = await supabaseAdmin()
      .from("prescriptions")
      .insert(p)
      .select(RX_META_COLS)
      .single();
    if (error) throw error;
    return data as unknown as PrescriptionMeta;
  },
  async updatePrescription(id, patch) {
    const { data, error } = await supabaseAdmin()
      .from("prescriptions")
      .update(patch)
      .eq("id", id)
      .select(RX_META_COLS)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as PrescriptionMeta) ?? null;
  },
  async getPeerConnections(patientId) {
    try {
      let q = supabaseAdmin().from("peer_connections").select("*");
      if (patientId) {
        q = q.or(
          `requester_id.eq.${patientId},addressee_id.eq.${patientId}`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PeerConnection[];
    } catch {
      return [];
    }
  },
  async getPeerConnection(id) {
    const { data, error } = await supabaseAdmin()
      .from("peer_connections")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as PeerConnection) ?? null;
  },
  async insertPeerConnection(c) {
    const { data, error } = await supabaseAdmin()
      .from("peer_connections")
      .insert(c)
      .select()
      .single();
    if (error) throw error;
    return data as PeerConnection;
  },
  async updatePeerConnection(id, patch) {
    const { data, error } = await supabaseAdmin()
      .from("peer_connections")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as PeerConnection) ?? null;
  },
  async getPeerMessages(connectionId) {
    try {
      const { data, error } = await supabaseAdmin()
        .from("peer_messages")
        .select("*")
        .eq("connection_id", connectionId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as PeerMessage[];
    } catch {
      return [];
    }
  },
  async insertPeerMessage(m) {
    const { data, error } = await supabaseAdmin()
      .from("peer_messages")
      .insert(m)
      .select()
      .single();
    if (error) throw error;
    return data as PeerMessage;
  },
};

function store(): Store {
  return isSupabaseConfigured() ? supaStore : memStore;
}

export function backendName(): "supabase" | "memory" {
  return isSupabaseConfigured() ? "supabase" : "memory";
}

// ── Read helpers ────────────────────────────────────────────────
export const listPatients = () => store().getPatients();
export const getPatient = (id: string) => store().getPatient(id);
export const listEvents = (patientId?: string) => store().getEvents(patientId);
export const listSignals = (patientId?: string) => store().getSignals(patientId);
export const listAlerts = (patientId?: string) => store().getAlerts(patientId);
export const listAgentActions = (patientId?: string) =>
  store().getAgentActions(patientId);
export const listPrescriptions = (patientId?: string) =>
  store().getPrescriptions(patientId);
export const getPrescription = (id: string) => store().getPrescription(id);

// ── Prescriptions ───────────────────────────────────────────────
export async function addPrescription(input: {
  patientId: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  note?: string | null;
  explanation?: string | null;
}): Promise<PrescriptionMeta> {
  return store().insertPrescription({
    id: uid("rx"),
    patient_id: input.patientId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    file_url: input.fileUrl,
    note: input.note ?? null,
    explanation: input.explanation ?? null,
    // Explained-to-the-patient on upload; no longer a clinician review item.
    status: "explained",
    created_at: new Date().toISOString(),
    reviewed_at: null,
  });
}

export function reviewPrescription(id: string) {
  return store().updatePrescription(id, {
    status: "reviewed",
    reviewed_at: new Date().toISOString(),
  });
}

// Clinician updates the patient's medicines (from a reviewed prescription).
export function setPatientMedicines(id: string, medicines: string[]) {
  return store().updatePatient(id, { medicines });
}

// ── Peer support ────────────────────────────────────────────────
export function setPeerOptIn(patientId: string, optIn: boolean) {
  return store().updatePatient(patientId, { peer_opt_in: optIn });
}

export const listPeerConnections = (patientId: string) =>
  store().getPeerConnections(patientId);
export const getPeerConnection = (id: string) => store().getPeerConnection(id);
export const listPeerMessages = (connectionId: string) =>
  store().getPeerMessages(connectionId);

// Create (or re-open) a connection request between two patients.
export async function requestPeerConnection(
  requesterId: string,
  addresseeId: string,
): Promise<PeerConnection | { error: string }> {
  if (requesterId === addresseeId) return { error: "Cannot connect to yourself." };
  const existing = (await store().getPeerConnections(requesterId)).find(
    (c) =>
      (c.requester_id === requesterId && c.addressee_id === addresseeId) ||
      (c.requester_id === addresseeId && c.addressee_id === requesterId),
  );
  if (existing) {
    if (existing.status === "declined") {
      // Allow a fresh request after a decline.
      return (await store().updatePeerConnection(existing.id, {
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: "pending",
        updated_at: new Date().toISOString(),
      })) as PeerConnection;
    }
    return { error: "You're already connected or have a pending request." };
  }
  const now = new Date().toISOString();
  return store().insertPeerConnection({
    id: uid("pc"),
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: "pending",
    created_at: now,
    updated_at: now,
  });
}

// Accept or decline a request — only the addressee may respond.
export async function respondPeerConnection(
  connectionId: string,
  meId: string,
  accept: boolean,
): Promise<PeerConnection | { error: string }> {
  const c = await store().getPeerConnection(connectionId);
  if (!c) return { error: "Request not found." };
  if (c.addressee_id !== meId) return { error: "Not your request to answer." };
  if (c.status !== "pending") return { error: "Request already handled." };
  return (await store().updatePeerConnection(connectionId, {
    status: accept ? "accepted" : "declined",
    updated_at: new Date().toISOString(),
  })) as PeerConnection;
}

// Send a message — only members of an accepted connection may post.
export async function sendPeerMessage(
  connectionId: string,
  senderId: string,
  body: string,
): Promise<PeerMessage | { error: string }> {
  const c = await store().getPeerConnection(connectionId);
  if (!c) return { error: "Connection not found." };
  if (c.status !== "accepted") return { error: "You're not connected yet." };
  if (c.requester_id !== senderId && c.addressee_id !== senderId) {
    return { error: "Not a member of this conversation." };
  }
  return store().insertPeerMessage({
    id: uid("pm"),
    connection_id: connectionId,
    sender_id: senderId,
    body: body.slice(0, 2000),
    created_at: new Date().toISOString(),
  });
}

// Real UUIDs so inserts satisfy the Supabase `uuid` columns. (The in-memory
// store treats ids as opaque, so this is safe for both backends.) The prefix
// is kept only as a human hint in logs.
function uid(_prefix?: string) {
  return randomUUID();
}

// ── recordCheckin: the core loop ────────────────────────────────
// transcript → triage → signal → anomaly alerts. Returns everything created.
export interface CheckinInput {
  patientId: string;
  transcript: string;
  direction?: Direction;
  channel?: Channel;
  duration_s?: number | null;
  requestCareTeam?: boolean;
}

export interface CheckinResult {
  event: EngagementEvent;
  signal: Signal;
  alerts: Alert[]; // escalations to the clinician (often empty — Kin handled it)
  actions: AgentAction[]; // what Kin did on its own authority
  reply: string; // the AI's patient-facing conversational reply
}

export async function recordCheckin(input: CheckinInput): Promise<CheckinResult> {
  const s = store();
  const patient = await s.getPatient(input.patientId);
  if (!patient) throw new Error(`Unknown patient ${input.patientId}`);

  const now = new Date().toISOString();
  const event: EngagementEvent = {
    id: uid("evt"),
    patient_id: patient.id,
    ts: now,
    direction: input.direction ?? "pull",
    channel: input.channel ?? "voice_widget",
    answered: true,
    transcript: input.transcript,
    duration_s: input.duration_s ?? null,
  };
  await s.insertEvent(event);

  const recent = (await s.getSignals(patient.id)).slice(-5);
  const result = await triage({
    transcript: input.transcript,
    patient,
    recentSignals: recent,
  });
  // `reply` is patient-facing and ephemeral — keep it out of the stored Signal.
  const { reply: aiReply, ...triageFields } = result;

  const signal: Signal = {
    id: uid("sig"),
    event_id: event.id,
    patient_id: patient.id,
    ts: now,
    ...triageFields,
  };
  await s.insertSignal(signal);

  // Run loud-anomaly detection immediately so red flags escalate live.
  const openAlerts = (await s.getAlerts(patient.id)).filter(
    (a) => a.status === "open",
  );
  const events = await s.getEvents(patient.id);
  const signals = await s.getSignals(patient.id);
  const candidates = detectAnomalies({
    patient,
    events,
    signals,
    openAlerts,
  }).filter((a) => a.kind === "loud_anomaly"); // quiet/unreachable come from the sweep

  // Kin decides what it handles and what a clinician must see.
  const decision = decideOnSignal(patient, signal, candidates);

  const alerts: Alert[] = [];
  for (const a of decision.escalations) alerts.push(await s.insertAlert(a));

  const actionDrafts = [...decision.actions];
  const requestedHandoff =
    input.requestCareTeam === true || isCareTeamRequest(input.transcript);
  const existingRequest = openAlerts.find((a) => a.kind === "care_request");

  if (requestedHandoff) {
    const handoffFields = {
      severity: Math.max(
        existingRequest?.severity ?? 0,
        signal.triage === "red_flag" ? 5 : 3,
      ),
      context: `${patient.name} asked for care-team contact. ${signal.summary_en}`,
      suggested_action:
        signal.suggested_action ??
        "Review this check-in and contact the patient about their concern.",
    };
    const alert = existingRequest
      ? await s.updateAlert(existingRequest.id, handoffFields)
      : await s.insertAlert({
          id: uid("alert"),
          patient_id: patient.id,
          kind: "care_request",
          ...handoffFields,
          status: "open",
          created_at: now,
          resolved_at: null,
        });
    if (!alert) throw new Error("Could not save care-team handoff");
    alerts.push(alert);
    actionDrafts.push({
      patient_id: patient.id,
      kind: "escalated",
      rationale:
        "Patient explicitly requested care-team contact — sent a structured handoff for human review.",
      alert_id: alert.id,
    });
  }

  const actions = await logActions(s, actionDrafts);

  return {
    event,
    signal,
    alerts,
    actions,
    reply: requestedHandoff
      ? `I've sent a note with what you shared to your care team for review. I can't promise when they'll respond, so please contact them directly if you need a quicker reply.`
      : aiReply || "Thank you for checking in — I've noted that down.",
  };
}

// Persist Kin's decisions to the audit log.
async function logActions(
  s: Store,
  drafts: Omit<AgentAction, "id" | "ts">[],
): Promise<AgentAction[]> {
  const out: AgentAction[] = [];
  const now = new Date().toISOString();
  for (const d of drafts) {
    out.push(await s.insertAgentAction({ ...d, id: uid("act"), ts: now }));
  }
  return out;
}

// ── Push attempt (for the unreachable / push-ladder simulation) ──
export async function recordPushAttempt(
  patientId: string,
  answered: boolean,
): Promise<EngagementEvent> {
  const event: EngagementEvent = {
    id: uid("evt"),
    patient_id: patientId,
    ts: new Date().toISOString(),
    direction: "push",
    channel: "voice_widget",
    answered,
    transcript: null,
    duration_s: null,
  };
  return store().insertEvent(event);
}

// ── Agent sweep (cron target) ───────────────────────────────────
// Kin reviews the caseload: it chases quiet patients itself and escalates only
// what a clinician must decide.
export interface SweepResult {
  escalations: Alert[];
  actions: AgentAction[];
}

export async function runAnomalyChecks(
  patientId?: string,
): Promise<SweepResult> {
  const s = store();
  const patients = patientId
    ? [await s.getPatient(patientId)].filter(Boolean)
    : await s.getPatients();

  const escalations: Alert[] = [];
  let actions: AgentAction[] = [];

  for (const p of patients as Patient[]) {
    const events = await s.getEvents(p.id);
    const signals = await s.getSignals(p.id);
    const openAlerts = (await s.getAlerts(p.id)).filter(
      (a) => a.status === "open",
    );
    const candidates = detectAnomalies({
      patient: p,
      events,
      signals,
      openAlerts,
    });
    if (candidates.length === 0) continue;

    const failedPushes = events.filter(
      (e) =>
        e.direction === "push" &&
        !e.answered &&
        Date.now() - new Date(e.ts).getTime() <= 24 * 3600 * 1000,
    ).length;

    const decision = decideOnSweep(p, candidates, failedPushes);

    for (const a of decision.escalations) {
      escalations.push(await s.insertAlert(a));
    }
    // Kin placing its own call is a real engagement event on the timeline.
    if (decision.callPatient) {
      await s.insertEvent({
        id: uid("evt"),
        patient_id: p.id,
        ts: new Date().toISOString(),
        direction: "push",
        channel: "voice_widget",
        answered: false,
        transcript: null,
        duration_s: null,
      });
    }
    actions = actions.concat(await logActions(s, decision.actions));
  }

  return { escalations, actions };
}

// ── Alert status ────────────────────────────────────────────────
export async function setAlertStatus(
  id: string,
  status: AlertStatus,
): Promise<Alert | null> {
  return store().updateAlert(id, {
    status,
    resolved_at: status === "resolved" ? new Date().toISOString() : null,
  });
}
