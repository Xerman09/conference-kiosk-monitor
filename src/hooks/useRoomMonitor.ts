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
  isReconnecting: boolean;
  error: string | null;
  lastSyncedAt: Date | null;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 60_000;

export function useRoomMonitor(roomId: number): RoomMonitorState {
  const [room, setRoom] = useState<ConferenceRoom | null>(null);
  const [meetings, setMeetings] = useState<ConferenceRoomRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const hasLoadedOnce = useRef(false);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/rooms/${roomId}/schedule`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ScheduleResponse;

      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setRoom(json.room);
      setMeetings(Array.isArray(json.data) ? json.data : []);
      setError(null);
      setIsReconnecting(false);
      setLastSyncedAt(json.fetchedAt ? new Date(json.fetchedAt) : new Date());
      hasLoadedOnce.current = true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to reach schedule server";
      setError(message);
      if (hasLoadedOnce.current) {
        // Keep displaying last known schedule with subtle reconnecting badge
        setIsReconnecting(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/kiosk/rooms/${roomId}/schedule`, {
          cache: "no-store",
        });
        const json = (await res.json()) as ScheduleResponse;
        if (!active) return;

        if (!res.ok || !json.success) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }

        setRoom(json.room);
        setMeetings(Array.isArray(json.data) ? json.data : []);
        setError(null);
        setIsReconnecting(false);
        setLastSyncedAt(json.fetchedAt ? new Date(json.fetchedAt) : new Date());
        hasLoadedOnce.current = true;
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Unable to reach schedule server";
        setError(message);
        if (hasLoadedOnce.current) {
          setIsReconnecting(true);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [roomId]);

  return {
    room,
    meetings,
    isLoading,
    isReconnecting,
    error,
    lastSyncedAt,
    refresh: fetchSchedule,
  };
}
