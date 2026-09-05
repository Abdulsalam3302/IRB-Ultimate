/**
 * Committee appointments are a governed human operation. Administrative roles
 * and simulated AI reviewers are never evidence of qualifications or appointment.
 * This compatibility hook is intentionally read-only and cannot reactivate a
 * member whom an administrator deliberately removed.
 */
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
  _users: Array<{ id: number; email: string | null; name: string | null; role: string }>,
): PlannedCommitteeSeat[] {
  return [];
}

export async function ensureDefaultCommittee(): Promise<{
  seats: number;
  created: number;
  reactivated: number;
}> {
  return { seats: 0, created: 0, reactivated: 0 };
}
