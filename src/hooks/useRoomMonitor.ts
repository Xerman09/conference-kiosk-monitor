"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConferenceRoom, ConferenceRoomRequest } from "@/lib/types";

interface ScheduleResponse {
  success: boolean;
  room: ConferenceRoom | null;
  data: ConferenceRoomRequest[];
  fetchedAt?: string;
  error?: string;
}

export interface RoomMonitorState {
  room: ConferenceRoom | null;
  meetings: ConferenceRoomRequest[];
  isLoading: boolean;
  isLive: boolean;
  isReconnecting: boolean;
  error: string | null;
  lastSyncedAt: Date | null;
  refresh: () => Promise<void>;
}

const FALLBACK_POLL_INTERVAL_MS = 60_000;

export function useRoomMonitor(roomId: number): RoomMonitorState {
  const [room, setRoom] = useState<ConferenceRoom | null>(null);
  const [meetings, setMeetings] = useState<ConferenceRoomRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const hasLoadedOnce = useRef(false);

  const applySchedulePayload = useCallback((json: ScheduleResponse) => {
    setRoom(json.room);
    setMeetings(Array.isArray(json.data) ? json.data : []);
    setError(null);
    setIsReconnecting(false);
    setLastSyncedAt(json.fetchedAt ? new Date(json.fetchedAt) : new Date());
    setIsLoading(false);
    hasLoadedOnce.current = true;
  }, []);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/rooms/${roomId}/schedule`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ScheduleResponse;

      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      applySchedulePayload(json);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to reach schedule server";
      setError(message);
      if (hasLoadedOnce.current) {
        setIsReconnecting(true);
      }
      setIsLoading(false);
    }
  }, [roomId, applySchedulePayload]);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelayMs = 2000;

    const connectStream = () => {
      if (!active) return;

      try {
        eventSource = new EventSource(`/api/kiosk/rooms/${roomId}/stream`);

        eventSource.addEventListener("schedule", (ev) => {
          if (!active) return;
          try {
            const payload = JSON.parse(ev.data) as ScheduleResponse;
            if (payload.success) {
              retryDelayMs = 2000;
              applySchedulePayload(payload);
            }
          } catch {
            // ignore malformed frames
          }
        });

        eventSource.addEventListener("status", (ev) => {
          if (!active) return;
          try {
            const payload = JSON.parse(ev.data) as {
              live?: boolean;
              error?: string;
            };
            if (typeof payload.live === "boolean") {
              setIsLive(payload.live);
            }
          } catch {
            // ignore malformed status frames
          }
        });

        eventSource.onerror = () => {
          if (!active) return;
          setIsLive(false);
          if (hasLoadedOnce.current) {
            setIsReconnecting(true);
          }
          eventSource?.close();
          eventSource = null;

          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            retryDelayMs = Math.min(retryDelayMs * 1.5, 30_000);
            connectStream();
          }, retryDelayMs);
        };
      } catch {
        setIsLive(false);
      }
    };

    connectStream();

    // Safety-net 60s background poll in case WebSocket/SSE is blocked by a proxy
    const pollInterval = setInterval(() => {
      if (!active) return;
      void fetch(`/api/kiosk/rooms/${roomId}/schedule`, { cache: "no-store" })
        .then((res) => res.json() as Promise<ScheduleResponse>)
        .then((json) => {
          if (!active) return;
          if (json.success) {
            applySchedulePayload(json);
          }
        })
        .catch(() => {
          if (!active) return;
          if (hasLoadedOnce.current) {
            setIsReconnecting(true);
          }
        });
    }, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(pollInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [roomId, applySchedulePayload]);

  return {
    room,
    meetings,
    isLoading,
    isLive,
    isReconnecting,
    error,
    lastSyncedAt,
    refresh: fetchSchedule,
  };
}
