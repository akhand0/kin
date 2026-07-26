import { NextRequest, NextResponse } from "next/server";
import { getPatient, listSignals, recordCheckin } from "@/lib/db";
import { isSubstantiveCheckin, triage } from "@/lib/triage";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/checkin — a patient pull check-in (text or voice-transcribed).
// Body: { patientId?: string, transcript: string, duration_s?: number }
// Patients always check in as themselves; the clinician demo controls may
// specify a patientId.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { patientId?: string; transcript?: string; duration_s?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patientId = session.role === "patient" ? session.id : body.patientId;

  const transcript = body.transcript?.trim() ?? "";
  if (!patientId || !transcript) {
    return NextResponse.json(
      { error: "patientId and transcript are required" },
      { status: 400 },
    );
  }

  try {
    // Greetings / small talk get a real AI reply but aren't logged as a
    // health check-in — so the record stays clean, but Kin still responds.
    if (!isSubstantiveCheckin(transcript)) {
      const patient = await getPatient(patientId);
      const recent = patient ? (await listSignals(patientId)).slice(-5) : [];
      const t = patient
        ? await triage({ transcript, patient, recentSignals: recent })
        : null;
      return NextResponse.json({
        chit_chat: true,
        signal: null,
        reply:
          t?.reply || "Lovely to hear from you. How are you feeling today?",
      });
    }

    const result = await recordCheckin({
      patientId,
      transcript,
      duration_s: body.duration_s ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
