import { Suspense } from "react";
import Link from "next/link";
import { RoomMonitorKiosk } from "@/components/RoomMonitorKiosk";

interface RoomPageProps {
  params: Promise<{ roomId: string }>;
}

async function RoomKioskLoader({ params }: RoomPageProps) {
  const { roomId: rawRoomId } = await params;
  const roomId = Number(rawRoomId);

  if (!Number.isInteger(roomId) || roomId <= 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl font-bold text-rose-400">Invalid Room ID</h1>
        <p className="mt-2 text-slate-400">
          The requested room identifier &ldquo;{rawRoomId}&rdquo; is not valid.
        </p>
        <Link
          href="/kiosk/conference-room"
          className="mt-6 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Back to Room Selector
        </Link>
      </div>
    );
  }

  return <RoomMonitorKiosk roomId={roomId} />;
}

export default function ConferenceRoomKioskPage({ params }: RoomPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-slate-950 text-slate-400 flex items-center justify-center">
          <div className="text-sm font-medium animate-pulse">
            Loading Conference Room Display...
          </div>
        </div>
      }
    >
      <RoomKioskLoader params={params} />
    </Suspense>
  );
}
