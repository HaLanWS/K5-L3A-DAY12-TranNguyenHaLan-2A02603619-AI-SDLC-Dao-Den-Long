import type {
  DrifterState,
  InputFile,
  InputFramePatch,
  ScenarioConfig,
  ShadeState,
  Vec3,
} from "../core/types.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const VALID_SHADE_STATES = new Set<ShadeState>([
  "spawning",
  "wander",
  "chase",
  "recoil",
  "stunned",
]);

const VALID_DRIFTER_STATES = new Set<DrifterState>([
  "idle",
  "chase",
  "flee",
  "removed",
]);

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

    for (const key of ["jump", "interact", "pulse", "dash", "pause"] as const) {
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
    for (const field of [
      "carried",
      "flames",
      "invuln_ticks",
      "dash_cd_ticks",
      "pulse_cd_ticks",
      "charm_ticks",
    ] as const) {
      if (raw.player[field] !== undefined) {
        cfg.player[field] = assertNonNegInt(
          raw.player[field],
          `scenario.player.${field}`
        );
      }
    }
  }

  for (const flag of [
    "random_motes",
    "random_shades",
    "random_drifters",
    "wind_enabled",
  ] as const) {
    if (raw[flag] !== undefined) {
      if (typeof raw[flag] !== "boolean") {
        throw new ValidationError(`scenario.${flag} must be a boolean`);
      }
      cfg[flag] = raw[flag];
    }
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
        const kind = item.kind;
        if (kind !== undefined && kind !== "random" && kind !== "dropped") {
          throw new ValidationError(`scenario.motes[${i}].kind must be "random" or "dropped"`);
        }
        if (item.ttl_s !== undefined && item.ttl_s !== null) {
          assertFiniteNumber(item.ttl_s, `scenario.motes[${i}].ttl_s`);
        }
        return {
          ...(item.id !== undefined ? { id: item.id } : {}),
          pos,
          ...(kind !== undefined ? { kind } : {}),
          ...(item.ttl_s !== undefined ? { ttl_s: item.ttl_s as number | null } : {}),
        };
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
      if (item.state !== undefined) {
        if (typeof item.state !== "string" || !VALID_SHADE_STATES.has(item.state as ShadeState)) {
          throw new ValidationError(`scenario.shades[${i}].state invalid: "${String(item.state)}"`);
        }
      }
      const pos = assertVec3(item.pos, `scenario.shades[${i}].pos`);
      const out: NonNullable<ScenarioConfig["shades"]>[number] = {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(item.state !== undefined ? { state: item.state as ShadeState } : {}),
      };
      if (item.state_ticks_left !== undefined) {
        out.state_ticks_left = assertNonNegInt(
          item.state_ticks_left,
          `scenario.shades[${i}].state_ticks_left`
        );
      }
      return out;
    });
  }

  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) {
      throw new ValidationError("scenario.drifters must be an array");
    }
    cfg.drifters = raw.drifters.map((item, i) => {
      if (!isPlainObject(item)) {
        throw new ValidationError(`scenario.drifters[${i}] must be an object`);
      }
      if (item.id !== undefined && (typeof item.id !== "string" || item.id.length === 0)) {
        throw new ValidationError(`scenario.drifters[${i}].id must be a non-empty string`);
      }
      if (item.state !== undefined) {
        if (
          typeof item.state !== "string" ||
          !VALID_DRIFTER_STATES.has(item.state as DrifterState)
        ) {
          throw new ValidationError(`scenario.drifters[${i}].state invalid`);
        }
      }
      const pos = assertVec3(item.pos, `scenario.drifters[${i}].pos`);
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(item.state !== undefined ? { state: item.state as DrifterState } : {}),
        ...(item.stolen !== undefined
          ? { stolen: assertNonNegInt(item.stolen, `scenario.drifters[${i}].stolen`) }
          : {}),
      };
    });
  }

  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) {
      throw new ValidationError("scenario.charms must be an array");
    }
    cfg.charms = raw.charms.map((item, i) => {
      if (!isPlainObject(item)) {
        throw new ValidationError(`scenario.charms[${i}] must be an object`);
      }
      if (item.id !== undefined && (typeof item.id !== "string" || item.id.length === 0)) {
        throw new ValidationError(`scenario.charms[${i}].id must be a non-empty string`);
      }
      const pos = assertVec3(item.pos, `scenario.charms[${i}].pos`);
      if (item.available !== undefined && typeof item.available !== "boolean") {
        throw new ValidationError(`scenario.charms[${i}].available must be a boolean`);
      }
      if (item.respawn_s !== undefined) {
        const rs = assertFiniteNumber(item.respawn_s, `scenario.charms[${i}].respawn_s`);
        if (rs < 0) throw new ValidationError(`scenario.charms[${i}].respawn_s must be >= 0`);
      }
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(item.available !== undefined ? { available: item.available } : {}),
        ...(item.respawn_s !== undefined ? { respawn_s: item.respawn_s as number } : {}),
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
