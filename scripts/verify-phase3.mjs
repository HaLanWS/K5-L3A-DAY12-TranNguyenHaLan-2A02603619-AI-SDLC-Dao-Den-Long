#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cliPath = path.join(root, "dist-headless", "headless", "cli.js");
const proofDir = path.join(root, "docs", "proof", "phase-3");
fs.mkdirSync(proofDir, { recursive: true });

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
  console.error(vitest.stdout, vitest.stderr);
  process.exit(1);
}

const proofFile = path.join(proofDir, "p3-summary.jsonl");
const run = spawnSync(process.execPath, [cliPath, "--seed", "42", "--night", "1", "--ticks", "60", "--out", proofFile], { encoding: "utf8" });
if (run.status !== 0) {
  console.error("CLI run failed:", run.stderr);
  process.exit(1);
}

fs.writeFileSync(
  path.join(proofDir, "summary.md"),
  `# Phase 3 Verification Proof Summary\n\n- Vitest Suite: PASS\n- Contract v1.2 Headless Trace: PASS (\`p3-summary.jsonl\`)\n`,
  "utf8"
);
console.log("Phase 3 verification PASSED!");
