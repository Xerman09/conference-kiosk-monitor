import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  isAuthDisabled,
  verifySessionToken,
} from "@/lib/session";

export async function GET() {
  if (isAuthDisabled()) {
    return NextResponse.json({
      authenticated: true,
      admin: {
        userId: 0,
        email: "dev@local",
        name: "Dev Mode",
        isAdmin: true,
      },
    });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ authenticated: false, admin: null });
  }

  return NextResponse.json({
    authenticated: true,
    admin: session,
  });
}
