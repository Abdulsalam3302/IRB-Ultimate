import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { verifyDatabaseReadiness } from "./_core/readiness";

const dialect = new MySqlDialect();
function database(options: { failOn?: string; quotaRows?: unknown } = {}) {
  const queries: string[] = [];
  const execute = vi.fn(async (statement: SQL) => {
    const query = dialect.sqlToQuery(statement).sql;
    queries.push(query);
    if (options.failOn && query.includes(options.failOn))
      throw new Error("Synthetic missing schema");
    return query.includes("FROM storage_quota_lock")
      ? [options.quotaRows === undefined ? [{ id: 1 }] : options.quotaRows, []]
      : [[], []];
  });
  return {
    connection: { execute } as unknown as Parameters<
      typeof verifyDatabaseReadiness
    >[0],
    queries,
  };
}

describe("database readiness requires durable admission and identity state", () => {
  it("accepts empty migrated data tables with the required quota singleton", async () => {
    const fixture = database();
    await expect(
      verifyDatabaseReadiness(fixture.connection)
    ).resolves.toBeUndefined();
    expect(fixture.queries.every(query => /^SELECT\b/.test(query))).toBe(true);
    expect(fixture.queries).toContain(
      "SELECT id FROM storage_quota_lock WHERE id = 1 LIMIT 1"
    );
  });

  it.each([null, undefined])(
    "fails closed when no database connection is available: %s",
    async connection => {
      await expect(verifyDatabaseReadiness(connection)).rejects.toThrow(
        "Database unavailable"
      );
    }
  );

  it.each([
    "FROM request_limits",
    "FROM session_revocations",
    "FROM committee_members",
    "FROM applications",
    "identityIssuer FROM users",
    "FROM file_uploads",
    "FROM storage_deletion_jobs",
    "FROM storage_quota_lock",
  ])(
    "rejects readiness when required schema cannot be queried: %s",
    async failOn => {
      const fixture = database({ failOn });
      await expect(verifyDatabaseReadiness(fixture.connection)).rejects.toThrow(
        "Synthetic missing schema"
      );
    }
  );

  it.each([[], [{ id: 2 }], [{}], { affectedRows: 0 }])(
    "does not confuse an existing table with a valid quota singleton: %j",
    async quotaRows => {
      await expect(
        verifyDatabaseReadiness(database({ quotaRows }).connection)
      ).rejects.toThrow("Storage quota lock is unavailable");
    }
  );
});
