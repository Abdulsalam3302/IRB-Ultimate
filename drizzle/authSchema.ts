import { int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const accountAuthState = mysqlTable("account_auth_state", {
  userId: int("userId").primaryKey(),
  version: int("version").notNull().default(0),
});
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  tokenHash: varchar("tokenHash", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
