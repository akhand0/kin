import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/credentials";
import { setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/auth/login  { username, password }
export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.username?.trim() || !body.password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  const { session, error } = await verifyPassword(
    body.username,
    body.password,
  );
  if (error || !session) {
    return NextResponse.json({ error: error ?? "Login failed." }, { status: 401 });
  }

  await setSession(session);
  return NextResponse.json({
    session,
    redirect: session.role === "clinician" ? "/dashboard" : "/talk",
  });
}
