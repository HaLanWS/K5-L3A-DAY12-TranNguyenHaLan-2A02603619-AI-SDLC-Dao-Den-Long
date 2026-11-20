#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Simulation } from "../dist-headless/core/simulation.js";

const argv = process.argv.slice(2);
let seed = 7;
let nightsCount = 10;
let outPath = "soak.json";

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--seed" && argv[i + 1]) seed = Number(argv[++i]);
  if (argv[i] === "--nights" && argv[i + 1]) nightsCount = Number(argv[++i]);
  if (argv[i] === "--out" && argv[i + 1]) outPath = argv[++i];
}

const contract = JSON.parse(fs.readFileSync("game.contract.json", "utf8"));
const t0 = Date.now();
let memStartMb = 0;
const results = [];
let crashes = 0;

for (let i = 0; i < nightsCount; i++) {
  const nightNum = (i % 3) + 1;
  const currentSeed = seed + i;
  try {
    const sim = new Simulation(currentSeed, nightNum, contract.tuning);
    if (i === 0) {
      memStartMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
    }
    const maxTicks = 1200; // fast soak ticks per night
    let moveDir = [0, 1];
    for (let k = 0; k < maxTicks; k++) {
      if (k % 30 === 0) {
        moveDir = [Math.sin(k), Math.cos(k)];
      }
      sim.step({
        move: moveDir,
        cam_yaw_deg: (k * 2) % 360,
        jump: Math.random() < 0.05,
        interact: Math.random() < 0.1,
        pulse: Math.random() < 0.02,
        dash: Math.random() < 0.03,
        pause: false,
      });
      if (sim.getState() !== "playing") break;
    }
    results.push(sim.getState());
  } catch (err) {
    crashes += 1;
    results.push("crashed");
  }
}

const memEndMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
const durationS = round3((Date.now() - t0) / 1000);

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

const soakOutput = {
  nights: nightsCount,
  crashes,
  results,
  mem_start_mb: memStartMb,
  mem_end_mb: memEndMb,
  duration_s: durationS,
};

fs.writeFileSync(outPath, JSON.stringify(soakOutput, null, 2) + "\n", "utf8");
console.log(`Soak test completed: ${outPath}`);
