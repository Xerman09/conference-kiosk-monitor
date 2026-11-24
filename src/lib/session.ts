import type { AdminSession } from "./types";

export const SESSION_COOKIE_NAME = "kiosk_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.DIRECTUS_STATIC_TOKEN ||
    "conference-kiosk-default-secret-change-me"
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function signHmac(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(
  admin: Omit<AdminSession, "exp" | "isAdmin">
): Promise<{ token: string; maxAge: number }> {
  const payload: AdminSession = {
    userId: admin.userId,
    email: admin.email,
    name: admin.name,
    isAdmin: true,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signHmac(encodedPayload);
  return {
    token: `${encodedPayload}.${signature}`,
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<AdminSession | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  try {
    const expectedSig = await signHmac(encodedPayload);
    if (expectedSig.length !== providedSig.length) return null;

    let diff = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      diff |= expectedSig.charCodeAt(i) ^ providedSig.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const jsonStr = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const parsed = JSON.parse(jsonStr) as AdminSession;

    if (!parsed || !parsed.isAdmin || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isAuthDisabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";
}

export function isCookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true";
}
