import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ssoAvailable } from "@/lib/credentials";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session, sso: ssoAvailable() });
}
