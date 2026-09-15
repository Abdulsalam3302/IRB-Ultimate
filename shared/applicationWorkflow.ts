/** Editable preparation/revision states shared by the UI and every write boundary. */
const EDITABLE_PREPARATION_STATES = new Set([
  "draft", "declaration_pending", "stage1_pending", "stage1_failed",
  "stage2_pending", "stage2_failed", "resubmission_required",
]);
export type ApplicationEditState = { status: string; submittedAt?: Date | string | null };

export function canEditApplication(app: ApplicationEditState): boolean {
  // Older Stage2 passes used "submitted" before the actual submission action.
  // A timestamped record is frozen; requested revisions use explicit edit states.
  return EDITABLE_PREPARATION_STATES.has(app.status) ||
    (app.status === "submitted" && app.submittedAt == null);
}
