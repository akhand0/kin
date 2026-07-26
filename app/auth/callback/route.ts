import { NextRequest, NextResponse } from "next/server";
import { sessionForEmail } from "@/lib/credentials";
import { setSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Magic-link return leg. Supabase redirects here with a `code`; we exchange it
// (using the cookie-bound server client so the PKCE verifier is available), map
// the verified email to a patient, and issue Kin's own session cookie.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");

  const supa = await supabaseServer();
  if (!supa || !code) {
    return NextResponse.redirect(`${origin}/login?error=sso_unavailable`);
  }

  const { data, error } = await supa.auth.exchangeCodeForSession(code);
  const email = data?.user?.email;
  if (error || !email) {
    return NextResponse.redirect(`${origin}/login?error=sso_failed`);
  }

  const { session, error: mapError } = await sessionForEmail(email);
  if (mapError || !session) {
    return NextResponse.redirect(`${origin}/login?error=no_patient_record`);
  }

  await setSession(session);
  return NextResponse.redirect(`${origin}/talk`);
}
