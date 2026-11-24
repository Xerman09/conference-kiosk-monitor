import { connection, NextResponse } from "next/server";
import { getConferenceRooms, getRoomApprovedSchedule } from "@/lib/directus";

export async function GET(
  _request: Request,
  context: { params: Promise<{ roomId: string }> }
) {
  await connection();
  const { roomId: rawRoomId } = await context.params;
  const roomId = Number(rawRoomId);

  if (!Number.isInteger(roomId) || roomId <= 0) {
    return NextResponse.json(
      { success: false, error: "Invalid roomId parameter." },
      { status: 400 }
    );
  }

  try {
    const [rooms, schedule] = await Promise.all([
      getConferenceRooms(),
      getRoomApprovedSchedule(roomId),
    ]);

    const room = rooms.find((r) => r.id === roomId) ?? null;

    return NextResponse.json({
      success: true,
      room,
      data: schedule,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[api/kiosk/rooms/${roomId}/schedule] Error:`, err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to load room schedule.",
      },
      { status: 502 }
    );
  }
}
