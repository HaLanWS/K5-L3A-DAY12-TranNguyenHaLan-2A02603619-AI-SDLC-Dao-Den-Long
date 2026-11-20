import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const CLI_PATH = path.resolve("dist-headless/headless/cli.js");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dao-den-long-test-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf8",
  });
}

function parseJsonl(filePath: string) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  return lines.map((line) => JSON.parse(line));
}

describe("Headless CLI — Test Contract v1.0", () => {
  it("produces valid JSONL with tick 0 snapshot, events, snapshots every N ticks, and end record", () => {
    const scnPath = path.join(tmpDir, "scn-basic.json");
    const inpPath = path.join(tmpDir, "inp-basic.json");
    const outPath = path.join(tmpDir, "out-basic.jsonl");

    fs.writeFileSync(
      scnPath,
      JSON.stringify({
        player: { pos: [0, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        motes: [[0, 0, 5]],
        shades: [],
        lanterns: [{ id: "L1", pos: [0, 0, 12], deposited: 0 }],
        time_left_s: 300,
      })
    );

    fs.writeFileSync(
      inpPath,
      JSON.stringify({
        frames: [
          { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
          { tick: 110, move: [0, 0], interact: true },
          { tick: 111, interact: false },
        ],
      })
    );

    const res = runCli([
      "--seed",
      "42",
      "--night",
      "1",
      "--scenario",
      scnPath,
      "--inputs",
      inpPath,
      "--ticks",
      "120",
      "--snapshot-every",
      "60",
      "--out",
      outPath,
    ]);

    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    expect(records[0].type).toBe("snapshot");
    expect(records[0].tick).toBe(0);
    expect(records[0].time_left_s).toBe(300);

    const picked = records.find((r) => r.type === "event" && r.name === "mote_picked");
    expect(picked).toBeDefined();
    expect(picked.data).toEqual({ carried: 1 });

    const deposit = records.find((r) => r.type === "event" && r.name === "deposit");
    expect(deposit).toBeDefined();
    expect(deposit.tick).toBe(111); // input tick 110 -> state tick 111
    expect(deposit.data).toEqual({ lantern_id: "L1", amount: 1, deposited: 1 });

    const end = records[records.length - 1];
    expect(end).toEqual({ type: "end", ticks: 120, state: "playing", score: 10 });
  });

  it("is 100% deterministic across two runs with the same seed and random spawning enabled", () => {
    const out1 = path.join(tmpDir, "det-1.jsonl");
    const out2 = path.join(tmpDir, "det-2.jsonl");

    const r1 = runCli([
      "--seed",
      "1337",
      "--night",
      "1",
      "--ticks",
      "600",
      "--snapshot-every",
      "30",
      "--out",
      out1,
    ]);
    const r2 = runCli([
      "--seed",
      "1337",
      "--night",
      "1",
      "--ticks",
      "600",
      "--snapshot-every",
      "30",
      "--out",
      out2,
    ]);

    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(fs.readFileSync(out1, "utf8")).toBe(fs.readFileSync(out2, "utf8"));
  });

  it("exits with code 2 and stderr message on non-strictly-increasing input ticks", () => {
    const badInputs = path.join(tmpDir, "bad-ticks.json");
    const outPath = path.join(tmpDir, "bad-ticks.jsonl");
    fs.writeFileSync(
      badInputs,
      JSON.stringify({
        frames: [
          { tick: 10, move: [0, 1] },
          { tick: 10, move: [0, 0] },
        ],
      })
    );

    const res = runCli([
      "--seed",
      "1",
      "--night",
      "1",
      "--inputs",
      badInputs,
      "--ticks",
      "20",
      "--out",
      outPath,
    ]);

    expect(res.status).toBe(2);
    expect(res.stderr.length).toBeGreaterThan(0);
  });

  it("exits with code 2 and stderr message on malformed scenario JSON", () => {
    const badScenario = path.join(tmpDir, "bad-scenario.json");
    const outPath = path.join(tmpDir, "bad-scenario.jsonl");
    fs.writeFileSync(badScenario, "{ invalid json");

    const res = runCli([
      "--seed",
      "1",
      "--night",
      "1",
      "--scenario",
      badScenario,
      "--ticks",
      "20",
      "--out",
      outPath,
    ]);

    expect(res.status).toBe(2);
    expect(res.stderr.length).toBeGreaterThan(0);
  });

  it("supports --flag=value CLI syntax as well as --flag value", () => {
    const outPath = path.join(tmpDir, "eq-syntax.jsonl");
    const res = runCli([
      "--seed=7",
      "--night=1",
      "--ticks=30",
      "--snapshot-every=15",
      `--out=${outPath}`,
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    expect(records[0].tick).toBe(0);
    expect(records[records.length - 1]).toMatchObject({ type: "end", ticks: 30 });
  });
});
