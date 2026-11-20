import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const CLI_PATH = path.resolve("dist-headless/headless/cli.js");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dao-den-long-p3-"));

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

describe("Headless CLI — Test Contract v1.2", () => {
  it("emits fuel, ever_lit, relit_count in snapshot lanterns and capacity in player", () => {
    const outPath = path.join(tmpDir, "p3-snap.jsonl");
    const res = runCli([
      "--seed",
      "42",
      "--night",
      "1",
      "--ticks",
      "10",
      "--out",
      outPath,
    ]);
    expect(res.status).toBe(0);
    const recs = parseJsonl(outPath);
    const snap = recs[0];
    expect(typeof snap.player.capacity).toBe("number");
    expect(typeof snap.lanterns[0].fuel).toBe("number");
    expect(typeof snap.lanterns[0].ever_lit).toBe("boolean");
    expect(typeof snap.lanterns[0].relit_count).toBe("number");
  });
});
