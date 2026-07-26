import { NextResponse } from "next/server";
import {
  backendName,
  listAgentActions,
  listAlerts,
  listPatients,
  listSignals,
} from "@/lib/db";
import { summarise } from "@/lib/agent";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/patients — the clinician's caseload, with Kin's agent summary.
// Patients get only their own record.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const all = await listPatients();
  const scoped =
    session.role === "patient"
      ? all.filter((p) => p.id === session.id)
      : all;

  const patients = await Promise.all(
    scoped.map(async (p) => {
      const signals = await listSignals(p.id);
      const alerts = await listAlerts(p.id);
      const actions = await listAgentActions(p.id);
      const last = signals[signals.length - 1] ?? null;
      const open = alerts.filter((a) => a.status === "open");
      const top = open.reduce<(typeof open)[number] | null>(
        (acc, a) => (!acc || a.severity > acc.severity ? a : acc),
        null,
      );
      // "Kin is handling it" = the agent acted recently but nothing escalated.
      const handledRecently = actions.some(
        (a) =>
          a.kind !== "triaged" &&
          a.kind !== "escalated" &&
          Date.now() - new Date(a.ts).getTime() <= 48 * 3600 * 1000,
      );
      return {
        ...p,
        last_checkin: last?.ts ?? null,
        last_triage: last?.triage ?? null,
        open_alerts: open.length,
        top_severity: top?.severity ?? 0,
        top_kind: top?.kind ?? null,
        agent_handling: open.length === 0 && handledRecently,
      };
    }),
  );

  const agent =
    session.role === "clinician"
      ? summarise(await listAgentActions())
      : null;

  return NextResponse.json({ backend: backendName(), session, patients, agent });
}
