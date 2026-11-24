"use client";

import { useEffect, useMemo, useState } from "react";
import {
  differenceInMinutes,
  differenceInSeconds,
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
  Maximize2,
  Minimize2,
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

function formatCountdownClock(totalSeconds: number): {
  primary: string;
  label: string;
} {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return {
      primary: `${hours}:${String(mins).padStart(2, "0")}`,
      label: "HRS : MINS LEFT",
    };
  }
  return {
    primary: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
    label: "MINS : SECS LEFT",
  };
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const TIMELINE_HOURS = [8, 10, 12, 14, 16, 18];
const DIAL_TICKS = Array.from({ length: 60 }, (_, i) => i);

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Live 1-second clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Track fullscreen state
  useEffect(() => {
    function handleFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleFsChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFsChange);
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

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial
    }
  }

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
  const overlappingCount = Math.max(0, activeMeetings.length - 1);

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
      const startDate = parseISO(currentMeeting.start_time);
      const endDate = parseISO(currentMeeting.end_time);
      const total = Math.max(endDate.getTime() - startDate.getTime(), 1);
      const elapsed = Math.min(
        Math.max(currentTime.getTime() - startDate.getTime(), 0),
        total
      );
      const percent = Math.round((elapsed / total) * 100);
      const secsLeft = Math.max(0, differenceInSeconds(endDate, currentTime));
      const durationMins = Math.max(1, differenceInMinutes(endDate, startDate));
      return { percent, secsLeft, durationMins };
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
      const width = Math.max(right - left, 1.8);
      const isActive = isWithinInterval(currentTime, { start: s, end: e });
      const isPast = isBefore(e, currentTime);
      return { id: m.id, title: m.title, left, width, isActive, isPast };
    });

    const nowPct = toPct(currentTime);
    const showNowMarker =
      currentTime.getHours() >= startHour && currentTime.getHours() <= endHour;

    return { blocks, nowPct, showNowMarker };
  }, [todaysMeetings, currentTime]);

  // Chronograph SVG Ring Geometry
  const ringRadius = 104;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    isOccupied && meetingProgress
      ? ringCircumference * (1 - meetingProgress.percent / 100)
      : 0;

  const countdown = meetingProgress
    ? formatCountdownClock(meetingProgress.secsLeft)
    : null;

  return (
    <div
      className={`relative min-h-screen lg:h-screen w-full overflow-x-hidden lg:overflow-hidden select-none bg-[#02050d] text-white flex flex-col lg:flex-row transition-colors duration-1000 ${
        unlockOpen ? "cursor-auto" : "cursor-none"
      }`}
    >
      {/* Signature Left & Top Luminous Status Rails */}
      <div
        className={`pointer-events-none fixed lg:absolute left-0 top-0 bottom-0 w-2 z-30 transition-all duration-1000 ${
          isOccupied
            ? "bg-gradient-to-b from-rose-300 via-rose-500 to-red-600 shadow-[0_0_32px_rgba(244,63,94,0.9)]"
            : "bg-gradient-to-b from-emerald-200 via-emerald-400 to-teal-500 shadow-[0_0_32px_rgba(16,185,129,0.85)]"
        }`}
      />
      <div
        className={`pointer-events-none absolute left-0 right-0 top-0 h-[2px] z-30 transition-all duration-1000 ${
          isOccupied
            ? "bg-gradient-to-r from-rose-400 via-rose-500/40 to-transparent"
            : "bg-gradient-to-r from-emerald-300 via-emerald-400/40 to-transparent"
        }`}
      />

      {/* Subtle Architectural Dot Grid */}
      <div className="pointer-events-none absolute inset-0 kiosk-grid-bg opacity-55" />

      {/* Breathing Layered Ambient Aurora */}
      <div
        className={`pointer-events-none absolute inset-0 animate-kiosk-breathe transition-all duration-1000 ${
          isOccupied
            ? "bg-[radial-gradient(ellipse_70%_60%_at_16%_20%,_rgba(225,29,72,0.30),_transparent_62%),radial-gradient(ellipse_48%_52%_at_64%_76%,_rgba(251,113,133,0.13),_transparent_68%)]"
            : "bg-[radial-gradient(ellipse_70%_60%_at_16%_20%,_rgba(16,185,129,0.26),_transparent_62%),radial-gradient(ellipse_48%_52%_at_64%_76%,_rgba(45,212,191,0.12),_transparent_68%)]"
        }`}
      />

      {/* Left Main Signage Stage */}
      <main className="relative z-10 flex-1 min-w-0 flex flex-col justify-between pl-10 pr-8 py-7 sm:pl-14 sm:pr-12 sm:py-9 xl:pl-16 xl:pr-14 xl:py-10 border-b lg:border-b-0 lg:border-r border-white/[0.08]">
        {/* Top Bar: Room Identity + Live Telemetry Pill */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-13 w-13 items-center justify-center rounded-2xl border backdrop-blur-xl transition-all duration-700 ${
                isOccupied
                  ? "bg-rose-500/15 border-rose-400/35 text-rose-200 shadow-[0_0_28px_rgba(244,63,94,0.25)]"
                  : "bg-emerald-500/15 border-emerald-400/35 text-emerald-200 shadow-[0_0_28px_rgba(16,185,129,0.25)]"
              }`}
            >
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Conference Room
              </p>
              <h1 className="text-3xl sm:text-4xl xl:text-[2.75rem] font-bold tracking-tight text-white leading-tight">
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
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-500/15 px-4 py-1.5 text-xs font-semibold text-amber-200 backdrop-blur-xl">
                <WifiOff className="h-3.5 w-3.5 animate-pulse" />
                Reconnecting...
              </div>
            ) : isLive ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold tracking-wider text-emerald-300 backdrop-blur-xl shadow-[0_0_18px_rgba(16,185,129,0.15)]">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                LIVE SYNC
              </div>
            ) : null}
          </div>
        </header>

        {/* Center Hero Stage */}
        <section className="my-8 lg:my-0 flex flex-col gap-7 xl:gap-9">
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
              {/* Hero Grid: Status & Editorial Meeting Card (Left) + Chronograph Dial (Right) */}
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_310px] gap-8 xl:gap-10 items-center">
                <div className="min-w-0">
                  {/* Status Eyebrow */}
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-[0.22em] border backdrop-blur-xl ${
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

                    {overlappingCount > 0 && (
                      <span className="rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200">
                        +{overlappingCount} overlapping{" "}
                        {overlappingCount === 1 ? "booking" : "bookings"}
                      </span>
                    )}
                  </div>

                  {/* Monumental Status Headline */}
                  <div
                    className={`text-6xl sm:text-7xl xl:text-[7.25rem] 2xl:text-[8.5rem] font-black tracking-[-0.04em] leading-[0.92] bg-clip-text text-transparent ${
                      isOccupied
                        ? "bg-gradient-to-br from-white via-rose-300 to-rose-500 drop-shadow-[0_8px_42px_rgba(244,63,94,0.32)]"
                        : "bg-gradient-to-br from-white via-emerald-200 to-teal-400 drop-shadow-[0_8px_42px_rgba(16,185,129,0.28)]"
                    }`}
                  >
                    {isOccupied ? "OCCUPIED" : "VACANT"}
                  </div>

                  {/* Editorial Current Meeting or Open Card */}
                  {currentMeeting ? (
                    <div className="relative mt-7 overflow-hidden rounded-3xl border border-white/[0.11] bg-gradient-to-b from-white/[0.06] to-white/[0.025] backdrop-blur-2xl p-6 sm:p-8 shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
                      {/* Subtle Top Specular Edge */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-300/40 to-transparent" />

                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <span className="inline-flex items-center gap-2 rounded-xl bg-rose-500/15 border border-rose-400/25 px-3.5 py-1.5 text-sm sm:text-base font-semibold text-rose-100">
                          <Clock className="h-4 w-4 text-rose-400" />
                          {format(parseISO(currentMeeting.start_time), "h:mm a")}{" "}
                          – {format(parseISO(currentMeeting.end_time), "h:mm a")}
                        </span>

                        {meetingProgress && (
                          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold tracking-wider text-slate-300">
                            {formatDurationHuman(meetingProgress.durationMins)}{" "}
                            session
                          </span>
                        )}
                      </div>

                      <h2 className="text-3xl sm:text-4xl xl:text-[2.75rem] font-bold text-white leading-[1.1] tracking-tight">
                        {currentMeeting.title}
                      </h2>

                      {currentMeeting.purpose && (
                        <p className="mt-3 text-base sm:text-lg text-slate-300/90 line-clamp-2">
                          {currentMeeting.purpose}
                        </p>
                      )}

                      {currentMeeting.requested_by_name && (
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-5 border-t border-white/[0.08]">
                          <div className="inline-flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-400/30 to-orange-400/20 text-xs font-bold text-rose-100 border border-rose-300/30 shadow-inner">
                              {getInitials(currentMeeting.requested_by_name)}
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Organizer
                              </p>
                              <p className="text-sm sm:text-base font-semibold text-white">
                                {currentMeeting.requested_by_name}
                              </p>
                            </div>
                          </div>

                          {/* Compact progress pill for <xl screens where dial is hidden */}
                          {meetingProgress && countdown && (
                            <div className="xl:hidden text-right">
                              <p className="font-mono text-lg font-bold text-rose-200">
                                {countdown.primary}
                              </p>
                              <p className="text-[10px] font-semibold tracking-widest text-slate-400">
                                {countdown.label}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative mt-7 overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-b from-white/[0.055] to-white/[0.02] backdrop-blur-2xl p-6 sm:p-8 shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/40 to-transparent" />

                      <div className="flex items-center gap-3 text-emerald-300 mb-2">
                        <CheckCircle2 className="h-6 w-6" />
                        <span className="text-xl sm:text-2xl font-semibold text-white">
                          Room is open for immediate use
                        </span>
                      </div>
                      {nextMeeting ? (
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/60 px-5 py-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
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

                {/* Chronograph Countdown / Status Dial (xl+ screens) */}
                <div className="hidden xl:flex flex-col items-center justify-center">
                  <div className="relative flex h-[272px] w-[272px] 2xl:h-[296px] 2xl:w-[296px] items-center justify-center rounded-full bg-gradient-to-b from-white/[0.05] to-white/[0.015] border border-white/[0.09] shadow-[0_28px_72px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
                    <svg
                      className="h-full w-full p-2.5"
                      viewBox="0 0 240 240"
                    >
                      <defs>
                        <linearGradient
                          id="kioskDialOccupied"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="#fda4af" />
                          <stop offset="50%" stopColor="#f43f5e" />
                          <stop offset="100%" stopColor="#fb923c" />
                        </linearGradient>
                        <linearGradient
                          id="kioskDialVacant"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="#a7f3d0" />
                          <stop offset="50%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#14b8a6" />
                        </linearGradient>
                      </defs>

                      {/* Precision outer dial ticks */}
                      <g>
                        {DIAL_TICKS.map((tick) => {
                          const angle = (tick / 60) * 360;
                          const isMajor = tick % 5 === 0;
                          return (
                            <line
                              key={tick}
                              x1="120"
                              y1={isMajor ? "5" : "8"}
                              x2="120"
                              y2="12"
                              stroke={
                                isMajor
                                  ? "rgba(255,255,255,0.28)"
                                  : "rgba(255,255,255,0.10)"
                              }
                              strokeWidth={isMajor ? "1.6" : "1"}
                              strokeLinecap="round"
                              transform={`rotate(${angle} 120 120)`}
                            />
                          );
                        })}
                      </g>

                      {/* Background track */}
                      <circle
                        cx="120"
                        cy="120"
                        r={ringRadius}
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="10"
                        transform="rotate(-90 120 120)"
                      />

                      {/* Active glowing progress arc */}
                      <circle
                        cx="120"
                        cy="120"
                        r={ringRadius}
                        fill="none"
                        stroke={
                          isOccupied
                            ? "url(#kioskDialOccupied)"
                            : "url(#kioskDialVacant)"
                        }
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                        transform="rotate(-90 120 120)"
                        className="transition-all duration-1000"
                        style={{
                          filter: isOccupied
                            ? "drop-shadow(0 0 10px rgba(244,63,94,0.65))"
                            : "drop-shadow(0 0 10px rgba(52,211,153,0.55))",
                        }}
                      />
                    </svg>

                    {/* Center Readout */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
                      {isOccupied && countdown && currentMeeting ? (
                        <>
                          <span className="font-mono text-5xl 2xl:text-[3.4rem] font-bold tracking-tight text-white tabular-nums leading-none">
                            {countdown.primary}
                          </span>
                          <span className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-rose-300/90">
                            {countdown.label}
                          </span>
                          <div className="mt-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                            Ends{" "}
                            <strong className="text-white">
                              {format(
                                parseISO(currentMeeting.end_time),
                                "h:mm a"
                              )}
                            </strong>
                          </div>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-2" />
                          <span className="text-3xl font-bold tracking-tight text-white">
                            {freeMinutesUntilNext
                              ? formatDurationHuman(freeMinutesUntilNext)
                              : "All Day"}
                          </span>
                          <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300/85">
                            Open Window
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Architectural Full-Width Timeline Strip (8 AM – 6 PM) */}
              <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl px-6 pt-5 pb-4">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-7">
                  <span>Today&apos;s Timeline</span>
                  <div className="flex items-center gap-4 text-[11px] font-medium normal-case tracking-normal text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Active
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-indigo-400" />
                      Upcoming
                    </span>
                  </div>
                </div>

                {/* Track with Floating NOW Pill */}
                <div className="relative">
                  {timeline.showNowMarker && (
                    <div
                      className="absolute -top-7 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none"
                      style={{ left: `${timeline.nowPct}%` }}
                    >
                      <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-slate-950 shadow-[0_4px_14px_rgba(255,255,255,0.45)] whitespace-nowrap">
                        {format(currentTime, "h:mm a")}
                      </span>
                    </div>
                  )}

                  <div className="relative h-7 w-full rounded-xl bg-white/[0.05] border border-white/[0.07] overflow-hidden">
                    {/* Subtle hourly vertical gridlines */}
                    {TIMELINE_HOURS.slice(1, -1).map((hour) => {
                      const pct = ((hour - 8) / 10) * 100;
                      return (
                        <div
                          key={hour}
                          className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/[0.07]"
                          style={{ left: `${pct}%` }}
                        />
                      );
                    })}

                    {/* Booking Segments */}
                    {timeline.blocks.map((block) => (
                      <div
                        key={block.id}
                        title={block.title}
                        className={`absolute top-1 bottom-1 rounded-lg flex items-center px-2.5 overflow-hidden transition-all ${
                          block.isActive
                            ? "bg-gradient-to-r from-rose-500/90 to-orange-400/90 shadow-[0_0_16px_rgba(244,63,94,0.65)] z-10"
                            : block.isPast
                            ? "bg-slate-600/45"
                            : "bg-indigo-500/75"
                        }`}
                        style={{
                          left: `${block.left}%`,
                          width: `${block.width}%`,
                        }}
                      >
                        {block.width >= 10 && (
                          <span className="truncate text-[11px] font-semibold text-white drop-shadow-sm">
                            {block.title}
                          </span>
                        )}
                      </div>
                    ))}

                    {/* Glowing White NOW Needle */}
                    {timeline.showNowMarker && (
                      <div
                        className="absolute top-0 bottom-0 w-[2.5px] bg-white shadow-[0_0_12px_#ffffff] z-20"
                        style={{ left: `${timeline.nowPct}%` }}
                      />
                    )}
                  </div>
                </div>

                {/* Hour Axis */}
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

        {/* Bottom Subtle Telemetry Footer */}
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
      <aside className="relative z-10 w-full lg:w-[370px] xl:w-[420px] 2xl:w-[460px] shrink-0 bg-[#050a16]/90 backdrop-blur-2xl flex flex-col justify-between p-7 sm:p-8">
        {/* Live Clock Header */}
        <div className="border-b border-white/[0.08] pb-6">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1 font-mono tracking-tight tabular-nums">
              <span className="text-5xl sm:text-6xl xl:text-[4rem] font-bold text-white leading-none">
                {format(currentTime, "h:mm")}
              </span>
              <span className="text-2xl sm:text-3xl font-medium text-slate-500">
                :{format(currentTime, "ss")}
              </span>
            </div>
            <span className="rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 font-mono text-sm font-bold text-indigo-200 uppercase">
              {format(currentTime, "a")}
            </span>
          </div>
          <p className="mt-3 text-base sm:text-lg font-medium text-slate-300">
            {format(currentTime, "EEEE, MMMM d")}
            <span className="text-slate-500">
              , {format(currentTime, "yyyy")}
            </span>
          </p>
        </div>

        {/* Today's Schedule List */}
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
            <ul className="space-y-3">
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
                  <li
                    key={meeting.id}
                    className={`relative overflow-hidden rounded-2xl border p-4 pl-5 transition-all ${
                      isActive
                        ? "border-rose-400/35 bg-gradient-to-r from-rose-500/[0.14] to-rose-500/[0.04] shadow-[0_10px_28px_rgba(244,63,94,0.14)]"
                        : isNext
                        ? "border-indigo-400/30 bg-indigo-500/[0.09]"
                        : isPast
                        ? "border-white/[0.05] bg-white/[0.015] opacity-50"
                        : "border-white/[0.08] bg-white/[0.03]"
                    }`}
                  >
                    {/* Left Status Bar inside Card */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1 ${
                        isActive
                          ? "bg-gradient-to-b from-rose-400 to-orange-400"
                          : isNext
                          ? "bg-indigo-400"
                          : isPast
                          ? "bg-slate-700"
                          : "bg-slate-500"
                      }`}
                    />

                    <div className="flex items-center justify-between gap-2 text-xs font-semibold mb-1.5">
                      <span
                        className={
                          isActive
                            ? "text-rose-100"
                            : isNext
                            ? "text-indigo-200"
                            : "text-slate-300"
                        }
                      >
                        {format(start, "h:mm a")} – {format(end, "h:mm a")}
                      </span>

                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/25 border border-rose-400/35 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-100">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                          In Progress
                        </span>
                      ) : isNext ? (
                        <span className="rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                          Next Up
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Bottom Subtle Controls: Fullscreen + Admin Unlock */}
        <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
          <span className="text-xs text-slate-500">
            {todaysMeetings.length}{" "}
            {todaysMeetings.length === 1 ? "booking" : "bookings"} today
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 opacity-35 hover:opacity-100 hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
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
        </div>
      </aside>

      <AdminUnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </div>
  );
}
