import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminCredentials } from "@/lib/directus";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  isCookieSecure,
} from "@/lib/session";

const LoginBodySchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = LoginBodySchema.safeParse(body);

    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message || "Email and password are required.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const result = await verifyAdminCredentials(
      parsed.data.email,
      parsed.data.password
    );

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    const { token, maxAge } = await createSessionToken(result.admin);
    const response = NextResponse.json({
      success: true,
      admin: result.admin,
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isCookieSecure(),
      path: "/",
      maxAge,
    });

    return response;
  } catch (err) {
    console.error("[api/auth/login] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to reach the authentication server. Please check the Directus connection.",
      },
      { status: 502 }
    );
  }
}
