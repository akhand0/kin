import { NextRequest, NextResponse } from "next/server";
import { sessionForEmail } from "@/lib/credentials";
import { setSession } from "@/lib/session";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// SSO return leg. Supabase redirects here with a `code`; we exchange it, map
// the verified email to a patient record, and issue Kin's own session cookie.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(`${origin}/login?error=sso_unavailable`);
  }

  const { data, error } = await supabaseAdmin().auth.exchangeCodeForSession(code);
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
