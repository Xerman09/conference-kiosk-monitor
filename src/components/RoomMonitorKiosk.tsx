"use client";

import { useEffect, useMemo, useState } from "react";
import {
  differenceInMinutes,
  format,
  isAfter,
  isToday,
  isWithinInterval,
  parseISO,
} from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Lock,
  RefreshCw,
  User,
  WifiOff,
} from "lucide-react";
import { useRoomMonitor } from "@/hooks/useRoomMonitor";
import { AdminUnlockModal } from "./AdminUnlockModal";

interface RoomMonitorKioskProps {
  roomId: number;
}

export function RoomMonitorKiosk({ roomId }: RoomMonitorKioskProps) {
  const {
    room,
    meetings,
    isLoading,
    isLive,
    isReconnecting,
    error,
    lastSyncedAt,
    refresh,
  } = useRoomMonitor(roomId);

  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [unlockOpen, setUnlockOpen] = useState(false);

  // Live 1-second clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Screen Wake Lock so wall-mounted tablets stay awake
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let cancelled = false;

    async function requestWakeLock() {
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
        return;
      }
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLock = sentinel;
      } catch {
        // Wake lock may be denied on desktop or unsupported browsers; ignore safely
      }
    }

    void requestWakeLock();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock) {
        void wakeLock.release().catch(() => {});
      }
    };
  }, []);

  // Keyboard shortcut (Ctrl+Shift+L or Escape) to open Admin Unlock modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") || e.key === "Escape") {
        setUnlockOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const currentMeeting = useMemo(() => {
    return (
      meetings.find((req) => {
        try {
          const start = parseISO(req.start_time);
          const end = parseISO(req.end_time);
          return isWithinInterval(currentTime, { start, end });
        } catch {
          return false;
        }
      }) ?? null
    );
  }, [meetings, currentTime]);

  const upcomingMeetings = useMemo(() => {
    return meetings
      .filter((req) => {
        try {
          const start = parseISO(req.start_time);
          return isToday(start) && isAfter(start, currentTime);
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) =>
          parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
      );
  }, [meetings, currentTime]);

  const isOccupied = Boolean(currentMeeting);

  const meetingProgress = useMemo(() => {
    if (!currentMeeting) return null;
    try {
      const start = parseISO(currentMeeting.start_time).getTime();
      const end = parseISO(currentMeeting.end_time).getTime();
      const now = currentTime.getTime();
      const total = Math.max(end - start, 1);
      const elapsed = Math.min(Math.max(now - start, 0), total);
      const percent = Math.round((elapsed / total) * 100);
      const minsLeft = Math.max(
        0,
        differenceInMinutes(parseISO(currentMeeting.end_time), currentTime) + 1
      );
      return { percent, minsLeft };
    } catch {
      return null;
    }
  }, [currentMeeting, currentTime]);

  const nextMeeting = upcomingMeetings[0] ?? null;

  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden select-none bg-slate-950 text-white flex flex-col lg:flex-row transition-colors duration-700 ${
        unlockOpen ? "cursor-auto" : "cursor-none"
      }`}
    >
      {/* Ambient Status Glow */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${
          isOccupied
            ? "bg-[radial-gradient(ellipse_at_top_left,_rgba(225,29,72,0.28),_transparent_60%)]"
            : "bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.24),_transparent_60%)]"
        }`}
      />

      {/* Left Main Status Panel */}
      <main className="relative z-10 flex-1 flex flex-col justify-between p-8 sm:p-12 xl:p-16 border-b lg:border-b-0 lg:border-r border-slate-800/80">
        {/* Top Header: Room Name & Connection Pill */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`h-4 w-4 rounded-full ${
                isOccupied
                  ? "bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.9)] animate-pulse"
                  : "bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)]"
              }`}
            />
            <div>
              <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">
                Conference Room
              </p>
              <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-white">
                {room ? room.name : isLoading ? "Loading Room..." : `Room #${roomId}`}
              </h1>
            </div>
          </div>

          {isReconnecting && (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-1.5 text-xs font-semibold text-amber-200">
              <WifiOff className="h-3.5 w-3.5 animate-pulse" />
              Reconnecting...
            </div>
          )}
        </header>

        {/* Center Hero Status */}
        <section className="my-10 lg:my-0 flex flex-col justify-center">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-20 w-72 rounded-2xl bg-slate-800/70 animate-pulse" />
              <div className="h-6 w-96 max-w-full rounded-lg bg-slate-800/50 animate-pulse" />
            </div>
          ) : error && !lastSyncedAt ? (
            <div className="max-w-xl rounded-3xl border border-rose-500/30 bg-rose-950/30 p-8">
              <div className="flex items-center gap-3 text-rose-400 mb-3">
                <WifiOff className="h-7 w-7" />
                <span className="text-xl font-bold">Connection Issue</span>
              </div>
              <p className="text-slate-300 text-base leading-relaxed">
                Unable to load the room schedule right now. The display will
                automatically retry every 60 seconds.
              </p>
              <p className="mt-3 text-xs font-mono text-rose-300/80 break-all">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Now
              </button>
            </div>
          ) : (
            <>
              <div className="inline-flex items-center gap-3 mb-4">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-widest border ${
                    isOccupied
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isOccupied ? "bg-rose-500 animate-ping" : "bg-emerald-400"
                    }`}
                  />
                  {isOccupied ? "In Session" : "Available Now"}
                </span>
              </div>

              <div
                className={`text-6xl sm:text-7xl xl:text-[7.5rem] font-black tracking-tight leading-none ${
                  isOccupied ? "text-rose-500" : "text-emerald-400"
                }`}
              >
                {isOccupied ? "OCCUPIED" : "VACANT"}
              </div>

              {/* Current Meeting Card or Vacant Summary */}
              {currentMeeting ? (
                <div className="mt-8 max-w-3xl rounded-3xl border border-rose-500/30 bg-slate-900/80 backdrop-blur-sm p-6 sm:p-8 shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-rose-300 mb-3">
                    <span className="inline-flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {format(parseISO(currentMeeting.start_time), "h:mm a")} –{" "}
                      {format(parseISO(currentMeeting.end_time), "h:mm a")}
                    </span>
                    {meetingProgress && (
                      <span className="text-slate-300">
                        {meetingProgress.minsLeft} min remaining
                      </span>
                    )}
                  </div>

                  <h2 className="text-2xl sm:text-3xl xl:text-4xl font-bold text-white leading-tight">
                    {currentMeeting.title}
                  </h2>

                  {currentMeeting.purpose && (
                    <p className="mt-2 text-base sm:text-lg text-slate-300 line-clamp-2">
                      {currentMeeting.purpose}
                    </p>
                  )}

                  {currentMeeting.requested_by_name && (
                    <div className="mt-5 flex items-center gap-2.5 text-slate-300">
                      <User className="h-5 w-5 text-slate-400" />
                      <span className="text-base sm:text-lg font-medium">
                        Booked by {currentMeeting.requested_by_name}
                      </span>
                    </div>
                  )}

                  {meetingProgress && (
                    <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-1000"
                        style={{ width: `${meetingProgress.percent}%` }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-8 max-w-2xl rounded-3xl border border-emerald-500/25 bg-slate-900/60 backdrop-blur-sm p-6 sm:p-8">
                  <div className="flex items-center gap-3 text-emerald-300 mb-2">
                    <CheckCircle2 className="h-6 w-6" />
                    <span className="text-lg sm:text-xl font-semibold">
                      Room is free for immediate use
                    </span>
                  </div>
                  {nextMeeting ? (
                    <p className="text-slate-300 text-base sm:text-lg">
                      Next scheduled meeting at{" "}
                      <span className="font-semibold text-white">
                        {format(parseISO(nextMeeting.start_time), "h:mm a")}
                      </span>{" "}
                      — {nextMeeting.title}
                    </p>
                  ) : (
                    <p className="text-slate-400 text-base sm:text-lg">
                      No more approved bookings scheduled for the rest of today.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* Bottom Subtle Footer */}
        <footer className="flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            {isLive && !isReconnecting && (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
            <span>
              {lastSyncedAt
                ? `Synced ${format(lastSyncedAt, "h:mm:ss a")} · ${
                    isLive ? "Real-time WebSocket" : "Auto-refreshes every 60s"
                  }`
                : "Connecting to schedule service..."}
            </span>
          </span>
          <span className="hidden sm:inline">Room ID #{roomId}</span>
        </footer>
      </main>

      {/* Right Column: Live Clock + Upcoming Today */}
      <aside className="relative z-10 w-full lg:w-[40%] xl:w-[500px] bg-slate-900/75 backdrop-blur-md flex flex-col justify-between p-8 sm:p-10">
        {/* Live Clock & Date */}
        <div className="border-b border-slate-800 pb-6">
          <div className="font-mono text-5xl sm:text-6xl font-bold tracking-tight text-white tabular-nums">
            {format(currentTime, "h:mm:ss")}
            <span className="ml-2 text-2xl sm:text-3xl font-semibold text-slate-400">
              {format(currentTime, "a")}
            </span>
          </div>
          <p className="mt-2 text-base sm:text-lg font-medium text-slate-400">
            {format(currentTime, "EEEE, MMMM d, yyyy")}
          </p>
        </div>

        {/* Upcoming Today List */}
        <div className="flex-1 overflow-y-auto py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
              <CalendarClock className="h-4 w-4 text-indigo-400" />
              Upcoming Today
            </h2>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
              {upcomingMeetings.length}
            </span>
          </div>

          {upcomingMeetings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center">
              <p className="text-sm font-medium text-slate-400">
                No upcoming meetings for today.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {upcomingMeetings.map((meeting) => {
                const start = parseISO(meeting.start_time);
                const end = parseISO(meeting.end_time);
                return (
                  <li
                    key={meeting.id}
                    className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-4 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-indigo-300 mb-1.5">
                      <span>
                        {format(start, "h:mm a")} – {format(end, "h:mm a")}
                      </span>
                      <span className="text-slate-500">
                        {Math.max(1, differenceInMinutes(end, start))} min
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-white leading-snug">
                      {meeting.title}
                    </h3>
                    {meeting.requested_by_name && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                        <User className="h-3.5 w-3.5" />
                        {meeting.requested_by_name}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Bottom-Right Subtle Admin Unlock Trigger */}
        <div className="flex items-center justify-end pt-4 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setUnlockOpen(true)}
            title="Admin unlock (switch room)"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 opacity-30 hover:opacity-100 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5" />
            Admin
          </button>
        </div>
      </aside>

      <AdminUnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </div>
  );
}
