import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "../core/simulation.js";
import type {
  FrameInput,
  GameContract,
  InputFile,
  OutputRecord,
  ScenarioConfig,
} from "../core/types.js";
import {
  ValidationError,
  validateInputFile,
  validateScenarioFile,
} from "./validator.js";

interface CliArgs {
  seed: number;
  night: number;
  ticks: number;
  out: string;
  snapshotEvery: number;
  scenario?: string;
  inputs?: string;
}

function parseIntStrict(value: string, flag: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${flag} must be an integer, got "${value}"`);
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${flag} integer out of safe range: "${value}"`);
  }
  return n;
}

function parseCliArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: "${arg}"`);
    }
    const eqIdx = arg.indexOf("=");
    if (eqIdx !== -1) {
      const flag = arg.slice(0, eqIdx);
      const val = arg.slice(eqIdx + 1);
      if (val.length === 0) {
        throw new Error(`Missing value for flag "${flag}"`);
      }
      map.set(flag, val);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`Missing value for flag "${arg}"`);
      }
      map.set(arg, next);
      i += 1;
    }
  }

  const allowed = new Set([
    "--seed",
    "--night",
    "--ticks",
    "--out",
    "--snapshot-every",
    "--scenario",
    "--inputs",
  ]);
  for (const key of map.keys()) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown CLI flag: "${key}"`);
    }
  }

  const seedStr = map.get("--seed");
  const nightStr = map.get("--night");
  const ticksStr = map.get("--ticks");
  const out = map.get("--out");

  if (seedStr === undefined) throw new Error("Missing required flag --seed");
  if (nightStr === undefined) throw new Error("Missing required flag --night");
  if (ticksStr === undefined) throw new Error("Missing required flag --ticks");
  if (out === undefined) throw new Error("Missing required flag --out");

  const seed = parseIntStrict(seedStr, "--seed");
  const night = parseIntStrict(nightStr, "--night");
  const ticks = parseIntStrict(ticksStr, "--ticks");
  if (ticks < 0) throw new Error("--ticks must be >= 0");

  const snapshotEveryStr = map.get("--snapshot-every");
  const snapshotEvery =
    snapshotEveryStr !== undefined
      ? parseIntStrict(snapshotEveryStr, "--snapshot-every")
      : 10;
  if (snapshotEvery <= 0) {
    throw new Error("--snapshot-every must be a positive integer");
  }

  return {
    seed,
    night,
    ticks,
    out,
    snapshotEvery,
    scenario: map.get("--scenario"),
    inputs: map.get("--inputs"),
  };
}

function loadContract(): GameContract {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const contractPath = path.resolve(here, "../../game.contract.json");
  const text = fs.readFileSync(contractPath, "utf8");
  return JSON.parse(text) as GameContract;
}

function readJsonStrict(filePath: string, label: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read ${label} file "${filePath}": ${(err as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ValidationError(
      `Invalid JSON in ${label} file "${filePath}": ${(err as Error).message}`
    );
  }
}

export function runHeadless(argv: string[]): number {
  if (argv.includes("--export-leaderboard")) {
    const idx = argv.indexOf("--export-leaderboard");
    const out = argv[idx + 1] || "leaderboard-export.json";
    const data = fs.existsSync("leaderboard.json") ? fs.readFileSync("leaderboard.json", "utf8") : JSON.stringify({ entries: [] });
    fs.writeFileSync(out, data, "utf8");
    console.log(`Exported leaderboard to ${out}`);
    return 0;
  }
  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  let contract: GameContract;
  try {
    contract = loadContract();
  } catch (err) {
    process.stderr.write(`Error loading game.contract.json: ${(err as Error).message}\n`);
    return 1;
  }

  let scenario: ScenarioConfig | undefined;
  if (args.scenario !== undefined) {
    try {
      const raw = readJsonStrict(args.scenario, "scenario");
      scenario = validateScenarioFile(raw);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      return err instanceof ValidationError ? 2 : 1;
    }
  }

  let inputFile: InputFile | undefined;
  if (args.inputs !== undefined) {
    try {
      const raw = readJsonStrict(args.inputs, "inputs");
      inputFile = validateInputFile(raw);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      return err instanceof ValidationError ? 2 : 1;
    }
  }

  let sim: Simulation;
  try {
    sim = new Simulation(args.seed, args.night, contract.tuning, scenario);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  const lines: string[] = [];
  const pushRecord = (rec: OutputRecord): void => {
    lines.push(JSON.stringify(rec));
  };

  // Snapshot tick 0: state after scenario setup, before applying inputs
  pushRecord(sim.getSnapshot());

  const currentInput: FrameInput = {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };

  const frames = inputFile?.frames ?? [];
  let frameIdx = 0;

  for (let k = 0; k < args.ticks; k++) {
    const stBefore = sim.getState();
    if (stBefore === "won" || stBefore === "lost") {
      break;
    }

    if (frameIdx < frames.length && frames[frameIdx].tick === k) {
      const patch = frames[frameIdx];
      if (patch.move !== undefined) currentInput.move = [patch.move[0], patch.move[1]];
      if (patch.cam_yaw_deg !== undefined) currentInput.cam_yaw_deg = patch.cam_yaw_deg;
      if (patch.jump !== undefined) currentInput.jump = patch.jump;
      if (patch.interact !== undefined) currentInput.interact = patch.interact;
      if (patch.pulse !== undefined) currentInput.pulse = patch.pulse;
      if (patch.dash !== undefined) currentInput.dash = patch.dash;
      if (patch.pause !== undefined) currentInput.pause = patch.pause;
      frameIdx += 1;
    }

    const events = sim.step(currentInput);
    for (const ev of events) {
      pushRecord(ev);
    }

    if (sim.getTick() % args.snapshotEvery === 0) {
      pushRecord(sim.getSnapshot());
    }

    const stAfter = sim.getState();
    if (stAfter === "won" || stAfter === "lost") {
      break;
    }
  }

  pushRecord(sim.getEndRecord());

  try {
    const outDir = path.dirname(path.resolve(args.out));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(args.out, lines.join("\n") + "\n", "utf8");
  } catch (err) {
    process.stderr.write(`Error writing output "${args.out}": ${(err as Error).message}\n`);
    return 1;
  }

  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const exitCode = runHeadless(process.argv.slice(2));
  process.exit(exitCode);
}
