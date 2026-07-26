import { NextRequest, NextResponse } from "next/server";
import { addPrescription, listPrescriptions } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Cap the stored data URL. Prescriptions are photos/PDFs; keep it demo-sized.
const MAX_CHARS = 6_000_000; // ~4.4 MB decoded
const ALLOWED = /^data:(image\/(png|jpe?g|webp|heic|heif)|application\/pdf);base64,/i;

// GET /api/prescriptions — the caller's own prescriptions (patient) or a
// patient's list (clinician, via ?patientId=).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const patientId =
    session.role === "patient"
      ? session.id
      : (req.nextUrl.searchParams.get("patientId") ?? undefined);
  return NextResponse.json({ prescriptions: await listPrescriptions(patientId) });
}

// POST /api/prescriptions — a patient uploads a prescription image/PDF.
// Body: { file_name, mime_type, data_url, note? }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Patients upload for themselves; a clinician may upload on a patient's behalf.
  let body: {
    file_name?: string;
    mime_type?: string;
    data_url?: string;
    note?: string;
    patientId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patientId = session.role === "patient" ? session.id : body.patientId;
  if (!patientId) {
    return NextResponse.json({ error: "patientId required" }, { status: 400 });
  }
  if (!body.data_url || !ALLOWED.test(body.data_url)) {
    return NextResponse.json(
      { error: "A JPEG, PNG, WebP, or PDF file is required." },
      { status: 400 },
    );
  }
  if (body.data_url.length > MAX_CHARS) {
    return NextResponse.json(
      { error: "File is too large (max ~4 MB)." },
      { status: 413 },
    );
  }

  try {
    const created = await addPrescription({
      patientId,
      fileName: body.file_name?.slice(0, 200) || "prescription",
      mimeType: body.mime_type || "application/octet-stream",
      fileUrl: body.data_url,
      note: body.note?.slice(0, 500) ?? null,
    });
    return NextResponse.json({ prescription: created });
  } catch {
    // Most likely the prescriptions table hasn't been migrated yet.
    return NextResponse.json(
      { error: "Prescriptions aren't set up yet. Please try again shortly." },
      { status: 503 },
    );
  }
}
