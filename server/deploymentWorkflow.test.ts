import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Execute the actual workflow shell against a local fake Render API. This
// exercises jq selection and the override path without credentials or network.
const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
const monitorWorkflow = readFileSync(new URL("../.github/workflows/keep-warm.yml", import.meta.url), "utf8");
const sha = "a".repeat(40);
const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });

function stepShell(name: string, source = workflow): string {
  const start = source.indexOf(`      - name: ${name}\n`);
  if (start < 0) throw new Error(`Missing workflow step ${name}`);
  const tail = source.slice(start);
  const run = tail.indexOf("        run: |\n");
  if (run < 0) throw new Error(`Missing shell for ${name}`);
  const lines = tail.slice(run + "        run: |\n".length).split("\n");
  const end = lines.findIndex(line => line.trim() && !line.startsWith("          "));
  return lines.slice(0, end < 0 ? undefined : end).map(line => line.slice(10)).join("\n")
    .replace(/\$\{\{.*?\}\}/g, "fixture/repository");
}

const curlMock = `
curl() {
  local output="" writeout="" method=GET url="" fixture="" code=200 count=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -o) output="$2"; shift 2 ;;
      -w) writeout="$2"; shift 2 ;;
      -X) method="$2"; shift 2 ;;
      --max-time|-H|--data-binary) shift 2 ;;
      -*) shift ;;
      *) url="$1"; shift ;;
    esac
  done
  printf '%s %s\\n' "$method" "$url" >> "$FIXTURE_DIR/calls"
  case "$url" in
    */deploys?limit=20)
      [ ! -f "$FIXTURE_DIR/count" ] || count=$(cat "$FIXTURE_DIR/count")
      fixture="$FIXTURE_DIR/list-$count.json"
      [ -f "$fixture" ] || fixture="$FIXTURE_DIR/list-last.json"
      echo $((count + 1)) > "$FIXTURE_DIR/count"
      ;;
    */deploys) fixture="$FIXTURE_DIR/receipt.json"; code="$RECEIPT_CODE" ;;
    */api/health) fixture="$FIXTURE_DIR/source-health.json"; code="$FIXTURE_HEALTH_CODE" ;;
    */api/ready) fixture="$FIXTURE_DIR/source-ready.json"; code="$FIXTURE_READY_CODE" ;;
    *) echo 'Unexpected fixture URL' >&2; return 1 ;;
  esac
  if [ -n "$output" ]; then cp "$fixture" "$output"; else cat "$fixture"; fi
  if [ -n "$writeout" ]; then
    case "$writeout" in
      *time_total*) printf '%s 0.010' "$code" ;;
      *) printf '%s' "$code" ;;
    esac
  fi
  return 0
}
sleep() { :; }
`;

type Fixture = {
  lists?: unknown[][];
  receipt?: unknown;
  receiptCode?: string;
  health?: unknown;
  healthCode?: string;
  ready?: unknown;
  readyCode?: string;
  allowUnready?: boolean;
  renderUrl?: string;
  publicUrl?: string;
};

function runStep(name: string, input: Fixture, source = workflow) {
  const path = mkdtempSync(join(tmpdir(), "irb-deploy-test-"));
  scratch.push(path);
  const write = (file: string, value: unknown) => writeFileSync(join(path, file), JSON.stringify(value));
  const lists = input.lists ?? [[]];
  lists.forEach((list, index) => write(`list-${index}.json`, list));
  write("list-last.json", lists.at(-1));
  write("receipt.json", input.receipt ?? {});
  write("source-health.json", input.health ?? { ok: true, version: sha });
  write("source-ready.json", input.ready ?? { ok: true, appVersion: "2.6.0" });
  const shell = stepShell(name, source).replaceAll("/tmp/", `${path}/`);
  const result = spawnSync("bash", ["-c", curlMock + "\n" + shell], {
    encoding: "utf8", timeout: 15_000,
    env: { PATH: process.env.PATH, FIXTURE_DIR: path, VERIFIED_SHA: sha,
      RENDER_API_KEY: "synthetic-test-key", RENDER_SERVICE_ID: "srv-fixture",
      RENDER_URL: input.renderUrl ?? "https://fixture.invalid", PUBLIC_URL: input.publicUrl ?? "https://public.invalid",
      GITHUB_STEP_SUMMARY: join(path, "summary.md"), GITHUB_OUTPUT: join(path, "outputs"),
      RECEIPT_CODE: input.receiptCode ?? "201",
      FIXTURE_HEALTH_CODE: input.healthCode ?? "200", FIXTURE_READY_CODE: input.readyCode ?? "200",
      ALLOW_UNREADY: String(input.allowUnready ?? false) },
  });
  if (result.error) throw result.error;
  const read = (file: string) => existsSync(join(path, file)) ? readFileSync(join(path, file), "utf8") : "";
  return { status: result.status, output: result.stdout + result.stderr,
    calls: read("calls"), summary: read("summary.md"), outputs: read("outputs"), report: read("report.md") };
}

const deployStep = "Deploy verified backend revision";
const readyStep = "Confirm backend readiness (database and schema)";
const old = { deploy: { id: "dep-old", commit: { id: sha }, status: "live", createdAt: "2020-01-01T00:00:00Z" } };
function deployment(status: string, id = "dep-requested", commit = sha, createdAt = "2099-01-01T00:00:00.123Z") {
  return { deploy: { id, commit: { id: commit }, status, createdAt } };
}

describe("production deployment receipts", () => {
  it("waits for a returned deploy ID instead of accepting an older live same-SHA deployment", () => {
    const result = runStep(deployStep, { receipt: { id: "dep-requested" },
      lists: [[old], [old, deployment("build_in_progress")], [old, deployment("live")]] });
    expect(result.status).toBe(0);
    expect(result.calls.match(/GET .*deploys\?limit=20/g)).toHaveLength(3);
    expect(result.output).toContain("deploy dep-requested");
  });

  it("fails when the newly requested deployment fails despite the older live same-SHA instance", () => {
    const result = runStep(deployStep, { receipt: { id: "dep-requested" }, lists: [[old], [old, deployment("build_failed")]] });
    expect(result.status).toBe(1);
    expect(result.output).toContain("Backend deployment failed: build_failed");
  });

  it("handles a bodyless queued 202 by following a new same-SHA deployment", () => {
    const result = runStep(deployStep, { receipt: null, receiptCode: "202",
      lists: [[old], [old], [old, deployment("live", "dep-queued")]] });
    expect(result.status).toBe(0);
    expect(result.calls.match(/GET .*deploys\?limit=20/g)).toHaveLength(3);
    expect(result.output).toContain("deploy dep-queued");
  });

  it("rejects unseen historical instances and different revisions for a bodyless queued request", () => {
    const result = runStep(deployStep, { receiptCode: "202", lists: [[old],
      [old, deployment("live", "dep-unseen-old", sha, "2020-01-02T00:00:00Z"), deployment("live", "dep-other-sha", "b".repeat(40))]] });
    expect(result.status).toBe(1);
    expect(result.output).toContain("did not reach live before the deadline");
  });

  it("requires the running backend to report the exact CI-approved SHA", () => {
    const result = runStep(readyStep, { health: { ok: true, version: "b".repeat(40) } });
    expect(result.status).toBe(1);
    expect(result.output).toContain("Backend revision mismatch");
  });

  it("accepts healthy readiness only with HTTP 200 and the verified running revision", () => {
    const healthy = runStep(readyStep, {});
    expect(healthy.status, healthy.output).toBe(0);
    expect(runStep(readyStep, { readyCode: "503" }).status).toBe(1);
  });

  it("allows an explicit database-maintenance override for the verified revision", () => {
    const result = runStep(readyStep, { allowUnready: true, readyCode: "503",
      ready: { ok: false, state: "database_unavailable" } });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("verified revision in database maintenance mode");
  });

  it("does not let a maintenance override bypass a revision mismatch or arbitrary readiness failure", () => {
    expect(runStep(readyStep, { allowUnready: true, health: { ok: true, version: "old" }, readyCode: "503",
      ready: { ok: false, state: "database_unavailable" } }).status).toBe(1);
    expect(runStep(readyStep, { allowUnready: true, readyCode: "503", ready: { ok: false } }).status).toBe(1);
  });
});

describe("production readiness monitoring", () => {
  const monitorStep = "Probe backend and public proxy";

  it.each([{ renderUrl: "" }, { publicUrl: "" }, { renderUrl: "", publicUrl: "" }])(
    "publishes an actionable failed report and issue output when endpoint configuration is missing: %j",
    input => {
      const result = runStep(monitorStep, input, monitorWorkflow);
      expect(result.status).toBe(1);
      expect(result.outputs).toBe("failures=1\n");
      expect(result.summary).toContain("Readiness ❌");
      expect(result.report).toContain("Set both RENDER_URL and PUBLIC_SITE_URL");
      expect(result.calls).toBe("");
    }
  );

  it("passes only when all three endpoints return HTTP 200 and their valid JSON contracts", () => {
    const result = runStep(monitorStep, {}, monitorWorkflow);
    expect(result.status, result.output).toBe(0);
    expect(result.outputs).toBe("failures=0\n");
    expect(result.summary).toContain("Readiness ✅");
    expect(result.calls.trim().split("\n")).toHaveLength(3);
  });

  it("rejects a success-shaped body returned with a failing readiness HTTP status", () => {
    const result = runStep(monitorStep, { readyCode: "503" }, monitorWorkflow);
    expect(result.status).toBe(1);
    expect(result.outputs).toBe("failures=2\n");
    expect(result.report.match(/503 \| 0\.010 \| fail/g)).toHaveLength(2);
  });

  it("rejects a success-shaped health body returned with HTTP 500", () => {
    const result = runStep(monitorStep, { healthCode: "500" }, monitorWorkflow);
    expect(result.status).toBe(1);
    expect(result.outputs).toBe("failures=1\n");
  });

  it("rejects HTTP 200 when readiness JSON is false or missing its version", () => {
    expect(runStep(monitorStep, { ready: { ok: false, appVersion: "2.6.0" } }, monitorWorkflow).status).toBe(1);
    expect(runStep(monitorStep, { ready: { ok: true } }, monitorWorkflow).status).toBe(1);
  });
});
