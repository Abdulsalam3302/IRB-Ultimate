import * as db from "../db";
import { BOT_REVIEWERS } from "./acceleratedReview.service";

export type PlannedCommitteeSeat = {
  kind: "bot" | "admin";
  openId?: string;
  email: string;
  name: string;
  specialization: string;
  title: string;
  institution: string;
  userId?: number;
};

export function plannedCommitteeSeats(
  users: Array<{ id: number; email: string | null; name: string | null; role: string }>,
): PlannedCommitteeSeat[] {
  const bots: PlannedCommitteeSeat[] = BOT_REVIEWERS.map(bot => ({
    kind: "bot",
    openId: `digital-reviewer:${bot.email}`,
    email: bot.email,
    name: bot.name,
    specialization: bot.specialty,
    title: bot.name,
    institution: "NBCE Digital IRB — authorized reviewer",
  }));
  const admins: PlannedCommitteeSeat[] = users
    .filter(u => u.role === "admin")
    .map(u => ({
      kind: "admin" as const,
      userId: u.id,
      email: (u.email ?? "").toLowerCase(),
      name: u.name || "Administrator",
      specialization: "administration",
      title: u.name || "Administrator",
      institution: "NBCE Digital IRB",
    }));
  return [...bots, ...admins];
}

async function enrollSeat(userId: number, seat: PlannedCommitteeSeat): Promise<"created" | "reactivated" | "exists"> {
  const existing = await db.getCommitteeMemberByUserId(userId);
  if (existing) {
    if (!existing.isActive) {
      await db.updateCommitteeMember(existing.id, {
        isActive: true,
        specialization: seat.specialization,
        title: seat.title,
        institution: seat.institution,
      });
      return "reactivated";
    }
    return "exists";
  }
  await db.addCommitteeMember({
    userId,
    specialization: seat.specialization,
    title: seat.title,
    institution: seat.institution,
    isActive: true,
  });
  return "created";
}

/**
 * Idempotent: every admin plus the four designated digital reviewers become
 * active committee members so submissions can be assigned.
 */
export async function ensureDefaultCommittee(): Promise<{
  seats: number;
  created: number;
  reactivated: number;
}> {
  const users = await db.getAllUsers();
  const seats = plannedCommitteeSeats(users);
  let created = 0;
  let reactivated = 0;

  for (const seat of seats) {
    let userId = seat.userId;
    if (!userId && seat.email) {
      const byEmail = await db.getUserByEmail(seat.email);
      if (byEmail) userId = byEmail.id;
    }
    if (!userId && seat.openId) {
      await db.upsertUser({
        openId: seat.openId,
        email: seat.email,
        name: seat.name,
        loginMethod: "digital_reviewer",
        role: "user",
      });
      const createdUser =
        (await db.getUserByOpenId(seat.openId)) ?? (await db.getUserByEmail(seat.email));
      userId = createdUser?.id;
    }
    if (!userId) continue;
    const result = await enrollSeat(userId, seat);
    if (result === "created") created += 1;
    if (result === "reactivated") reactivated += 1;
  }

  return { seats: seats.length, created, reactivated };
}
