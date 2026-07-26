import { NextRequest, NextResponse } from "next/server";
import {
  getPatient,
  listPatients,
  listPeerConnections,
  setPeerOptIn,
} from "@/lib/db";
import { getSession } from "@/lib/session";
import type { PeerConnection } from "@/lib/types";

export const dynamic = "force-dynamic";

const firstName = (name: string) => name.split(" ")[0];

// GET /api/peers — the signed-in patient's peer-support state: opt-in flag,
// directory of other opted-in patients, active connections, and incoming
// requests. Only first names + conditions are ever exposed to peers.
export async function GET() {
  const session = await getSession();
  if (session?.role !== "patient") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const me = await getPatient(session.id);
  if (!me) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!me.peer_opt_in) {
    return NextResponse.json({
      opted_in: false,
      directory: [],
      connections: [],
      incoming: [],
    });
  }

  const [all, myConns] = await Promise.all([
    listPatients(),
    listPeerConnections(me.id),
  ]);
  const byId = new Map(all.map((p) => [p.id, p]));

  // My connection status keyed by the other patient's id.
  const statusFor = (peerId: string): {
    status: "connected" | "outgoing" | "incoming" | null;
    conn: PeerConnection | null;
  } => {
    const c = myConns.find(
      (x) =>
        (x.requester_id === me.id && x.addressee_id === peerId) ||
        (x.requester_id === peerId && x.addressee_id === me.id),
    );
    if (!c || c.status === "declined") return { status: null, conn: c ?? null };
    if (c.status === "accepted") return { status: "connected", conn: c };
    return {
      status: c.requester_id === me.id ? "outgoing" : "incoming",
      conn: c,
    };
  };

  const directory = all
    .filter((p) => p.id !== me.id && p.peer_opt_in)
    .map((p) => {
      const { status } = statusFor(p.id);
      const shared = p.conditions.filter((c) => me.conditions.includes(c));
      return {
        patient_id: p.id,
        first_name: firstName(p.name),
        conditions: p.conditions,
        shared,
        status,
      };
    })
    // Peers sharing a condition first, then the rest.
    .sort((a, b) => b.shared.length - a.shared.length);

  const connections = myConns
    .filter((c) => c.status === "accepted")
    .map((c) => {
      const peerId = c.requester_id === me.id ? c.addressee_id : c.requester_id;
      const peer = byId.get(peerId);
      return {
        connection_id: c.id,
        peer_id: peerId,
        first_name: peer ? firstName(peer.name) : "Someone",
        conditions: peer?.conditions ?? [],
      };
    });

  const incoming = myConns
    .filter((c) => c.status === "pending" && c.addressee_id === me.id)
    .map((c) => {
      const peer = byId.get(c.requester_id);
      return {
        connection_id: c.id,
        peer_id: c.requester_id,
        first_name: peer ? firstName(peer.name) : "Someone",
        conditions: peer?.conditions ?? [],
      };
    });

  return NextResponse.json({ opted_in: true, directory, connections, incoming });
}

// PATCH /api/peers — toggle the patient's own opt-in.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "patient") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { opt_in?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const updated = await setPeerOptIn(session.id, Boolean(body.opt_in));
    return NextResponse.json({ opted_in: Boolean(updated?.peer_opt_in) });
  } catch {
    return NextResponse.json(
      { error: "Peer support isn't set up yet. Please try again shortly." },
      { status: 503 },
    );
  }
}
