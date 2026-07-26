// Server-side cookie helpers. The signing/verification itself lives in
// session-core.ts so Edge middleware can share it.

import { cookies } from "next/headers";
import {
  decodeSession,
  encodeSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type Session,
} from "./session-core";

export {
  decodeSession,
  encodeSession,
  SESSION_COOKIE,
  type Role,
  type Session,
} from "./session-core";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value);
}

export async function setSession(s: Session): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await encodeSession(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
