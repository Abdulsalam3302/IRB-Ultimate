import { index, int, mediumtext, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { applications, users } from "./schema";

/** Private immutable submission snapshots; erased explicitly on account closure. */
export const applicationScreeningJobs = mysqlTable("application_screening_jobs", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull().references(() => applications.id, { onDelete: "cascade" }),
  applicationVersion: int("applicationVersion").notNull(),
  applicantId: int("applicantId").notNull().references(() => users.id, { onDelete: "cascade" }),
  snapshotJson: mediumtext("snapshotJson").notNull(),
  status: mysqlEnum("screeningStatus", ["pending", "running", "completed", "escalated"]).notNull().default("pending"),
  attempts: int("attempts").notNull().default(0),
  nextAttemptAt: timestamp("nextAttemptAt").notNull().defaultNow(),
  leaseUntil: timestamp("leaseUntil"),
  leaseToken: varchar("leaseToken", { length: 36 }),
  resultJson: mediumtext("resultJson"),
  lastErrorCode: varchar("lastErrorCode", { length: 64 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
}, table => [
  uniqueIndex("screening_application_version_unique").on(table.applicationId, table.applicationVersion),
  index("screening_pending_idx").on(table.status, table.nextAttemptAt),
  index("screening_applicant_idx").on(table.applicantId),
]);
export type ApplicationScreeningJob = typeof applicationScreeningJobs.$inferSelect;
