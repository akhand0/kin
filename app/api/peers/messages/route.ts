import { NextRequest, NextResponse } from "next/server";
import {
  getPatient,
  getPeerConnection,
  listPeerMessages,
  sendPeerMessage,
} from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const isMember = (
  c: { requester_id: string; addressee_id: string },
  id: string,
) => c.requester_id === id || c.addressee_id === id;

// GET /api/peers/messages?connectionId=... — the thread, if you're a member.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "patient") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });
  }
  const conn = await getPeerConnection(connectionId);
  if (!conn || !isMember(conn, session.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const peerId =
    conn.requester_id === session.id ? conn.addressee_id : conn.requester_id;
  const peer = await getPatient(peerId);
  const messages = (await listPeerMessages(connectionId)).map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    mine: m.sender_id === session.id,
  }));
  return NextResponse.json({
    peer_first_name: peer ? peer.name.split(" ")[0] : "Peer",
    messages,
  });
}

// POST /api/peers/messages — send a message. Body: { connectionId, body }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "patient") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { connectionId?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.connectionId || !body.body?.trim()) {
    return NextResponse.json(
      { error: "connectionId and body are required" },
      { status: 400 },
    );
  }
  const result = await sendPeerMessage(
    body.connectionId,
    session.id,
    body.body.trim(),
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ message: { id: result.id } });
}
