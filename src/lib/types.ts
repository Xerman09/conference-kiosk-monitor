import { z } from "zod";

export const ConferenceRoomSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
});

export type ConferenceRoom = z.infer<typeof ConferenceRoomSchema>;

export const ConferenceRoomRequestSchema = z.object({
  id: z.coerce.number(),
  room_id: z.coerce.number(),
  title: z.string(),
  purpose: z.string().nullable().optional(),
  start_time: z.string(),
  end_time: z.string(),
  status: z.string(),
  requested_by: z.coerce.number().nullable().optional(),
  requested_by_name: z.string().nullable().optional(),
  company_id: z.coerce.number().nullable().optional(),
});

export type ConferenceRoomRequest = z.infer<typeof ConferenceRoomRequestSchema>;

export interface AdminSession {
  userId: number;
  email: string;
  name: string;
  isAdmin: true;
  exp: number;
}
