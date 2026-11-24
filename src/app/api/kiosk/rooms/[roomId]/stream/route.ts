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
      const sockets: WebSocket[] = [];
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let liveCount = 0;

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
      };

      const pushFreshSchedule = async () => {
        if (closed) return;
        try {
          const [rooms, schedule] = await Promise.all([
            getConferenceRooms(),
            getRoomApprovedSchedule(roomId),
          ]);
          const room = rooms.find((r) => r.id === roomId) ?? null;
          sendEvent("schedule", {
            success: true,
            room,
            data: schedule,
            fetchedAt: new Date().toISOString(),
          });
        } catch (err) {
          sendEvent("status", {
            live: liveCount > 0,
            error:
              err instanceof Error
                ? err.message
                : "Failed to refresh schedule",
          });
        }
      };

      const scheduleDebouncedPush = () => {
        if (closed) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void pushFreshSchedule();
        }, 120);
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (debounceTimer) clearTimeout(debounceTimer);
        for (const ws of sockets) {
          try {
            ws.close();
          } catch {
            // ignore close errors
          }
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);

      // Push initial snapshot and connect to Directus WebSocket(s) in parallel
      void pushFreshSchedule();

      // Connect server-side to Directus WebSocket(s)
      let targets: DirectusHostConfig[] = [];
      try {
        targets = await getDirectusTargets();
      } catch {
        targets = [];
      }

      for (const target of targets) {
        if (closed) break;
        const wsUrl = toWebSocketUrl(target.url);

        try {
          const ws = new WebSocket(wsUrl);
          sockets.push(ws);
          let subscribed = false;

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
                // On any create/update/delete, push fresh merged schedule
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
            if (subscribed) {
              subscribed = false;
              liveCount = Math.max(0, liveCount - 1);
            }
            if (!closed && liveCount === 0) {
              sendEvent("status", { live: false });
            }
          });

          ws.addEventListener("error", () => {
            // handled by close event
          });
        } catch {
          // ignore individual host ws failures; fallback polling remains active
        }
      }

      heartbeatTimer = setInterval(sendHeartbeat, 25_000);
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
