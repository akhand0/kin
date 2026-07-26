import { NextRequest, NextResponse } from "next/server";
import { respondPeerConnection } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// PATCH /api/peers/requests/:id — accept or decline an incoming request.
// Body: { accept: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (session?.role !== "patient") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { accept?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = await respondPeerConnection(
    id,
    session.id,
    Boolean(body.accept),
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ connection: result });
}
