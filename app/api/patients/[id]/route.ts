import { NextRequest, NextResponse } from "next/server";
import {
  getPatient,
  listAgentActions,
  listAlerts,
  listEvents,
  listPrescriptions,
  listSignals,
  setPatientMedicines,
} from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/patients/:id — full bundle for the clinician dashboard.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // A patient may only ever read their own record.
  if (session.role === "patient" && session.id !== id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const patient = await getPatient(id);
  if (!patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const [events, signals, alerts, actions, prescriptions] = await Promise.all([
    listEvents(id),
    listSignals(id),
    listAlerts(id),
    listAgentActions(id),
    listPrescriptions(id),
  ]);
  return NextResponse.json({
    patient,
    events,
    signals,
    alerts,
    actions,
    prescriptions,
  });
}

// PATCH /api/patients/:id — clinician updates the patient's medicines (e.g.
// after reviewing an uploaded prescription).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (session?.role !== "clinician") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { medicines?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    !Array.isArray(body.medicines) ||
    !body.medicines.every((m) => typeof m === "string")
  ) {
    return NextResponse.json(
      { error: "medicines must be an array of strings" },
      { status: 400 },
    );
  }
  const medicines = (body.medicines as string[])
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 30);
  const updated = await setPatientMedicines(id, medicines);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ patient: updated });
}
