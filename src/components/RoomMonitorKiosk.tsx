"use client";

import { useEffect, useMemo, useState } from "react";
import {
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  isToday,
  isWithinInterval,
  parseISO,
} from "date-fns";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Lock,
  Radio,
  RefreshCw,
  Sparkles,
  User,
  WifiOff,
} from "lucide-react";
import { useRoomMonitor } from "@/hooks/useRoomMonitor";
import { AdminUnlockModal } from "./AdminUnlockModal";

interface RoomMonitorKioskProps {
  roomId: number;
}

function formatDurationHuman(totalMinutes: number): string {
  const mins = Math.max(1, totalMinutes);
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours === 0) return `${rem}m`;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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
        // Ignore if unsupported or denied
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
      if (
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") ||
        e.key === "Escape"
      ) {
        setUnlockOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const todaysMeetings = useMemo(() => {
    return meetings
      .filter((req) => {
        try {
          return isToday(parseISO(req.start_time));
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) =>
          parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
      );
  }, [meetings]);

  const activeMeetings = useMemo(() => {
    return meetings.filter((req) => {
      try {
        const start = parseISO(req.start_time);
        const end = parseISO(req.end_time);
        return isWithinInterval(currentTime, { start, end });
      } catch {
        return false;
      }
    });
  }, [meetings, currentTime]);

  const currentMeeting = activeMeetings[0] ?? null;

  const upcomingMeetings = useMemo(() => {
    return todaysMeetings.filter((req) => {
      try {
        return isAfter(parseISO(req.start_time), currentTime);
      } catch {
        return false;
      }
    });
  }, [todaysMeetings, currentTime]);

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
        1,
        differenceInMinutes(parseISO(currentMeeting.end_time), currentTime) + 1
      );
      return { percent, minsLeft };
    } catch {
      return null;
    }
  }, [currentMeeting, currentTime]);

  const nextMeeting = upcomingMeetings[0] ?? null;

  const freeMinutesUntilNext = useMemo(() => {
    if (isOccupied || !nextMeeting) return null;
    try {
      return Math.max(
        1,
        differenceInMinutes(parseISO(nextMeeting.start_time), currentTime) + 1
      );
    } catch {
      return null;
    }
  }, [isOccupied, nextMeeting, currentTime]);

  // Day timeline window (8:00 AM to 6:00 PM)
  const timeline = useMemo(() => {
    const startHour = 8;
    const endHour = 18;
    const totalMins = (endHour - startHour) * 60;

    const toPct = (date: Date) => {
      const minsFromStart =
        (date.getHours() - startHour) * 60 + date.getMinutes();
      return Math.min(100, Math.max(0, (minsFromStart / totalMins) * 100));
    };

    const blocks = todaysMeetings.map((m) => {
      const s = parseISO(m.start_time);
      const e = parseISO(m.end_time);
      const left = toPct(s);
      const right = toPct(e);
      const width = Math.max(right - left, 1.5);
      const isActive = isWithinInterval(currentTime, { start: s, end: e });
      const isPast = isBefore(e, currentTime);
      return { id: m.id, title: m.title, left, width, isActive, isPast };
    });

    const nowPct = toPct(currentTime);
    const showNowMarker =
      currentTime.getHours() >= startHour && currentTime.getHours() <= endHour;

    return { blocks, nowPct, showNowMarker };
  }, [todaysMeetings, currentTime]);

  // SVG Ring Geometry
  const ringRadius = 94;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    isOccupied && meetingProgress
      ? ringCircumference * (1 - meetingProgress.percent / 100)
      : 0;

  return (
    <div
      className={`relative min-h-screen w-full overflow-x-hidden select-none bg-[#030712] text-white flex flex-col lg:flex-row transition-colors duration-700 ${
        unlockOpen ? "cursor-auto" : "cursor-none"
      }`}
    >
      {/* Left Signature Status Accent Rail */}
      <div
        className={`pointer-events-none fixed lg:absolute left-0 top-0 bottom-0 w-2 z-30 transition-all duration-700 ${
          isOccupied
            ? "bg-gradient-to-b from-rose-400 via-rose-500 to-red-600 shadow-[0_0_28px_rgba(244,63,94,0.85)]"
            : "bg-gradient-to-b from-emerald-300 via-emerald-400 to-teal-500 shadow-[0_0_28px_rgba(16,185,129,0.75)]"
        }`}
      />

      {/* Subtle Architectural Dot Grid */}
      <div className="pointer-events-none absolute inset-0 kiosk-grid-bg opacity-60" />

      {/* Layered Ambient Status Glow */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${
          isOccupied
            ? "bg-[radial-gradient(ellipse_75%_65%_at_18%_22%,_rgba(225,29,72,0.28),_transparent_65%),radial-gradient(ellipse_55%_55%_at_68%_78%,_rgba(244,63,94,0.14),_transparent_70%)]"
            : "bg-[radial-gradient(ellipse_75%_65%_at_18%_22%,_rgba(16,185,129,0.24),_transparent_65%),radial-gradient(ellipse_55%_55%_at_68%_78%,_rgba(20,184,166,0.12),_transparent_70%)]"
        }`}
      />

      {/* Left Main Stage */}
      <main className="relative z-10 flex-1 min-w-0 flex flex-col justify-between pl-10 pr-8 py-8 sm:pl-14 sm:pr-12 sm:py-10 xl:pl-16 xl:pr-14 xl:py-12 border-b lg:border-b-0 lg:border-r border-white/[0.08]">
        {/* Top Bar: Room Identity + Live Connection Badge */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-13 w-13 items-center justify-center rounded-2xl border backdrop-blur-md transition-colors duration-700 ${
                isOccupied
                  ? "bg-rose-500/15 border-rose-400/30 text-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.2)]"
                  : "bg-emerald-500/15 border-emerald-400/30 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.2)]"
              }`}
            >
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                Conference Room
              </p>
              <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-white">
                {room
                  ? room.name
                  : isLoading
                  ? "Loading Room..."
                  : `Room #${roomId}`}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isReconnecting ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-500/15 px-4 py-1.5 text-xs font-semibold text-amber-200 backdrop-blur-md">
                <WifiOff className="h-3.5 w-3.5 animate-pulse" />
                Reconnecting...
              </div>
            ) : isLive ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 backdrop-blur-md">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                LIVE
              </div>
            ) : null}
          </div>
        </header>

        {/* Center Hero Area */}
        <section className="my-8 lg:my-0 flex flex-col gap-8">
          {isLoading ? (
            <div className="space-y-5">
              <div className="h-8 w-40 rounded-full bg-white/[0.06] animate-pulse" />
              <div className="h-24 w-80 max-w-full rounded-2xl bg-white/[0.06] animate-pulse" />
              <div className="h-44 w-full rounded-3xl bg-white/[0.04] border border-white/[0.06] animate-pulse" />
            </div>
          ) : error && !lastSyncedAt ? (
            <div className="max-w-xl rounded-3xl border border-rose-500/30 bg-rose-950/30 backdrop-blur-xl p-8">
              <div className="flex items-center gap-3 text-rose-400 mb-3">
                <WifiOff className="h-7 w-7" />
                <span className="text-xl font-bold">Connection Issue</span>
              </div>
              <p className="text-slate-300 text-base leading-relaxed">
                Unable to load the room schedule right now. The display will
                automatically retry in the background.
              </p>
              <p className="mt-3 text-xs font-mono text-rose-300/80 break-all">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 cursor-pointer transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Now
              </button>
            </div>
          ) : (
            <>
              {/* Balanced 2-Part Hero: Status + Meeting Card (Left) & Countdown Ring (Right) */}
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] 2xl:grid-cols-[minmax(0,1fr)_290px] gap-8 items-center">
                <div className="min-w-0">
                  {/* Status Pill */}
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-[0.2em] border backdrop-blur-md ${
                        isOccupied
                          ? "bg-rose-500/15 text-rose-200 border-rose-400/35"
                          : "bg-emerald-500/15 text-emerald-200 border-emerald-400/35"
                      }`}
                    >
                      <span className="relative flex h-2.5 w-2.5">
                        {isOccupied && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                        )}
                        <span
                          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                            isOccupied ? "bg-rose-500" : "bg-emerald-400"
                          }`}
                        />
                      </span>
                      {isOccupied ? "In Session" : "Available Now"}
                    </span>

                    {isOccupied && meetingProgress && (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 backdrop-blur-md">
                        Ends in{" "}
                        <strong className="text-white">
                          {formatDurationHuman(meetingProgress.minsLeft)}
                        </strong>
                      </span>
                    )}

                    {!isOccupied && freeMinutesUntilNext && (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-300 backdrop-blur-md">
                        Free for{" "}
                        <strong className="text-emerald-300">
                          {formatDurationHuman(freeMinutesUntilNext)}
                        </strong>
                      </span>
                    )}
                  </div>

                  {/* Monumental Status Word */}
                  <div
                    className={`text-6xl sm:text-7xl xl:text-[7.5rem] 2xl:text-[8.5rem] font-black tracking-tighter leading-[0.94] bg-clip-text text-transparent ${
                      isOccupied
                        ? "bg-gradient-to-r from-rose-300 via-rose-500 to-red-500 drop-shadow-[0_0_40px_rgba(244,63,94,0.28)]"
                        : "bg-gradient-to-r from-emerald-200 via-emerald-400 to-teal-300 drop-shadow-[0_0_40px_rgba(16,185,129,0.25)]"
                    }`}
                  >
                    {isOccupied ? "OCCUPIED" : "VACANT"}
                  </div>

                  {/* Current Meeting or Available Card */}
                  {currentMeeting ? (
                    <div className="mt-7 rounded-3xl border border-rose-400/25 bg-white/[0.04] backdrop-blur-xl p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <span className="inline-flex items-center gap-2 rounded-xl bg-rose-500/15 border border-rose-400/25 px-3.5 py-1.5 text-sm sm:text-base font-semibold text-rose-200">
                          <Clock className="h-4 w-4 text-rose-400" />
                          {format(parseISO(currentMeeting.start_time), "h:mm a")}{" "}
                          – {format(parseISO(currentMeeting.end_time), "h:mm a")}
                        </span>
                        {meetingProgress && (
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {meetingProgress.percent}% elapsed
                          </span>
                        )}
                      </div>

                      <h2 className="text-3xl sm:text-4xl xl:text-[2.75rem] font-bold text-white leading-tight tracking-tight">
                        {currentMeeting.title}
                      </h2>

                      {currentMeeting.purpose && (
                        <p className="mt-2.5 text-base sm:text-lg text-slate-300/90 line-clamp-2">
                          {currentMeeting.purpose}
                        </p>
                      )}

                      {currentMeeting.requested_by_name && (
                        <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-200 border border-rose-400/30">
                            {getInitials(currentMeeting.requested_by_name)}
                          </div>
                          <div className="text-sm sm:text-base">
                            <span className="text-slate-400">Organizer · </span>
                            <span className="font-semibold text-white">
                              {currentMeeting.requested_by_name}
                            </span>
                          </div>
                        </div>
                      )}

                      {meetingProgress && (
                        <div className="mt-6">
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-rose-500 via-rose-400 to-orange-400 shadow-[0_0_16px_rgba(244,63,94,0.7)] transition-all duration-1000"
                              style={{ width: `${meetingProgress.percent}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs font-mono text-slate-400">
                            <span>
                              {format(
                                parseISO(currentMeeting.start_time),
                                "h:mm a"
                              )}
                            </span>
                            <span>
                              {format(
                                parseISO(currentMeeting.end_time),
                                "h:mm a"
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-7 rounded-3xl border border-emerald-400/20 bg-white/[0.035] backdrop-blur-xl p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                      <div className="flex items-center gap-3 text-emerald-300 mb-2">
                        <CheckCircle2 className="h-6 w-6" />
                        <span className="text-xl sm:text-2xl font-semibold text-white">
                          Room is open for immediate use
                        </span>
                      </div>
                      {nextMeeting ? (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/50 px-5 py-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                              Up Next
                            </p>
                            <p className="text-lg sm:text-xl font-semibold text-white mt-0.5">
                              {nextMeeting.title}
                            </p>
                          </div>
                          <span className="rounded-xl bg-emerald-500/15 border border-emerald-400/25 px-3.5 py-2 text-sm sm:text-base font-semibold text-emerald-200">
                            {format(parseISO(nextMeeting.start_time), "h:mm a")}
                          </span>
                        </div>
                      ) : (
                        <p className="text-slate-400 text-base sm:text-lg flex items-center gap-2 mt-2">
                          <Sparkles className="h-5 w-5 text-emerald-400/80" />
                          Clear schedule for the rest of today.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Right-of-Hero Circular Countdown / Status Ring (Desktop/TV) */}
                <div className="hidden xl:flex flex-col items-center justify-center">
                  <div className="relative flex h-60 w-60 2xl:h-68 2xl:w-68 items-center justify-center rounded-full bg-white/[0.02] border border-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                    <svg
                      className="h-full w-full -rotate-90 p-3"
                      viewBox="0 0 220 220"
                    >
                      <defs>
                        <linearGradient
                          id="kioskRingOccupied"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="#fb7185" />
                          <stop offset="55%" stopColor="#f43f5e" />
                          <stop offset="100%" stopColor="#fb923c" />
                        </linearGradient>
                        <linearGradient
                          id="kioskRingVacant"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="#6ee7b7" />
                          <stop offset="100%" stopColor="#14b8a6" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx="110"
                        cy="110"
                        r={ringRadius}
                        fill="none"
                        stroke="rgba(255,255,255,0.07)"
                        strokeWidth="12"
                      />
                      <circle
                        cx="110"
                        cy="110"
                        r={ringRadius}
                        fill="none"
                        stroke={
                          isOccupied
                            ? "url(#kioskRingOccupied)"
                            : "url(#kioskRingVacant)"
                        }
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                        className="transition-all duration-1000"
                      />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                      {isOccupied && meetingProgress && currentMeeting ? (
                        <>
                          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-rose-300/90">
                            Remaining
                          </span>
                          <span className="mt-1 font-mono text-4xl font-bold tracking-tight text-white">
                            {formatDurationHuman(meetingProgress.minsLeft)}
                          </span>
                          <span className="mt-2 text-xs text-slate-400">
                            Until{" "}
                            <strong className="text-slate-200">
                              {format(
                                parseISO(currentMeeting.end_time),
                                "h:mm a"
                              )}
                            </strong>
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-9 w-9 text-emerald-400 mb-2" />
                          <span className="text-2xl font-bold tracking-tight text-white">
                            {freeMinutesUntilNext
                              ? formatDurationHuman(freeMinutesUntilNext)
                              : "All Day"}
                          </span>
                          <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                            Available
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Full-Width Today's Visual Timeline Strip (8 AM – 6 PM) */}
              <div className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-md px-5 py-4">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-3">
                  <span>Today&apos;s Timeline</span>
                  <span className="font-mono text-slate-300">
                    {format(currentTime, "h:mm a")} · 8 AM – 6 PM
                  </span>
                </div>
                <div className="relative h-4 w-full rounded-full bg-white/[0.07] border border-white/[0.06] overflow-hidden">
                  {timeline.blocks.map((block) => (
                    <div
                      key={block.id}
                      title={block.title}
                      className={`absolute top-0 bottom-0 rounded-full transition-all ${
                        block.isActive
                          ? "bg-gradient-to-r from-rose-500 to-orange-400 shadow-[0_0_14px_rgba(244,63,94,0.85)] z-10"
                          : block.isPast
                          ? "bg-slate-600/50"
                          : "bg-indigo-400/75"
                      }`}
                      style={{
                        left: `${block.left}%`,
                        width: `${block.width}%`,
                      }}
                    />
                  ))}
                  {timeline.showNowMarker && (
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_#ffffff] z-20"
                      style={{ left: `${timeline.nowPct}%` }}
                    />
                  )}
                </div>
                <div className="mt-2.5 flex justify-between text-xs font-mono text-slate-400">
                  <span>8 AM</span>
                  <span>10 AM</span>
                  <span>12 PM</span>
                  <span>2 PM</span>
                  <span>4 PM</span>
                  <span>6 PM</span>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Bottom Subtle Metadata Footer */}
        <footer className="flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isReconnecting
                  ? "bg-amber-400 animate-pulse"
                  : isLive
                  ? "bg-emerald-400"
                  : "bg-slate-500"
              }`}
            />
            {lastSyncedAt
              ? `Synced ${format(lastSyncedAt, "h:mm:ss a")} · ${
                  isLive ? "Real-time WebSocket" : "Auto-refresh 60s"
                }`
              : "Connecting to schedule service..."}
          </span>
          <span className="hidden sm:inline font-mono text-slate-500">
            ROOM #{roomId}
          </span>
        </footer>
      </main>

      {/* Right Column: Oversized Clock + Today's Full Schedule */}
      <aside className="relative z-10 w-full lg:w-[380px] xl:w-[440px] 2xl:w-[480px] shrink-0 bg-slate-950/75 backdrop-blur-2xl flex flex-col justify-between p-7 sm:p-9">
        {/* Live Clock & Date */}
        <div className="border-b border-white/[0.08] pb-6">
          <div className="flex items-baseline gap-1 font-mono tracking-tight tabular-nums">
            <span className="text-5xl sm:text-6xl xl:text-[4rem] font-bold text-white leading-none">
              {format(currentTime, "h:mm")}
            </span>
            <span className="text-2xl sm:text-3xl font-medium text-slate-500">
              :{format(currentTime, "ss")}
            </span>
            <span className="ml-2 text-xl sm:text-2xl font-semibold text-indigo-300/90 uppercase">
              {format(currentTime, "a")}
            </span>
          </div>
          <p className="mt-2.5 text-base sm:text-lg font-medium text-slate-400">
            {format(currentTime, "EEEE, MMMM d, yyyy")}
          </p>
        </div>

        {/* Today's Schedule List (Active + Upcoming + Completed) */}
        <div className="flex-1 overflow-y-auto py-6 pr-1">
          <div className="flex items-center justify-between mb-5">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              <CalendarClock className="h-4 w-4 text-indigo-400" />
              Today&apos;s Schedule
            </h2>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-xs font-semibold text-slate-300">
              {todaysMeetings.length}
            </span>
          </div>

          {todaysMeetings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-400">
                No meetings scheduled today
              </p>
              <p className="mt-1 text-xs text-slate-500">
                New approved bookings will appear here automatically.
              </p>
            </div>
          ) : (
            <ul className="relative space-y-3.5 before:absolute before:left-[11px] before:top-3 before:bottom-3 before:w-px before:bg-white/[0.08]">
              {todaysMeetings.map((meeting) => {
                const start = parseISO(meeting.start_time);
                const end = parseISO(meeting.end_time);
                const durationMins = Math.max(
                  1,
                  differenceInMinutes(end, start)
                );
                const isActive = isWithinInterval(currentTime, { start, end });
                const isPast = isBefore(end, currentTime);
                const isNext = !isActive && nextMeeting?.id === meeting.id;

                return (
                  <li key={meeting.id} className="relative pl-8">
                    <span
                      className={`absolute left-[6px] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-slate-950 ${
                        isActive
                          ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)]"
                          : isNext
                          ? "bg-indigo-400"
                          : isPast
                          ? "bg-slate-700"
                          : "bg-slate-500"
                      }`}
                    />
                    <div
                      className={`rounded-2xl border p-4 transition-all ${
                        isActive
                          ? "border-rose-400/35 bg-rose-500/[0.10] shadow-[0_8px_24px_rgba(244,63,94,0.12)]"
                          : isNext
                          ? "border-indigo-400/30 bg-indigo-500/[0.08]"
                          : isPast
                          ? "border-white/[0.05] bg-white/[0.015] opacity-55"
                          : "border-white/[0.07] bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold mb-1.5">
                        <span
                          className={
                            isActive
                              ? "text-rose-200"
                              : isNext
                              ? "text-indigo-200"
                              : "text-slate-300"
                          }
                        >
                          {format(start, "h:mm a")} – {format(end, "h:mm a")}
                        </span>

                        {isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                            Now
                          </span>
                        ) : isNext ? (
                          <span className="rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                            Next
                          </span>
                        ) : isPast ? (
                          <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Ended
                          </span>
                        ) : (
                          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-400">
                            {formatDurationHuman(durationMins)}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base sm:text-lg font-semibold text-white leading-snug">
                        {meeting.title}
                      </h3>

                      {meeting.requested_by_name && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                          <User className="h-3.5 w-3.5 text-slate-500" />
                          {meeting.requested_by_name}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Bottom-Right Subtle Admin Unlock Trigger */}
        <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
          <span className="text-xs text-slate-500">
            {todaysMeetings.length}{" "}
            {todaysMeetings.length === 1 ? "booking" : "bookings"} today
          </span>
          <button
            type="button"
            onClick={() => setUnlockOpen(true)}
            title="Admin unlock (switch room)"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 opacity-35 hover:opacity-100 hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer"
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
