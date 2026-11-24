import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  isAuthDisabled,
  verifySessionToken,
} from "@/lib/session";
import { RoomPickerClient } from "@/components/RoomPickerClient";

async function ProtectedRoomPicker() {
  if (isAuthDisabled()) {
    return <RoomPickerClient adminName="Dev Mode" adminEmail="dev@local" />;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    redirect("/login");
  }

  return (
    <RoomPickerClient adminName={session.name} adminEmail={session.email} />
  );
}

export default function ConferenceRoomPickerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-slate-950 text-slate-400 flex items-center justify-center">
          <div className="text-sm font-medium animate-pulse">
            Verifying administrator session...
          </div>
        </div>
      }
    >
      <ProtectedRoomPicker />
    </Suspense>
  );
}
