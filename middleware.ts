import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session-core";

// Route guards. Patients reach /talk, clinicians reach /dashboard, and neither
// can wander into the other's view.
const PATIENT_ROUTES = ["/talk", "/peers"];
const CLINICIAN_ROUTES = ["/dashboard"];

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;
  const session = await decodeSession(req.cookies.get(SESSION_COOKIE)?.value);

  const needsPatient = PATIENT_ROUTES.some((p) => pathname.startsWith(p));
  const needsClinician = CLINICIAN_ROUTES.some((p) => pathname.startsWith(p));
  if (!needsPatient && !needsClinician) return NextResponse.next();

  if (!session) {
    const url = new URL("/login", origin);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in, but on the wrong side of the app — send them home.
  if (needsPatient && session.role !== "patient") {
    return NextResponse.redirect(new URL("/dashboard", origin));
  }
  if (needsClinician && session.role !== "clinician") {
    return NextResponse.redirect(new URL("/talk", origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/talk/:path*", "/peers/:path*", "/dashboard/:path*"],
};
