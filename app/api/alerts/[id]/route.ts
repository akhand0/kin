import { NextRequest, NextResponse } from "next/server";
import { setAlertStatus } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { AlertStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: AlertStatus[] = ["open", "acked", "resolved"];

// PATCH /api/alerts/:id  { status: "acked" | "resolved" | "open" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (session?.role !== "clinician") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { status?: AlertStatus };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.status || !VALID.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID.join(", ")}` },
      { status: 400 },
    );
  }
  const alert = await setAlertStatus(id, body.status);
  if (!alert) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ alert });
}
