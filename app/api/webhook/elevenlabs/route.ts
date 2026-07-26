import { NextRequest, NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { recordCheckin } from "@/lib/db";
import { isSubstantiveCheckin } from "@/lib/triage";

export const dynamic = "force-dynamic";

// POST /api/webhook/elevenlabs — ElevenLabs post-call webhook.
//
// Configure the agent's post-call webhook to hit this route with a bearer
// token equal to KIN_CRON_SECRET. We pull the transcript out of the payload
// and route it through the same triage loop as a direct check-in.
//
// ElevenLabs payload shapes vary by product tier, so we defensively look in a
// few known places for the transcript and a patient id (passed as a dynamic
// variable / metadata when the call starts).
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data = payload?.data ?? payload;

  const patientId: string | undefined =
    data?.patient_record_id ||
    data?.metadata?.patient_record_id ||
    data?.conversation_initiation_client_data?.dynamic_variables
      ?.patient_record_id ||
    data?.dynamic_variables?.patient_record_id ||
    data?.patient_id ||
    data?.metadata?.patient_id ||
    data?.conversation_initiation_client_data?.dynamic_variables?.patient_id ||
    data?.dynamic_variables?.patient_id;

  const transcript = extractTranscript(data);

  if (!patientId) {
    return NextResponse.json(
      { error: "missing patient_id in webhook payload" },
      { status: 400 },
    );
  }
  if (!transcript.trim()) {
    return NextResponse.json({ ok: true, note: "empty transcript, ignored" });
  }
  if (!isSubstantiveCheckin(transcript)) {
    return NextResponse.json({ ok: true, note: "greeting / small talk, not logged" });
  }

  try {
    const result = await recordCheckin({
      patientId,
      transcript: transcript.trim(),
      channel: "voice_widget",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

// Turn ElevenLabs' turn-by-turn transcript into a plain string of what the
// patient (user) said.
function extractTranscript(data: any): string {
  if (typeof data?.transcript === "string") return data.transcript;
  const turns = data?.transcript || data?.turns;
  if (Array.isArray(turns)) {
    return turns
      .filter((t: any) => (t.role || t.speaker) !== "agent")
      .map((t: any) => t.message || t.text || t.content || "")
      .join(" ")
      .trim();
  }
  return "";
}
