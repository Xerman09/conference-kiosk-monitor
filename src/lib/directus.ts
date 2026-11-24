import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  ConferenceRoomSchema,
  ConferenceRoomRequestSchema,
  type ConferenceRoom,
  type ConferenceRoomRequest,
} from "./types";

interface DirectusHostConfig {
  url: string;
  token: string;
}

interface DirectusUserRow {
  user_id: number;
  user_email: string;
  user_password?: string | null;
  hash_password?: string | null;
  user_fname?: string | null;
  user_lname?: string | null;
  isAdmin?: number | boolean | string | null;
  role?: string | null;
  is_blocked?: number | boolean | null;
  is_deleted?: number | boolean | { type?: string; data?: number[] } | null;
  isDeleted?: number | boolean | { type?: string; data?: number[] } | null;
}

function getLocalDirectusConfig(): DirectusHostConfig {
  const url = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN || "";
  if (!url) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  }
  return { url, token };
}

async function directusFetch<T>(
  config: DirectusHostConfig,
  path: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }

  const res = await fetch(`${config.url}${path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Directus request failed (${res.status} ${res.statusText}): ${text.slice(0, 200)}`
    );
  }

  const json = (await res.json()) as { data: T };
  return json.data;
}

/**
 * Resolves the centralized host company Directus instance via
 * `general_setting` (setting_key = 'conference_room') -> `company_list`.
 * Falls back cleanly to the local Directus instance if not configured.
 */
export async function resolveConferenceHost(): Promise<DirectusHostConfig> {
  const local = getLocalDirectusConfig();

  try {
    const settings = await directusFetch<Array<{ setting_value?: string | number }>>(
      local,
      `/items/general_setting?filter[setting_key][_eq]=conference_room&limit=1`
    );

    const companyId = settings?.[0]?.setting_value;
    if (!companyId) {
      return local;
    }

    const companies = await directusFetch<
      Array<{ directus?: string; directus_token?: string }>
    >(
      local,
      `/items/company_list?filter[company_id][_eq]=${encodeURIComponent(String(companyId))}&limit=1`
    );

    const host = companies?.[0];
    if (host?.directus) {
      return {
        url: host.directus.replace(/\/+$/, ""),
        token: host.directus_token || local.token,
      };
    }
  } catch (err) {
    console.warn(
      "[directus] Host resolution fallback to local Directus:",
      err instanceof Error ? err.message : err
    );
  }

  return local;
}

export async function getConferenceRooms(): Promise<ConferenceRoom[]> {
  const local = getLocalDirectusConfig();
  let rows: unknown[] = [];

  try {
    const localRows = await directusFetch<unknown[]>(
      local,
      `/items/conference_room?sort=name&limit=-1`
    );
    if (Array.isArray(localRows) && localRows.length > 0) {
      rows = localRows;
    }
  } catch (err) {
    console.warn(
      "[directus] Local conference_room fetch failed, trying host:",
      err instanceof Error ? err.message : err
    );
  }

  if (rows.length === 0) {
    const host = await resolveConferenceHost();
    if (host.url !== local.url) {
      const hostRows = await directusFetch<unknown[]>(
        host,
        `/items/conference_room?sort=name&limit=-1`
      );
      if (Array.isArray(hostRows)) {
        rows = hostRows;
      }
    }
  }

  return rows
    .map((item) => ConferenceRoomSchema.safeParse(item))
    .filter((parsed): parsed is { success: true; data: ConferenceRoom } => parsed.success)
    .map((parsed) => parsed.data);
}

/**
 * Fetches approved bookings for a specific room starting from a safe window
 * around today (yesterday 00:00 UTC to avoid timezone edge cutoffs) so payloads
 * stay small even with years of historical bookings.
 */
export async function getRoomApprovedSchedule(
  roomId: number
): Promise<ConferenceRoomRequest[]> {
  const host = await resolveConferenceHost();

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  // Subtract 12 hours as a timezone-safety buffer for server vs. kiosk TZ
  windowStart.setTime(windowStart.getTime() - 12 * 60 * 60 * 1000);
  const startFilter = windowStart.toISOString();

  const params = new URLSearchParams();
  params.set("filter[room_id][_eq]", String(roomId));
  params.set("filter[status][_eq]", "approved");
  params.set("filter[end_time][_gte]", startFilter);
  params.set("sort", "start_time");
  params.set("limit", "100");

  const rows = await directusFetch<unknown[]>(
    host,
    `/items/conference_room_request?${params.toString()}`
  );

  if (!Array.isArray(rows)) return [];

  return rows
    .map((item) => ConferenceRoomRequestSchema.safeParse(item))
    .filter(
      (parsed): parsed is { success: true; data: ConferenceRoomRequest } =>
        parsed.success && parsed.data.status.toLowerCase() === "approved"
    )
    .map((parsed) => parsed.data);
}

function isTruthyBit(
  val: number | boolean | { type?: string; data?: number[] } | null | undefined
): boolean {
  if (val === true || val === 1) return true;
  if (val && typeof val === "object" && Array.isArray(val.data)) {
    return val.data[0] === 1;
  }
  return false;
}

function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function verifyPassword(
  plainPassword: string,
  user: DirectusUserRow
): Promise<boolean> {
  const hashCandidate = user.hash_password?.trim();
  if (hashCandidate) {
    if (isBcryptHash(hashCandidate)) {
      const matched = await bcrypt.compare(plainPassword, hashCandidate);
      if (matched) return true;
    } else if (timingSafeStringEqual(plainPassword, hashCandidate)) {
      return true;
    }
  }

  const passwordCandidate = user.user_password?.trim();
  if (passwordCandidate) {
    if (isBcryptHash(passwordCandidate)) {
      const matched = await bcrypt.compare(plainPassword, passwordCandidate);
      if (matched) return true;
    } else if (timingSafeStringEqual(plainPassword, passwordCandidate)) {
      return true;
    }
  }

  return false;
}

export type AdminAuthResult =
  | {
      ok: true;
      admin: { userId: number; email: string; name: string };
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

/**
 * Verifies an admin's email and password against Directus `user` table.
 * Requires `isAdmin = 1` (and not blocked or deleted).
 */
export async function verifyAdminCredentials(
  email: string,
  password: string
): Promise<AdminAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { ok: false, error: "Email and password are required.", status: 400 };
  }

  const local = getLocalDirectusConfig();
  const fields = [
    "user_id",
    "user_email",
    "user_password",
    "hash_password",
    "user_fname",
    "user_lname",
    "isAdmin",
    "role",
    "is_blocked",
    "is_deleted",
    "isDeleted",
  ].join(",");

  const params = new URLSearchParams();
  params.set("filter[user_email][_icontains]", normalizedEmail);
  params.set("fields", fields);
  params.set("limit", "10");

  const users = await directusFetch<DirectusUserRow[]>(
    local,
    `/items/user?${params.toString()}`
  );

  const user = Array.isArray(users)
    ? users.find((u) => u.user_email?.trim().toLowerCase() === normalizedEmail)
    : undefined;

  if (!user) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }

  if (isTruthyBit(user.is_deleted) || isTruthyBit(user.isDeleted)) {
    return { ok: false, error: "This account is no longer active.", status: 403 };
  }

  if (user.is_blocked === 1 || user.is_blocked === true) {
    return { ok: false, error: "This account is currently blocked.", status: 403 };
  }

  const isAdmin =
    user.isAdmin === 1 ||
    user.isAdmin === true ||
    String(user.isAdmin) === "1";

  if (!isAdmin) {
    return {
      ok: false,
      error: "Administrator privileges are required to manage the kiosk.",
      status: 403,
    };
  }

  const validPassword = await verifyPassword(password, user);
  if (!validPassword) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }

  const fullName = [user.user_fname, user.user_lname]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    ok: true,
    admin: {
      userId: Number(user.user_id),
      email: user.user_email,
      name: fullName || user.user_email,
    },
  };
}
