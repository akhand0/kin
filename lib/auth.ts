import { NextRequest } from "next/server";

// Shared-secret check for the cron sweep and the ElevenLabs webhook.
// Accepts KIN_CRON_SECRET or Vercel's built-in CRON_SECRET, via either a
// Bearer header or a ?secret= query param.
export function authorized(req: NextRequest): boolean {
  const secrets = [
    process.env.KIN_CRON_SECRET || "dev-secret",
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  const qp = req.nextUrl.searchParams.get("secret");
  return secrets.includes(token) || (qp !== null && secrets.includes(qp));
}
