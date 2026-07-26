import { NextRequest, NextResponse } from "next/server";
import { getPrescription, reviewPrescription } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/prescriptions/:id — the full record incl. the file body, for viewing.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rx = await getPrescription(id);
  if (!rx) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // A patient may only read their own prescription.
  if (session.role === "patient" && rx.patient_id !== session.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ prescription: rx });
}

// PATCH /api/prescriptions/:id — clinician marks it reviewed.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (session?.role !== "clinician") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const updated = await reviewPrescription(id);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ prescription: updated });
}
