import { connection, NextResponse } from "next/server";
import { getConferenceRooms } from "@/lib/directus";

export async function GET() {
  await connection();
  try {
    const rooms = await getConferenceRooms();
    return NextResponse.json({
      success: true,
      data: rooms,
    });
  } catch (err) {
    console.error("[api/kiosk/rooms] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to load conference rooms.",
      },
      { status: 502 }
    );
  }
}
