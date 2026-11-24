import { connection } from "next/server";
import {
  getConferenceRooms,
  getDirectusTargets,
  getRoomApprovedSchedule,
  type DirectusHostConfig,
} from "@/lib/directus";

function toWebSocketUrl(httpUrl: string): string {
  const trimmed = httpUrl.replace(/\/+$/, "");
  if (trimmed.startsWith("https://")) {
    return `wss://${trimmed.slice("https://".length)}/websocket`;
  }
  if (trimmed.startsWith("http://")) {
    return `ws://${trimmed.slice("http://".length)}/websocket`;
  }
  return `ws://${trimmed}/websocket`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> }
) {
  await connection();
  const { roomId: rawRoomId } = await context.params;
  const roomId = Number(rawRoomId);

  if (!Number.isInteger(roomId) || roomId <= 0) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid roomId parameter." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const activeSockets = new Set<WebSocket>();
      const reconnectTimers = new Set<ReturnType<typeof setTimeout>>();
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let deltaPollTimer: ReturnType<typeof setInterval> | null = null;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let liveCount = 0;
      let lastScheduleSignature = "";

      const sendEvent = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
            )
          );
        } catch {
          closed = true;
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
        // Keep Directus WebSockets alive across NAT/idle timeouts
        for (const ws of activeSockets) {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "ping" }));
            } catch {
              // ignore send error; close handler will reconnect
            }
          }
        }
      };

      const pushFreshSchedule = async (force = false) => {
        if (closed) return;
        try {
          const [rooms, schedule] = await Promise.all([
            getConferenceRooms(),
            getRoomApprovedSchedule(roomId),
          ]);
          const room = rooms.find((r) => r.id === roomId) ?? null;
          const signature = JSON.stringify({ room, schedule });

          if (!force && signature === lastScheduleSignature) {
            return;
          }

          lastScheduleSignature = signature;
          sendEvent("schedule", {
            success: true,
            room,
            data: schedule,
            fetchedAt: new Date().toISOString(),
          });
        } catch (err) {
          if (force) {
            sendEvent("status", {
              live: liveCount > 0,
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to refresh schedule",
            });
          }
        }
      };

      const scheduleDebouncedPush = () => {
        if (closed) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void pushFreshSchedule(true);
        }, 120);
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (deltaPollTimer) clearInterval(deltaPollTimer);
        if (debounceTimer) clearTimeout(debounceTimer);
        for (const t of reconnectTimers) clearTimeout(t);
        reconnectTimers.clear();
        for (const ws of activeSockets) {
          try {
            ws.close();
          } catch {
            // ignore close errors
          }
        }
        activeSockets.clear();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);

      // Push initial snapshot immediately in parallel with WebSocket setup
      void pushFreshSchedule(true);

      // Connect server-side to Directus WebSocket(s) with automatic reconnection
      let targets: DirectusHostConfig[] = [];
      try {
        targets = await getDirectusTargets();
      } catch {
        targets = [];
      }

      const connectTargetWebSocket = (
        target: DirectusHostConfig,
        attempt = 0
      ) => {
        if (closed) return;
        const wsUrl = toWebSocketUrl(target.url);

        try {
          const ws = new WebSocket(wsUrl);
          activeSockets.add(ws);
          let subscribed = false;

          const subscribeCollections = (socket: WebSocket) => {
            socket.send(
              JSON.stringify({
                type: "subscribe",
                uid: `room-${roomId}-requests`,
                collection: "conference_room_request",
                query: {
                  fields: [
                    "id",
                    "room_id",
                    "title",
                    "status",
                    "start_time",
                    "end_time",
                  ],
                },
              })
            );
            socket.send(
              JSON.stringify({
                type: "subscribe",
                uid: `room-${roomId}-meta`,
                collection: "conference_room",
                query: {
                  fields: ["id", "name"],
                },
              })
            );
          };

          ws.addEventListener("open", () => {
            if (closed) {
              ws.close();
              return;
            }
            if (target.token) {
              ws.send(
                JSON.stringify({
                  type: "auth",
                  access_token: target.token,
                })
              );
            } else {
              subscribeCollections(ws);
            }
          });

          ws.addEventListener("message", (event) => {
            if (closed) return;
            try {
              const raw =
                typeof event.data === "string"
                  ? event.data
                  : String(event.data);
              const msg = JSON.parse(raw) as {
                type?: string;
                status?: string;
                event?: string;
              };

              if (msg.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
                return;
              }

              if (msg.type === "auth" && msg.status === "ok") {
                subscribeCollections(ws);
                return;
              }

              if (msg.type === "subscription") {
                if (!subscribed) {
                  subscribed = true;
                  liveCount += 1;
                  sendEvent("status", { live: true });
                }
                if (
                  msg.event === "create" ||
                  msg.event === "update" ||
                  msg.event === "delete"
                ) {
                  scheduleDebouncedPush();
                }
              }
            } catch {
              // ignore non-JSON messages
            }
          });

          ws.addEventListener("close", () => {
            activeSockets.delete(ws);
            if (subscribed) {
              subscribed = false;
              liveCount = Math.max(0, liveCount - 1);
            }
            if (!closed) {
              if (liveCount === 0) {
                sendEvent("status", { live: false });
              }
              // Auto-reconnect Directus WebSocket with exponential backoff
              const delay = Math.min(2000 * Math.pow(1.5, attempt), 20_000);
              const timer = setTimeout(() => {
                reconnectTimers.delete(timer);
                connectTargetWebSocket(target, attempt + 1);
              }, delay);
              reconnectTimers.add(timer);
            }
          });

          ws.addEventListener("error", () => {
            // close handler performs cleanup & reconnect
          });
        } catch {
          // ignore individual host ws failures
        }
      };

      for (const target of targets) {
        connectTargetWebSocket(target);
      }

      // Keep SSE + Directus WebSocket alive every 20s
      heartbeatTimer = setInterval(sendHeartbeat, 20_000);

      // Fast 5s server-side delta check so changes made outside Directus API
      // (e.g., Spring Boot or direct MySQL edits) also push in near real-time
      deltaPollTimer = setInterval(() => {
        void pushFreshSchedule(false);
      }, 5_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
