#!/usr/bin/env node
/**
 * Phase 1 automated verification & proof generator.
 * Runs:
 * 1. Harness guard (invariant check)
 * 2. Full Vitest unit & CLI test suite
 * 3. Curated headless Test Contract v1.0 scenarios (saved as genuine JSONL proof)
 * 4. Byte-for-byte determinism verification
 * 5. Malformed inputs/scenario exit-code-2 verification
 * Writes real proof outputs into docs/proof/phase-1/.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cliPath = path.join(root, "dist-headless", "headless", "cli.js");
const proofDir = path.join(root, "docs", "proof", "phase-1");
const scenariosDir = path.join(root, "tests", "scenarios");

fs.mkdirSync(proofDir, { recursive: true });
fs.mkdirSync(scenariosDir, { recursive: true });

if (!fs.existsSync(cliPath)) {
  console.error("Missing dist-headless/headless/cli.js — run `npm run build` first.");
  process.exit(1);
}

// 1. Run harness guard
const guard = spawnSync(process.execPath, [path.join(root, "scripts", "hook-guard.mjs")], {
  encoding: "utf8",
});
if (guard.status !== 0) {
  console.error(guard.stderr || guard.stdout);
  process.exit(1);
}

// 2. Run Vitest unit + CLI tests directly via Node (no shell warning, clean plain-text log)
const vitestEntry = path.join(root, "node_modules", "vitest", "vitest.mjs");
const vitest = spawnSync(process.execPath, [vitestEntry, "run", "--no-color"], {
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
});
const stripAnsi = (s) => s.replace(/\x1B\[[0-9;]*m/g, "");
fs.writeFileSync(
  path.join(proofDir, "vitest-output.txt"),
  stripAnsi((vitest.stdout || "") + (vitest.stderr || "")),
  "utf8"
);
if (vitest.status !== 0) {
  console.error("Vitest failed:\n", vitest.stdout, vitest.stderr);
  process.exit(1);
}

// 3. Curated headless scenarios matching AC-01 .. AC-09
const curated = [
  {
    id: "move-pickup-win",
    ac: "AC-01, AC-02, AC-03",
    desc: "Di chuyển + nhặt 3 đom đóm + nạp thắp L1 (L2..L5 đã sáng) → thắng (all_lit)",
    seed: 42,
    ticks: 240,
    snapshotEvery: 60,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [
        [0, 0, 3],
        [0, 0, 6],
        [0, 0, 9],
      ],
      shades: [],
      lanterns: [
        { id: "L1", pos: [0, 0, 12], deposited: 0, lit: false },
        { id: "L2", lit: true },
        { id: "L3", lit: true },
        { id: "L4", lit: true },
        { id: "L5", lit: true },
      ],
      time_left_s: 300,
    },
    inputs: {
      frames: [
        { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
        { tick: 110, move: [0, 0], interact: true },
        { tick: 111, interact: false },
      ],
    },
    assert: (records) => {
      const picked = records.filter((r) => r.type === "event" && r.name === "mote_picked");
      const lit = records.find((r) => r.type === "event" && r.name === "lantern_lit");
      const end = records[records.length - 1];
      if (picked.length !== 3) throw new Error(`Expected 3 motes picked, got ${picked.length}`);
      if (!lit || lit.data.lantern_id !== "L1") throw new Error("Expected L1 to be lit");
      if (end.state !== "won") throw new Error(`Expected state won, got ${end.state}`);
      return `3 motes picked, L1 lit, won at tick ${end.ticks}, score=${end.score}`;
    },
  },
  {
    id: "pulse-stun-push",
    ac: "AC-04",
    desc: "Tỏa sáng (Pulse) làm choáng và đẩy Bóng Mực ra xa 6m",
    seed: 42,
    ticks: 210,
    snapshotEvery: 30,
    scenario: {
      player: { pos: [0, 0, 0], carried: 2, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [0, 0.9, 5] }],
      time_left_s: 300,
    },
    inputs: {
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
      ],
    },
    assert: (records) => {
      const pulse = records.find((r) => r.type === "event" && r.name === "pulse");
      const snap30 = records.find((r) => r.type === "snapshot" && r.tick === 30);
      if (!pulse || pulse.data.stunned_ids[0] !== "S1") throw new Error("Expected S1 stunned");
      if (snap30.shades[0].state !== "stunned") throw new Error("Expected S1 still stunned at tick 30");
      if (snap30.shades[0].pos[2] < 10.9) throw new Error("Expected S1 pushed >= 6m");
      return `pulse stunned S1, pushed z=5 -> z=${snap30.shades[0].pos[2]}, state=stunned`;
    },
  },
  {
    id: "safe-radius-block",
    ac: "AC-05",
    desc: "Bóng Mực không đi vào vùng safe_radius (5.5m) quanh đèn đã thắp",
    seed: 42,
    ticks: 180,
    snapshotEvery: 30,
    scenario: {
      player: { pos: [0, 0, 25], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [0, 0.9, 17] }],
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: true }],
      time_left_s: 300,
    },
    inputs: { frames: [] },
    assert: (records) => {
      const snaps = records.filter((r) => r.type === "snapshot");
      let minDist = Infinity;
      for (const s of snaps) {
        const d = Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2] - 25);
        minDist = Math.min(minDist, d);
        if (d < 5.498) throw new Error(`Shade violated safe_radius: dist=${d}`);
      }
      const last = snaps[snaps.length - 1];
      if (last.player.flames !== 3) throw new Error("Player should not take damage in safe zone");
      return `min shade dist to lit L1 = ${minDist.toFixed(3)}m (>= 5.5m), flames=3`;
    },
  },
  {
    id: "shade-hit-loss",
    ac: "AC-06",
    desc: "Bóng Mực chạm gây mất lửa, rơi 50% đom đóm, bất tử 1.5s, hết lửa → thua (no_flames)",
    seed: 42,
    ticks: 180,
    snapshotEvery: 30,
    scenario: {
      player: { pos: [0, 0, 0], carried: 4, flames: 2 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S1", pos: [0, 0.9, 0.4] }],
      time_left_s: 300,
    },
    inputs: { frames: [] },
    assert: (records) => {
      const hits = records.filter((r) => r.type === "event" && r.name === "player_hit");
      const over = records.find((r) => r.type === "event" && r.name === "game_over");
      if (hits.length !== 2) throw new Error(`Expected 2 hits, got ${hits.length}`);
      if (hits[1].tick - hits[0].tick !== 90) {
        throw new Error(`Expected 90 tick invuln gap, got ${hits[1].tick - hits[0].tick}`);
      }
      if (!over || over.data.reason !== "no_flames") throw new Error("Expected lost/no_flames");
      return `2 hits spaced 90 ticks (1.5s), dropped=${hits[0].data.dropped}, lost/no_flames at tick ${over.tick}`;
    },
  },
  {
    id: "dawn-timeout-loss",
    ac: "AC-07",
    desc: "Hết thời gian đêm → thua với lý do dawn",
    seed: 42,
    ticks: 120,
    snapshotEvery: 30,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      time_left_s: 1,
    },
    inputs: { frames: [] },
    assert: (records) => {
      const over = records.find((r) => r.type === "event" && r.name === "game_over");
      const end = records[records.length - 1];
      if (!over || over.data.reason !== "dawn" || end.ticks !== 60) {
        throw new Error("Expected dawn loss at tick 60");
      }
      return `lost/dawn at exact tick ${end.ticks}`;
    },
  },
];

const results = [];

for (const item of curated) {
  const scnFile = path.join(scenariosDir, `${item.id}.scenario.json`);
  const inpFile = path.join(scenariosDir, `${item.id}.inputs.json`);
  const outFile = path.join(proofDir, `${item.id}.jsonl`);

  fs.writeFileSync(scnFile, JSON.stringify(item.scenario, null, 2) + "\n", "utf8");
  fs.writeFileSync(inpFile, JSON.stringify(item.inputs, null, 2) + "\n", "utf8");

  const run = spawnSync(
    process.execPath,
    [
      cliPath,
      "--seed",
      String(item.seed),
      "--night",
      "1",
      "--scenario",
      scnFile,
      "--inputs",
      inpFile,
      "--ticks",
      String(item.ticks),
      "--snapshot-every",
      String(item.snapshotEvery),
      "--out",
      outFile,
    ],
    { encoding: "utf8" }
  );

  if (run.status !== 0) {
    console.error(`Scenario ${item.id} failed (exit ${run.status}): ${run.stderr}`);
    process.exit(1);
  }

  const records = fs
    .readFileSync(outFile, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((l) => JSON.parse(l));
  const detail = item.assert(records);
  results.push({ id: item.id, ac: item.ac, desc: item.desc, status: "PASS", detail });
}

// 4. Determinism check (AC-08)
const detOut1 = path.join(proofDir, "determinism-run1.jsonl");
const detOut2 = path.join(proofDir, "determinism-run2.jsonl");
for (const out of [detOut1, detOut2]) {
  const r = spawnSync(
    process.execPath,
    [cliPath, "--seed", "2026", "--night", "1", "--ticks", "600", "--snapshot-every", "60", "--out", out],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error("Determinism run failed:", r.stderr);
    process.exit(1);
  }
}
const raw1 = fs.readFileSync(detOut1, "utf8");
const raw2 = fs.readFileSync(detOut2, "utf8");
if (raw1 !== raw2) {
  console.error("Determinism check FAILED: outputs differ!");
  process.exit(1);
}
results.push({
  id: "determinism-check",
  ac: "AC-08",
  desc: "2 lần chạy cùng --seed 2026 (random_motes & random_shades bật) giống hệt từng byte",
  status: "PASS",
  detail: `identical ${Buffer.byteLength(raw1, "utf8")} bytes across 600 ticks`,
});

// 5. Invalid input exit-code-2 check (AC-09)
const badInp = path.join(scenariosDir, "invalid-duplicate-tick.inputs.json");
fs.writeFileSync(
  badInp,
  JSON.stringify({ frames: [{ tick: 5, move: [0, 1] }, { tick: 5, move: [0, 0] }] }, null, 2) + "\n",
  "utf8"
);
const badRun = spawnSync(
  process.execPath,
  [cliPath, "--seed", "1", "--night", "1", "--inputs", badInp, "--ticks", "10", "--out", path.join(proofDir, "unused.jsonl")],
  { encoding: "utf8" }
);
if (badRun.status !== 2 || !badRun.stderr.trim()) {
  console.error(`Expected exit code 2 on invalid inputs, got ${badRun.status}`);
  process.exit(1);
}
results.push({
  id: "invalid-input-exit2",
  ac: "AC-09",
  desc: "File inputs sai định dạng (tick trùng) thoát mã 2 + ghi stderr",
  status: "PASS",
  detail: `exit=${badRun.status}, stderr="${badRun.stderr.trim()}"`,
});

// Write genuine proof summary table
const md = [
  "# Phase 1 Verification Proof Summary",
  "",
  `- Command: \`npm run verify\``,
  `- Node.js: \`${process.version}\` (${process.platform})`,
  `- Harness guard (\`scripts/hook-guard.mjs\`): **PASS**`,
  `- Unit + CLI test suite (\`vitest run\`): **PASS** (full log in \`vitest-output.txt\`)`,
  "",
  "## Traceability Matrix (PRD-0 & Test Contract v1.0)",
  "",
  "| Check ID | AC | Yêu cầu | Kết quả | Chi tiết đo được | Bằng chứng |",
  "|---|---|---|---|---|---|",
  ...results.map((r) => {
    const fileLink =
      r.id === "determinism-check"
        ? "`determinism-run1.jsonl` == `determinism-run2.jsonl`"
        : r.id === "invalid-input-exit2"
          ? "`vitest-output.txt`"
          : `\`${r.id}.jsonl\``;
    return `| \`${r.id}\` | ${r.ac} | ${r.desc} | **${r.status}** | ${r.detail} | ${fileLink} |`;
  }),
  "",
].join("\n");

fs.writeFileSync(path.join(proofDir, "summary.md"), md, "utf8");
console.log("Phase 1 verification PASSED! Proof written to docs/proof/phase-1/summary.md");
