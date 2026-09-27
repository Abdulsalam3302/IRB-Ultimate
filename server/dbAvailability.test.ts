import { describe, expect, it } from "vitest";
import { isDatabaseAvailabilityError } from "./_core/dbAvailability";

describe("database availability classification", () => {
  it.each([
    Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }),
    Object.assign(new Error("getaddrinfo ENOTFOUND host"), { code: "ENOTFOUND" }),
    Object.assign(new Error("Access denied"), { code: "ER_ACCESS_DENIED_ERROR", errno: 1045, sqlState: "28000" }),
    Object.assign(new Error("Too many connections"), { code: "ER_CON_COUNT_ERROR", errno: 1040 }),
    Object.assign(new Error("Due to the usage quota being exhausted, access to the cluster has been restricted"), { errno: 1105, sqlState: "HY000" }),
    new AggregateError([Object.assign(new Error("x"), { code: "ECONNREFUSED" })]),
    Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" }),
  ])("treats %s as a temporary availability failure", error => {
    expect(isDatabaseAvailabilityError(error)).toBe(true);
  });

  it.each([
    Object.assign(new Error("You have an error in your SQL syntax"), { code: "ER_PARSE_ERROR", errno: 1064, sqlState: "42000" }),
    Object.assign(new Error("Table doesn't exist"), { code: "ER_NO_SUCH_TABLE", errno: 1146, sqlState: "42S02" }),
    Object.assign(new Error("Duplicate column"), { code: "ER_DUP_FIELDNAME", errno: 1060, sqlState: "42S21" }),
    Object.assign(new Error("Unknown error"), { errno: 1105, sqlState: "HY000" }),
    new Error("DATABASE_URL is required for migrations"),
    null,
    "ECONNREFUSED",
  ])("keeps schema and configuration failures fatal: %s", error => {
    expect(isDatabaseAvailabilityError(error)).toBe(false);
  });
});
