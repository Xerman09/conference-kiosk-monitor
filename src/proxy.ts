import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  isAuthDisabled,
  verifySessionToken,
} from "./lib/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthDisabled()) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/kiosk/conference-room", request.url));
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  // Root route redirects based on auth state
  if (pathname === "/") {
    const dest = session ? "/kiosk/conference-room" : "/login";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Room picker (/kiosk/conference-room exact) requires admin authentication.
  // Individual room displays (/kiosk/conference-room/[roomId]) stay unlocked
  // so wall-mounted tablets can run unattended.
  if (pathname === "/kiosk/conference-room" || pathname === "/kiosk") {
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", "/kiosk/conference-room");
      return NextResponse.redirect(loginUrl);
    }
    if (pathname === "/kiosk") {
      return NextResponse.redirect(new URL("/kiosk/conference-room", request.url));
    }
  }

  // If already logged in, redirect away from /login
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/kiosk/conference-room", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/kiosk", "/kiosk/conference-room"],
};
