// Seed a real Supabase project with the demo data.
//
//   1. Run supabase/migrations/0001_init.sql in your project.
//   2. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
//   3. npm run seed
//
// String ids from the in-memory seed (p_priya, evt_…) are remapped to UUIDs.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildSeed } from "../lib/seed";

// Minimal .env loader (no dependency).
function loadEnv(file: string) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* file optional */
  }
}
loadEnv(".env.local");
loadEnv(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See .env.example.",
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const seed = buildSeed();
  const idMap = new Map<string, string>();
  const uuid = (oldId: string) => {
    if (!idMap.has(oldId)) idMap.set(oldId, randomUUID());
    return idMap.get(oldId)!;
  };

  const patients = seed.patients.map((p) => ({
    id: uuid(p.id),
    clinician_id: null, // FK to auth.users — set per real user
    name: p.name,
    patient_ref: p.patient_ref,
    username: p.username,
    email: p.email,
    language: p.language,
    timezone: p.timezone,
    conditions: p.conditions,
    medicines: p.medicines,
    baseline_gap_hours: p.baseline_gap_hours,
    peer_opt_in: p.peer_opt_in,
  }));

  const events = seed.events.map((e) => ({
    id: uuid(e.id),
    patient_id: uuid(e.patient_id),
    ts: e.ts,
    direction: e.direction,
    channel: e.channel,
    answered: e.answered,
    transcript: e.transcript,
    duration_s: e.duration_s,
  }));

  const signals = seed.signals.map((s) => ({
    id: uuid(s.id),
    event_id: uuid(s.event_id),
    patient_id: uuid(s.patient_id),
    ts: s.ts,
    language: s.language,
    med_adherence: s.med_adherence,
    symptoms: s.symptoms,
    mood: s.mood,
    red_flags: s.red_flags,
    triage: s.triage,
    summary_en: s.summary_en,
    suggested_action: s.suggested_action,
  }));

  const agentActions = seed.agentActions.map((a) => ({
    id: uuid(a.id),
    patient_id: uuid(a.patient_id),
    ts: a.ts,
    kind: a.kind,
    rationale: a.rationale,
    alert_id: a.alert_id ? uuid(a.alert_id) : null,
  }));

  const alerts = seed.alerts.map((a) => ({
    id: uuid(a.id),
    patient_id: uuid(a.patient_id),
    kind: a.kind,
    severity: a.severity,
    context: a.context,
    suggested_action: a.suggested_action,
    status: a.status,
    created_at: a.created_at,
    resolved_at: a.resolved_at,
  }));

  const peerConnections = seed.peerConnections.map((c) => ({
    id: uuid(c.id),
    requester_id: uuid(c.requester_id),
    addressee_id: uuid(c.addressee_id),
    status: c.status,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));

  const peerMessages = seed.peerMessages.map((m) => ({
    id: uuid(m.id),
    connection_id: uuid(m.connection_id),
    sender_id: uuid(m.sender_id),
    body: m.body,
    created_at: m.created_at,
  }));

  console.log("Seeding Supabase…");
  for (const [name, rows] of [
    ["patients", patients],
    ["engagement_events", events],
    ["signals", signals],
    ["alerts", alerts],
    ["agent_actions", agentActions],
    ["peer_connections", peerConnections],
    ["peer_messages", peerMessages],
  ] as const) {
    const { error } = await db.from(name).upsert(rows as any);
    if (error) {
      console.error(`  ✗ ${name}:`, error.message);
      process.exit(1);
    }
    console.log(`  ✓ ${name}: ${rows.length} rows`);
  }
  console.log("Done.");
}

main();
