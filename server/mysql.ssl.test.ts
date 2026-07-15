import { describe, expect, it } from "vitest";
import { resolveMysqlSsl } from "./_core/mysql";

describe("resolveMysqlSsl", () => {
  it("enables TLS for TiDB Cloud hosts", () => {
    const ssl = resolveMysqlSsl(
      "mysql://u:p@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/irb_platform?ssl=true"
    );
    expect(ssl).toEqual({ rejectUnauthorized: true });
  });

  it("skips TLS for local mysql", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const ssl = resolveMysqlSsl("mysql://root@127.0.0.1:3306/irb_platform");
    process.env.NODE_ENV = prev;
    expect(ssl).toBeUndefined();
  });

  it("honours ssl=false override", () => {
    const ssl = resolveMysqlSsl(
      "mysql://u:p@gateway01.tidbcloud.com:4000/db?ssl-mode=DISABLED"
    );
    expect(ssl).toBeUndefined();
  });
});
