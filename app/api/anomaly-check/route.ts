import { NextRequest, NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { runAnomalyChecks } from "@/lib/db";

export const dynamic = "force-dynamic";

// The scheduled anomaly sweep. Wire this to Vercel Cron (see vercel.json) or
// a Supabase scheduled function. Creates quiet_anomaly / unreachable /
// loud_anomaly alerts as needed.
async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const patientId = req.nextUrl.searchParams.get("patientId") ?? undefined;
  const { escalations, actions } = await runAnomalyChecks(patientId);
  return NextResponse.json({
    escalated: escalations.length,
    handled: actions.filter((a) => a.kind !== "escalated").length,
    escalations,
    actions,
  });
}

export const GET = run;
export const POST = run;
