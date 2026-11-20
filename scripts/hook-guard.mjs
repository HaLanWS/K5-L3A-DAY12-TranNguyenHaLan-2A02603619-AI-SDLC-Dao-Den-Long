#!/usr/bin/env node
/**
 * Lightweight AI harness guard hook.
 * Verifies core invariants quickly after edits:
 * 1. src/core/ never imports browser/Three.js APIs or calls Math.random()/Date.now().
 * 2. game.contract.json is valid JSON.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

const contractPath = path.join(root, "game.contract.json");
if (fs.existsSync(contractPath)) {
  try {
    JSON.parse(fs.readFileSync(contractPath, "utf8"));
  } catch (err) {
    errors.push(`Invalid game.contract.json: ${err.message}`);
  }
}

const coreDir = path.join(root, "src", "core");
if (fs.existsSync(coreDir)) {
  const forbidden = [
    { re: /\bMath\.random\s*\(/, msg: "Math.random() is forbidden in src/core/ (use seeded PRNG)" },
    { re: /\bDate\.now\s*\(/, msg: "Date.now() is forbidden in src/core/ (breaks determinism)" },
    { re: /\bperformance\.now\s*\(/, msg: "performance.now() is forbidden in src/core/ (breaks determinism)" },
    { re: /from\s+["']three["']/, msg: "Three.js import is forbidden in src/core/ (keep core headless)" },
    { re: /\bwindow\b|\bdocument\b/, msg: "DOM access is forbidden in src/core/" },
  ];

  for (const entry of fs.readdirSync(coreDir)) {
    if (!entry.endsWith(".ts")) continue;
    const filePath = path.join(coreDir, entry);
    const content = fs.readFileSync(filePath, "utf8");
    for (const rule of forbidden) {
      if (rule.re.test(content)) {
        errors.push(`${path.relative(root, filePath)}: ${rule.msg}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("[hook-guard] Invariant violation(s):");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
