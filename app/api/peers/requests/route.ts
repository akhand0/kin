import { NextRequest, NextResponse } from "next/server";
import { getPatient, requestPeerConnection } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/peers/requests — the patient asks to connect with a peer.
// Body: { peerId }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "patient") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const me = await getPatient(session.id);
  if (!me?.peer_opt_in) {
    return NextResponse.json(
      { error: "Opt in to peer support first." },
      { status: 403 },
    );
  }
  let body: { peerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }
  // The peer must also be opted in.
  const peer = await getPatient(body.peerId);
  if (!peer?.peer_opt_in) {
    return NextResponse.json(
      { error: "That person isn't available for peer support." },
      { status: 400 },
    );
  }

  const result = await requestPeerConnection(session.id, body.peerId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ connection: result });
}
