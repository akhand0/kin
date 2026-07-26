// Credential verification. Uses Supabase Auth when configured (SSO or
// email+password); otherwise falls back to the seeded demo credentials so the
// whole login flow is demoable offline.

import { DEMO_CLINICIAN, DEMO_PASSWORD } from "./seed";
import { listPatients } from "./db";
import { isSupabaseConfigured } from "./supabase";
import type { Session } from "./session";

export function ssoAvailable(): boolean {
  return isSupabaseConfigured();
}

export interface LoginResult {
  session?: Session;
  error?: string;
}

// Username + password. In demo mode every seeded patient shares DEMO_PASSWORD.
export async function verifyPassword(
  username: string,
  password: string,
): Promise<LoginResult> {
  const u = username.trim().toLowerCase();

  if (u === DEMO_CLINICIAN.username) {
    if (password !== DEMO_PASSWORD) return { error: "Incorrect password." };
    return {
      session: {
        role: "clinician",
        id: DEMO_CLINICIAN.id,
        name: DEMO_CLINICIAN.name,
        via: "password",
      },
    };
  }

  const patients = await listPatients();
  const patient = patients.find(
    (p) => p.username.toLowerCase() === u || p.email?.toLowerCase() === u,
  );
  if (!patient) return { error: "No account found with that username." };
  if (password !== DEMO_PASSWORD) return { error: "Incorrect password." };

  return {
    session: {
      role: "patient",
      id: patient.id,
      name: patient.name,
      via: "password",
    },
  };
}

// After an SSO round-trip, map the verified email to a patient record.
export async function sessionForEmail(
  email: string,
): Promise<LoginResult> {
  const e = email.trim().toLowerCase();
  const patients = await listPatients();
  const patient = patients.find(
    (p) => p.email?.toLowerCase() === e || `${p.username}@example.com` === e,
  );
  if (!patient) {
    return {
      error:
        "That account isn't linked to a patient record. Ask your clinic to invite you.",
    };
  }
  return {
    session: {
      role: "patient",
      id: patient.id,
      name: patient.name,
      via: "sso",
    },
  };
}
