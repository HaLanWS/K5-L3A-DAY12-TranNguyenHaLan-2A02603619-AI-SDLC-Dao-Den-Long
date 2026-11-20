import type {
  InputFile,
  InputFramePatch,
  ScenarioConfig,
  Vec3,
} from "../core/types.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ValidationError(`${label} must be a finite number`);
  }
  return v;
}

function assertNonNegInt(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new ValidationError(`${label} must be a non-negative integer`);
  }
  return v;
}

function assertVec3(v: unknown, label: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) {
    throw new ValidationError(`${label} must be a 3-element numeric array`);
  }
  return [
    assertFiniteNumber(v[0], `${label}[0]`),
    assertFiniteNumber(v[1], `${label}[1]`),
    assertFiniteNumber(v[2], `${label}[2]`),
  ];
}

export function validateInputFile(raw: unknown): InputFile {
  if (!isPlainObject(raw)) {
    throw new ValidationError("Inputs root must be a JSON object");
  }
  if (!Array.isArray(raw.frames)) {
    throw new ValidationError('Inputs must contain a "frames" array');
  }

  const frames: InputFramePatch[] = [];
  let prevTick = -1;

  for (let i = 0; i < raw.frames.length; i++) {
    const item = raw.frames[i];
    const prefix = `frames[${i}]`;
    if (!isPlainObject(item)) {
      throw new ValidationError(`${prefix} must be an object`);
    }

    const tick = assertNonNegInt(item.tick, `${prefix}.tick`);
    if (tick <= prevTick) {
      throw new ValidationError(
        `${prefix}.tick (${tick}) must be strictly greater than previous tick (${prevTick})`
      );
    }
    prevTick = tick;

    const patch: InputFramePatch = { tick };

    if (item.move !== undefined) {
      if (!Array.isArray(item.move) || item.move.length !== 2) {
        throw new ValidationError(`${prefix}.move must be a 2-element array [x, z]`);
      }
      const mx = assertFiniteNumber(item.move[0], `${prefix}.move[0]`);
      const mz = assertFiniteNumber(item.move[1], `${prefix}.move[1]`);
      if (mx < -1 || mx > 1 || mz < -1 || mz > 1) {
        throw new ValidationError(`${prefix}.move components must be within [-1, 1]`);
      }
      patch.move = [mx, mz];
    }

    if (item.cam_yaw_deg !== undefined) {
      patch.cam_yaw_deg = assertFiniteNumber(item.cam_yaw_deg, `${prefix}.cam_yaw_deg`);
    }

    for (const key of ["jump", "interact", "pulse", "dash"] as const) {
      if (item[key] !== undefined) {
        if (typeof item[key] !== "boolean") {
          throw new ValidationError(`${prefix}.${key} must be a boolean`);
        }
        patch[key] = item[key];
      }
    }

    frames.push(patch);
  }

  return { frames };
}

export function validateScenarioFile(raw: unknown): ScenarioConfig {
  if (!isPlainObject(raw)) {
    throw new ValidationError("Scenario root must be a JSON object");
  }

  const cfg: ScenarioConfig = {};

  if (raw.player !== undefined) {
    if (!isPlainObject(raw.player)) {
      throw new ValidationError("scenario.player must be an object");
    }
    cfg.player = {};
    if (raw.player.pos !== undefined) {
      cfg.player.pos = assertVec3(raw.player.pos, "scenario.player.pos");
    }
    if (raw.player.carried !== undefined) {
      cfg.player.carried = assertNonNegInt(raw.player.carried, "scenario.player.carried");
    }
    if (raw.player.flames !== undefined) {
      cfg.player.flames = assertNonNegInt(raw.player.flames, "scenario.player.flames");
    }
  }

  if (raw.random_motes !== undefined) {
    if (typeof raw.random_motes !== "boolean") {
      throw new ValidationError("scenario.random_motes must be a boolean");
    }
    cfg.random_motes = raw.random_motes;
  }

  if (raw.random_shades !== undefined) {
    if (typeof raw.random_shades !== "boolean") {
      throw new ValidationError("scenario.random_shades must be a boolean");
    }
    cfg.random_shades = raw.random_shades;
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ValidationError("scenario.motes must be an array");
    }
    cfg.motes = raw.motes.map((item, i) => {
      if (Array.isArray(item)) {
        return assertVec3(item, `scenario.motes[${i}]`);
      }
      if (isPlainObject(item)) {
        if (item.id !== undefined && (typeof item.id !== "string" || item.id.length === 0)) {
          throw new ValidationError(`scenario.motes[${i}].id must be a non-empty string`);
        }
        const pos = assertVec3(item.pos, `scenario.motes[${i}].pos`);
        return item.id !== undefined ? { id: item.id, pos } : { pos };
      }
      throw new ValidationError(
        `scenario.motes[${i}] must be [x, y, z] or { id?, pos: [x, y, z] }`
      );
    });
  }

  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) {
      throw new ValidationError("scenario.shades must be an array");
    }
    cfg.shades = raw.shades.map((item, i) => {
      if (!isPlainObject(item)) {
        throw new ValidationError(`scenario.shades[${i}] must be an object`);
      }
      if (item.id !== undefined && (typeof item.id !== "string" || item.id.length === 0)) {
        throw new ValidationError(`scenario.shades[${i}].id must be a non-empty string`);
      }
      if (item.state !== undefined && typeof item.state !== "string") {
        throw new ValidationError(`scenario.shades[${i}].state must be a string`);
      }
      const pos = assertVec3(item.pos, `scenario.shades[${i}].pos`);
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(item.state !== undefined ? { state: item.state } : {}),
      };
    });
  }

  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) {
      throw new ValidationError("scenario.lanterns must be an array");
    }
    cfg.lanterns = raw.lanterns.map((item, i) => {
      if (!isPlainObject(item)) {
        throw new ValidationError(`scenario.lanterns[${i}] must be an object`);
      }
      if (typeof item.id !== "string" || item.id.length === 0) {
        throw new ValidationError(`scenario.lanterns[${i}].id must be a non-empty string`);
      }
      const out: NonNullable<ScenarioConfig["lanterns"]>[number] = { id: item.id };
      if (item.pos !== undefined) {
        out.pos = assertVec3(item.pos, `scenario.lanterns[${i}].pos`);
      }
      if (item.deposited !== undefined) {
        out.deposited = assertNonNegInt(
          item.deposited,
          `scenario.lanterns[${i}].deposited`
        );
      }
      if (item.lit !== undefined) {
        if (typeof item.lit !== "boolean") {
          throw new ValidationError(`scenario.lanterns[${i}].lit must be a boolean`);
        }
        out.lit = item.lit;
      }
      return out;
    });
  }

  if (raw.time_left_s !== undefined) {
    const t = assertFiniteNumber(raw.time_left_s, "scenario.time_left_s");
    if (t < 0) {
      throw new ValidationError("scenario.time_left_s must be >= 0");
    }
    cfg.time_left_s = t;
  }

  return cfg;
}
