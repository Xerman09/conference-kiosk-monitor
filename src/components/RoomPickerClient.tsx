"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  DoorOpen,
  Lock,
  LogOut,
  Monitor,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { ConferenceRoom } from "@/lib/types";

interface RoomPickerClientProps {
  adminName: string;
  adminEmail: string;
}

export function RoomPickerClient({
  adminName,
  adminEmail,
}: RoomPickerClientProps) {
  const router = useRouter();
  const [rooms, setRooms] = useState<ConferenceRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lockOnLaunch, setLockOnLaunch] = useState(true);
  const [launchingId, setLaunchingId] = useState<number | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadRooms = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kiosk/rooms", { cache: "no-store" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: ConferenceRoom[];
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load conference rooms.");
      }
      setRooms(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load conference rooms."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const res = await fetch("/api/kiosk/rooms", { cache: "no-store" });
        const json = (await res.json()) as {
          success?: boolean;
          data?: ConferenceRoom[];
          error?: string;
        };
        if (!active) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load conference rooms.");
        }
        setRooms(Array.isArray(json.data) ? json.data : []);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to load conference rooms."
        );
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, []);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || String(r.id).includes(q)
    );
  }, [rooms, search]);

  async function handleLaunchRoom(roomId: number) {
    setLaunchingId(roomId);
    try {
      if (lockOnLaunch) {
        // Clear admin session cookie so navigating back requires admin login again
        await fetch("/api/auth/logout", { method: "POST" });
      }
      router.push(`/kiosk/conference-room/${roomId}`);
    } finally {
      setLaunchingId(null);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Top Admin Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Monitor className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Conference Room Kiosk
              </h1>
              <p className="text-xs text-slate-400">
                Select a room to launch full-screen signage mode
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="font-medium text-slate-200">{adminName}</span>
              <span className="text-slate-500">({adminEmail})</span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isSigningOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conference rooms..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={lockOnLaunch}
                onChange={(e) => setLockOnLaunch(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              Lock admin session on launch
            </label>

            <button
              type="button"
              onClick={() => void loadRooms()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Unable to load conference rooms</p>
              <p className="mt-1 text-xs text-rose-300/80">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadRooms()}
              className="rounded-xl bg-rose-500/20 px-3.5 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-36 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 animate-pulse"
              />
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
            <DoorOpen className="mx-auto h-10 w-10 text-slate-600 mb-3" />
            <p className="text-base font-semibold text-slate-300">
              {rooms.length === 0
                ? "No conference rooms found"
                : "No rooms match your search"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {rooms.length === 0
                ? "Check that the Directus conference_room collection has entries."
                : "Try a different room name or ID."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRooms.map((room) => {
              const isLaunching = launchingId === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  disabled={launchingId !== null}
                  onClick={() => void handleLaunchRoom(room.id)}
                  className="group text-left rounded-2xl border border-slate-800 bg-slate-900/70 p-6 hover:border-indigo-500/60 hover:bg-slate-900 transition-all shadow-lg hover:shadow-indigo-500/10 disabled:opacity-60 cursor-pointer flex flex-col justify-between min-h-[144px]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                      <DoorOpen className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-mono text-slate-400">
                      ID #{room.id}
                    </span>
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white group-hover:text-indigo-200 transition-colors">
                        {room.name}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isLaunching
                          ? "Launching kiosk..."
                          : "Launch full-screen monitor"}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
