// Edge-safe session encoding. Uses Web Crypto and base64url so it runs in both
// the Node server runtime and Next's Edge middleware. Cookie helpers that need
// `next/headers` live in session.ts, which re-exports from here.

export type Role = "patient" | "clinician";

export interface Session {
  role: Role;
  id: string; // patient id or clinician id
  name: string;
  via: "password" | "sso" | "demo";
}

export const SESSION_COOKIE = "kin_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12h

function secret(): string {
  return process.env.KIN_SESSION_SECRET || "dev-session-secret";
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return b64urlFromBytes(new Uint8Array(sig));
}

// Length-independent comparison, so a wrong signature doesn't leak its prefix.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function encodeSession(s: Session): Promise<string> {
  const payload = b64urlFromBytes(new TextEncoder().encode(JSON.stringify(s)));
  return `${payload}.${await hmac(payload)}`;
}

export async function decodeSession(
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!constantTimeEqual(sig, await hmac(payload))) return null;
  try {
    return JSON.parse(
      new TextDecoder().decode(bytesFromB64url(payload)),
    ) as Session;
  } catch {
    return null;
  }
}
