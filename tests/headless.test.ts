import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const CLI_PATH = path.resolve("dist-headless/headless/cli.js");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dao-den-long-p2-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" });
}

function parseJsonl(filePath: string) {
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
}

describe("Headless CLI — Test Contract v1.1 (Nights 1–3)", () => {
  it("runs Night 1, 2, 3 cleanly with v1.1 snapshot schema", () => {
    for (const night of [1, 2, 3]) {
      const outPath = path.join(tmpDir, `night-${night}.jsonl`);
      const res = runCli([
        "--seed",
        "42",
        "--night",
        String(night),
        "--ticks",
        "60",
        "--snapshot-every",
        "60",
        "--out",
        outPath,
      ]);
      expect(res.status).toBe(0);
      const recs = parseJsonl(outPath);
      const snap0 = recs[0];
      expect(snap0.night).toBe(night);
      expect(snap0.wind).toBeDefined();
      expect(snap0.player.vel).toHaveLength(3);
      expect(typeof snap0.player.grounded).toBe("boolean");
      expect(Array.isArray(snap0.motes)).toBe(true);
      expect(Array.isArray(snap0.drifters)).toBe(true);
      expect(Array.isArray(snap0.charms)).toBe(true);
    }
  });

  it("is 100% deterministic across two runs and completes full Night 3 (21600 ticks) well under 30s", () => {
    const out1 = path.join(tmpDir, "n3-a.jsonl");
    const out2 = path.join(tmpDir, "n3-b.jsonl");
    const t0 = Date.now();
    const r1 = runCli([
      "--seed",
      "99",
      "--night",
      "3",
      "--ticks",
      "21600",
      "--snapshot-every",
      "600",
      "--out",
      out1,
    ]);
    const elapsedMs = Date.now() - t0;
    expect(r1.status).toBe(0);
    expect(elapsedMs).toBeLessThan(30000);

    const r2 = runCli([
      "--seed",
      "99",
      "--night",
      "3",
      "--ticks",
      "21600",
      "--snapshot-every",
      "600",
      "--out",
      out2,
    ]);
    expect(r2.status).toBe(0);
    expect(fs.readFileSync(out1, "utf8")).toBe(fs.readFileSync(out2, "utf8"));
  });

  it("exits with code 2 on malformed scenario or duplicate input tick", () => {
    const badInp = path.join(tmpDir, "bad.json");
    fs.writeFileSync(badInp, JSON.stringify({ frames: [{ tick: 1 }, { tick: 1 }] }));
    const res = runCli([
      "--seed",
      "1",
      "--night",
      "1",
      "--inputs",
      badInp,
      "--ticks",
      "10",
      "--out",
      path.join(tmpDir, "x.jsonl"),
    ]);
    expect(res.status).toBe(2);
    expect(res.stderr.length).toBeGreaterThan(0);
  });
});
