import { NextRequest, NextResponse } from "next/server";
import { recordPushAttempt, runAnomalyChecks } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/push — simulate a push-ladder step (Kin reaching out to the
// patient). Body: { patientId, answered }. When two attempts go unanswered,
// the anomaly sweep raises an "unreachable" alert, so we run it after.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "clinician") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { patientId?: string; answered?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.patientId) {
    return NextResponse.json({ error: "patientId required" }, { status: 400 });
  }
  const event = await recordPushAttempt(body.patientId, body.answered ?? false);
  const sweep = await runAnomalyChecks(body.patientId);
  return NextResponse.json({ event, ...sweep });
}
