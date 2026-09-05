import { describe, expect, it, vi } from "vitest";
import { boundedInt } from "./_core/limits";
import { Semaphore, CapacityError } from "./_core/concurrency";
import { readBoundedText } from "./_core/httpSafety";
import { portableMigrationStatement } from "./migrate";

 describe("runtime resource boundaries", () => {
  it("invalid deployment settings cannot disable bounds", () => {
    for (const value of ["NaN", "-1", "Infinity", "2x", "1e10"]) expect(boundedInt(value, 10, 1, 100)).toBe(10);
    expect(boundedInt("999", 10, 1, 100)).toBe(100);
  });
  it("rejects overflow and timed-out queue entries without leaking slots", async () => {
    const gate = new Semaphore(1, 1, 20);
    let release!: () => void;
    const running = gate.run(() => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    const waiting = gate.run(async () => "should not run");
    await expect(gate.run(async () => null)).rejects.toBeInstanceOf(CapacityError);
    await expect(waiting).rejects.toBeInstanceOf(CapacityError);
    release(); await running;
    expect(await gate.run(async () => "recovered")).toBe("recovered");
  });
  it("releases capacity on failed expensive work", async () => {
    const gate = new Semaphore(1);
    await expect(gate.run(async () => { throw new Error("failed"); })).rejects.toThrow();
    expect(await gate.run(async () => 42)).toBe(42);
  });
  it("rejects a chunked upstream response exceeding its byte budget", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); }, cancel });
    await expect(readBoundedText(new Response(stream), 10)).rejects.toThrow("too large");
    expect(cancel).toHaveBeenCalled();
  });
  it("preserves a bounded UTF-8 response", async () => {
    expect(await readBoundedText(new Response("المراجعة"), 100)).toBe("المراجعة");
  });
  it("only permits exact duplicate suppression for explicitly idempotent DDL", () => {
    expect(portableMigrationStatement("CREATE INDEX IF NOT EXISTS `i` ON `t` (`x`);").duplicateCode).toBe("ER_DUP_KEYNAME");
    expect(portableMigrationStatement("ALTER TABLE `t` ADD COLUMN IF NOT EXISTS `x` INT;").duplicateCode).toBe("ER_DUP_FIELDNAME");
    expect(portableMigrationStatement("CREATE TABLE `t` (`id` INT)").duplicateCode).toBeUndefined();
  });
});
