import {
  getNightMap,
  getSupportHeight,
  isOverGround,
  resolveNight3Horizontal,
  type NightMapConfig,
} from "./maps.js";
import { SeededPRNG } from "./prng.js";
import type {
  DrifterState,
  EndRecord,
  EventName,
  EventRecord,
  FrameInput,
  GameState,
  GameTuning,
  ScenarioConfig,
  ShadeState,
  SnapshotRecord,
  Vec3,
} from "./types.js";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const DIST_EPS = 1e-9;
export const JUMP_VELOCITY = 7.0;
export const GRAVITY = 20.0;

const INITIAL_RANDOM_MOTES = 20;
const MAX_RANDOM_MOTES = 30;
const MOTE_SPAWN_INTERVAL_TICKS = 240;
const DROPPED_MOTE_TTL_TICKS = 480;

const SHADE_INITIAL_SPAWN_TICK = 300;
const SHADE_SPAWNING_TICKS = 30;
const SHADE_DETECT_RADIUS = 12.0;
const SHADE_DISENGAGE_RADIUS = 18.0;
const SHADE_RECOIL_TICKS = 60;
const SHADE_RECOIL_DIST = 2.0;
const SHADE_HEIGHT_TOLERANCE = 1.5;
const SHADE_SAFE_PUSH_TICKS = 30;
const DEFAULT_SHADE_Y = 0.8;

const PULSE_CENTER_Y_OFFSET = 0.8;
const PULSE_PUSH_TICKS = 15;

const DRIFTER_SPAWN_INTERVAL_TICKS = 1200;
const DRIFTER_MAX_COUNT = 2;
const DRIFTER_IDLE_SPEED = 2.0;
const DRIFTER_CHASE_SPEED = 7.0;
const DRIFTER_FLEE_SPEED = 7.0;
const DRIFTER_DETECT_RADIUS = 15.0;
const DRIFTER_DETECT_MIN_CARRIED = 5;
const DRIFTER_STEAL_RADIUS = 1.2;
const DRIFTER_STEAL_MAX = 3;
const DRIFTER_FLEE_TICKS = 240;
const DRIFTER_DROPPED_FLEE_TICKS = 120;
const DEFAULT_DRIFTER_Y = 1.0;

const CHARM_SPEED = 7.2;
const CHARM_DURATION_TICKS = 600;
const CHARM_RESPAWN_TICKS = 2700;

const WIND_CYCLE_TICKS = 30 * TICK_RATE; // 1800
const WIND_WARNING_TICKS = 2 * TICK_RATE; // 120
const WIND_DURATION_TICKS = 5 * TICK_RATE; // 300
const WIND_PUSH_SPEED = 2.0;

const FALL_Y_THRESHOLD = -10.0;
const FALL_RESPAWN_WAIT_TICKS = 60;

interface PlayerInternal {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  flames: number;
  carried: number;
  invulnTicks: number;
  dashCdTicks: number;
  dashRemainingTicks: number;
  dashDirX: number;
  dashDirZ: number;
  pulseCdTicks: number;
  charmTicks: number;
  launchActive: boolean;
  launchVx: number;
  launchVz: number;
  fallRespawnTicks: number;
  facingYawRad: number; // 0 = +Z, atan2(x, z)
}

interface LanternInternal {
  id: string;
  x: number;
  y: number;
  z: number;
  lit: boolean;
  deposited: number;
}

interface ShadeInternal {
  id: string;
  x: number;
  y: number;
  z: number;
  state: ShadeState;
  stateTicksLeft: number;
  pushTicksLeft: number;
  pushDirX: number;
  pushDirZ: number;
  recoilDirX: number;
  recoilDirZ: number;
  safePushTicksLeft: number;
}

interface MoteInternal {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: "random" | "dropped";
  ttlTicks: number | null;
  spawnSimTick: number;
  spawnPointIndex: number | null;
}

interface DrifterInternal {
  id: string;
  x: number;
  y: number;
  z: number;
  state: DrifterState;
  stateTicksLeft: number;
  stolen: number;
  hasStolen: boolean;
  idleAngle: number;
}

interface CharmInternal {
  id: string;
  x: number;
  y: number;
  z: number;
  available: boolean;
  respawnTicks: number;
}

export function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function dist3D(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): number {
  return Math.hypot(ax - bx, ay - by, az - bz);
}

export interface SimulationDiagnostics {
  invulnTicks: number;
  dashCdTicks: number;
  pulseCooldownTicks: number;
  charmTicks: number;
  facingYawRad: number;
  fallRespawnTicks: number;
  windWarning: boolean;
  windActive: boolean;
  windDirDeg: number;
  map: NightMapConfig;
  endReason: "all_lit" | "dawn" | "no_flames" | null;
}

export class Simulation {
  readonly seed: number;
  readonly night: 1 | 2 | 3;
  readonly tuning: GameTuning;
  readonly map: NightMapConfig;

  private prng: SeededPRNG;
  private tick = 0;
  private simTick = 0;
  private state: GameState = "playing";
  private endReason: "all_lit" | "dawn" | "no_flames" | null = null;
  private score = 0;
  private initialTimeLeftS: number;
  private timeLeftS: number;
  private nightStartEmitted = false;

  private randomMotes: boolean;
  private randomShades: boolean;
  private randomDrifters: boolean;
  private windEnabled: boolean;
  private windActive = false;
  private windWarning = false;
  private windDirDeg = 0;
  private windRemainingTicks = 0;
  private nextWindDirDeg = 0;

  private nextMoteNum = 1;
  private nextShadeNum = 1;
  private nextDrifterNum = 1;

  private player: PlayerInternal;
  private lanterns: LanternInternal[];
  private shades: ShadeInternal[] = [];
  private motes: MoteInternal[] = [];
  private drifters: DrifterInternal[] = [];
  private charms: CharmInternal[] = [];

  private prevJump = false;
  private prevInteract = false;
  private prevPulse = false;
  private prevDash = false;
  private prevPause = false;

  constructor(
    seed: number,
    night: number,
    tuning: GameTuning,
    scenario?: ScenarioConfig
  ) {
    this.map = getNightMap(night);
    this.night = this.map.night;
    this.seed = seed;
    this.tuning = tuning;
    this.prng = new SeededPRNG(seed);

    const defaultDuration =
      this.night === 1
        ? tuning.night1_duration_s
        : this.night === 2
          ? tuning.night2_duration_s
          : tuning.night3_duration_s;

    this.initialTimeLeftS =
      scenario?.time_left_s !== undefined ? scenario.time_left_s : defaultDuration;
    this.timeLeftS = this.initialTimeLeftS;

    this.randomMotes = scenario?.random_motes ?? true;
    this.randomShades = scenario?.random_shades ?? true;
    this.randomDrifters = scenario?.random_drifters ?? this.map.hasDrifters;
    this.windEnabled = scenario?.wind_enabled ?? this.map.hasWind;
    this.nextWindDirDeg = round3(this.prng.range(0, 360));

    const pPos: Vec3 = scenario?.player?.pos ?? [...this.map.spawnPos];
    const startSupport = getSupportHeight(this.night, pPos[0], pPos[2], pPos[1]);
    const grounded = startSupport !== null && Math.abs(pPos[1] - startSupport) <= 0.05;

    this.player = {
      x: pPos[0],
      y: pPos[1],
      z: pPos[2],
      vx: 0,
      vy: 0,
      vz: 0,
      grounded,
      flames: scenario?.player?.flames ?? tuning.flames,
      carried: scenario?.player?.carried ?? 0,
      invulnTicks: scenario?.player?.invuln_ticks ?? 0,
      dashCdTicks: scenario?.player?.dash_cd_ticks ?? 0,
      dashRemainingTicks: 0,
      dashDirX: 0,
      dashDirZ: 1,
      pulseCdTicks: scenario?.player?.pulse_cd_ticks ?? 0,
      charmTicks: scenario?.player?.charm_ticks ?? 0,
      launchActive: false,
      launchVx: 0,
      launchVz: 0,
      fallRespawnTicks: 0,
      facingYawRad: 0, // +Z
    };

    // Build official map lanterns and apply scenario patches
    this.lanterns = this.map.lanterns.map((l) => ({
      id: l.id,
      x: l.pos[0],
      y: l.pos[1],
      z: l.pos[2],
      lit: false,
      deposited: 0,
    }));

    if (scenario?.lanterns) {
      for (const patch of scenario.lanterns) {
        const target = this.lanterns.find((l) => l.id === patch.id);
        if (target) {
          if (patch.pos) {
            target.x = patch.pos[0];
            target.y = patch.pos[1];
            target.z = patch.pos[2];
          }
          if (patch.deposited !== undefined) {
            target.deposited = patch.deposited;
          }
          if (patch.lit !== undefined) {
            target.lit = patch.lit;
            if (patch.lit && patch.deposited === undefined) {
              target.deposited = tuning.lantern_cost;
            }
          } else if (target.deposited >= tuning.lantern_cost) {
            target.lit = true;
          }
        }
      }
    }

    // Initialize motes: 20 at 20 distinct spawn points if random_motes, or scenario list
    if (scenario?.motes !== undefined) {
      for (const m of scenario.motes) {
        if (Array.isArray(m)) {
          const id = `M${this.nextMoteNum++}`;
          this.motes.push({
            id,
            x: m[0],
            y: m[1],
            z: m[2],
            kind: "random",
            ttlTicks: null,
            spawnSimTick: -1,
            spawnPointIndex: null,
          });
        } else {
          const id = m.id ?? `M${this.nextMoteNum++}`;
          this.bumpCounterFromId(id, "M");
          const kind = m.kind ?? "random";
          const ttlTicks =
            kind === "dropped"
              ? Math.round((m.ttl_s ?? DROPPED_MOTE_TTL_TICKS / TICK_RATE) * TICK_RATE)
              : null;
          this.motes.push({
            id,
            x: m.pos[0],
            y: m.pos[1],
            z: m.pos[2],
            kind,
            ttlTicks,
            spawnSimTick: -1,
            spawnPointIndex: null,
          });
        }
      }
    } else if (this.randomMotes) {
      this.spawnInitialRandomMotes();
    }

    // Initialize shades (scenario replaces defaults; default has 0 at tick 0 because 2 spawn at tick 300!)
    if (scenario?.shades !== undefined) {
      for (const s of scenario.shades) {
        const id = s.id ?? `S${this.nextShadeNum++}`;
        this.bumpCounterFromId(id, "S");
        const st: ShadeState = s.state ?? "wander";
        const defaultStateTicks =
          st === "stunned"
            ? Math.round(tuning.pulse_stun_s * TICK_RATE)
            : st === "recoil"
              ? SHADE_RECOIL_TICKS
              : st === "spawning"
                ? SHADE_SPAWNING_TICKS
                : 0;
        this.shades.push({
          id,
          x: s.pos[0],
          y: s.pos[1],
          z: s.pos[2],
          state: st,
          stateTicksLeft: s.state_ticks_left ?? defaultStateTicks,
          pushTicksLeft: 0,
          pushDirX: 1,
          pushDirZ: 0,
          recoilDirX: 1,
          recoilDirZ: 0,
          safePushTicksLeft: 0,
        });
      }
    }

    // Initialize drifters (scenario replaces defaults; default spawns at tick 1200, 2400...)
    if (scenario?.drifters !== undefined) {
      for (const d of scenario.drifters) {
        const id = d.id ?? `D${this.nextDrifterNum++}`;
        this.bumpCounterFromId(id, "D");
        const st: DrifterState = d.state ?? "idle";
        this.drifters.push({
          id,
          x: d.pos[0],
          y: d.pos[1],
          z: d.pos[2],
          state: st,
          stateTicksLeft: st === "flee" ? DRIFTER_FLEE_TICKS : 0,
          stolen: d.stolen ?? 0,
          hasStolen: (d.stolen ?? 0) > 0 || st === "flee" || st === "removed",
          idleAngle: this.prng.range(0, Math.PI * 2),
        });
      }
    }

    // Initialize charms (scenario replaces defaults; otherwise map defaults)
    if (scenario?.charms !== undefined) {
      for (let i = 0; i < scenario.charms.length; i++) {
        const c = scenario.charms[i];
        const available = c.available ?? true;
        this.charms.push({
          id: c.id ?? `C${i + 1}`,
          x: c.pos[0],
          y: c.pos[1],
          z: c.pos[2],
          available,
          respawnTicks: available ? 0 : Math.round((c.respawn_s ?? 0) * TICK_RATE),
        });
      }
    } else {
      for (const c of this.map.charms) {
        this.charms.push({
          id: c.id,
          x: c.pos[0],
          y: c.pos[1],
          z: c.pos[2],
          available: true,
          respawnTicks: 0,
        });
      }
    }
  }

  private bumpCounterFromId(id: string, prefix: "M" | "S" | "D"): void {
    if (id.startsWith(prefix)) {
      const n = Number(id.slice(1));
      if (Number.isInteger(n) && n >= 1) {
        if (prefix === "M") this.nextMoteNum = Math.max(this.nextMoteNum, n + 1);
        else if (prefix === "S") this.nextShadeNum = Math.max(this.nextShadeNum, n + 1);
        else this.nextDrifterNum = Math.max(this.nextDrifterNum, n + 1);
      }
    }
  }

  private spawnInitialRandomMotes(): void {
    const indices = this.map.motePoints.map((_, i) => i);
    // Deterministic Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(this.prng.next() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const count = Math.min(INITIAL_RANDOM_MOTES, indices.length);
    for (let k = 0; k < count; k++) {
      const idx = indices[k];
      const pt = this.map.motePoints[idx];
      this.motes.push({
        id: `M${this.nextMoteNum++}`,
        x: pt[0],
        y: pt[1],
        z: pt[2],
        kind: "random",
        ttlTicks: null,
        spawnSimTick: -1,
        spawnPointIndex: idx,
      });
    }
  }

  private spawnScheduledMote(): void {
    if (this.motes.length >= MAX_RANDOM_MOTES) return;
    const freeIndices: number[] = [];
    for (let i = 0; i < this.map.motePoints.length; i++) {
      const pt = this.map.motePoints[i];
      const occupied = this.motes.some(
        (m) =>
          m.spawnPointIndex === i ||
          (distXZ(m.x, m.z, pt[0], pt[2]) < 0.5 && Math.abs(m.y - pt[1]) < 0.5)
      );
      if (!occupied) freeIndices.push(i);
    }
    if (freeIndices.length === 0) return;
    const chosenIdx = freeIndices[Math.floor(this.prng.next() * freeIndices.length)];
    const pt = this.map.motePoints[chosenIdx];
    this.motes.push({
      id: `M${this.nextMoteNum++}`,
      x: pt[0],
      y: pt[1],
      z: pt[2],
      kind: "random",
      ttlTicks: null,
      spawnSimTick: this.simTick,
      spawnPointIndex: chosenIdx,
    });
  }

  private spawnScheduledShade(): ShadeInternal | null {
    if (this.shades.length >= this.map.shadeMaxCount) return null;
    const validPoints = this.map.shadePoints.filter((pt) => {
      if (distXZ(pt[0], pt[2], this.player.x, this.player.z) < 15.0 - DIST_EPS) {
        return false;
      }
      const inSafe = this.lanterns.some(
        (l) => l.lit && distXZ(pt[0], pt[2], l.x, l.z) < this.tuning.safe_radius
      );
      if (inSafe) return false;
      const occupied = this.shades.some((s) => distXZ(s.x, s.z, pt[0], pt[2]) < 1.5);
      return !occupied;
    });
    if (validPoints.length === 0) return null;

    const pt = validPoints[Math.floor(this.prng.next() * validPoints.length)];
    const shade: ShadeInternal = {
      id: `S${this.nextShadeNum++}`,
      x: pt[0],
      y: pt[1] + DEFAULT_SHADE_Y,
      z: pt[2],
      state: "spawning",
      stateTicksLeft: SHADE_SPAWNING_TICKS,
      pushTicksLeft: 0,
      pushDirX: 1,
      pushDirZ: 0,
      recoilDirX: 1,
      recoilDirZ: 0,
      safePushTicksLeft: 0,
    };
    this.shades.push(shade);
    return shade;
  }

  private spawnScheduledDrifter(): DrifterInternal | null {
    const activeCount = this.drifters.filter((d) => d.state !== "removed").length;
    if (activeCount >= DRIFTER_MAX_COUNT) return null;
    const pts = this.map.shadePoints;
    if (pts.length === 0) return null;
    const pt = pts[Math.floor(this.prng.next() * pts.length)];
    const drifter: DrifterInternal = {
      id: `D${this.nextDrifterNum++}`,
      x: pt[0],
      y: pt[1] + DEFAULT_DRIFTER_Y,
      z: pt[2],
      state: "idle",
      stateTicksLeft: 0,
      stolen: 0,
      hasStolen: false,
      idleAngle: this.prng.range(0, Math.PI * 2),
    };
    this.drifters.push(drifter);
    return drifter;
  }

  getTick(): number {
    return this.tick;
  }

  getSimTick(): number {
    return this.simTick;
  }

  getState(): GameState {
    return this.state;
  }

  getScore(): number {
    return this.score;
  }

  getDiagnostics(): SimulationDiagnostics {
    return {
      invulnTicks: this.player.invulnTicks,
      dashCdTicks: this.player.dashCdTicks,
      pulseCooldownTicks: this.player.pulseCdTicks,
      charmTicks: this.player.charmTicks,
      facingYawRad: this.player.facingYawRad,
      fallRespawnTicks: this.player.fallRespawnTicks,
      windWarning: this.windWarning,
      windActive: this.windActive,
      windDirDeg: this.windDirDeg,
      map: this.map,
      endReason: this.endReason,
    };
  }

  getSnapshot(): SnapshotRecord {
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      wind: {
        active: this.windActive,
        dir_deg: round3(this.windDirDeg),
      },
      player: {
        pos: [round3(this.player.x), round3(this.player.y), round3(this.player.z)],
        vel: [round3(this.player.vx), round3(this.player.vy), round3(this.player.vz)],
        grounded: this.player.grounded,
        flames: this.player.flames,
        carried: this.player.carried,
        invuln: this.player.invulnTicks > 0,
        dash_cd_s: round3(this.player.dashCdTicks / TICK_RATE),
        pulse_cd_s: round3(this.player.pulseCdTicks / TICK_RATE),
        charm_s: round3(this.player.charmTicks / TICK_RATE),
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: [round3(l.x), round3(l.y), round3(l.z)],
        lit: l.lit,
        deposited: l.deposited,
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: [round3(s.x), round3(s.y), round3(s.z)],
        state: s.state,
      })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: [round3(m.x), round3(m.y), round3(m.z)],
        kind: m.kind,
        ttl_s: m.ttlTicks !== null ? round3(m.ttlTicks / TICK_RATE) : null,
      })),
      drifters: this.drifters.map((d) => ({
        id: d.id,
        pos: [round3(d.x), round3(d.y), round3(d.z)],
        state: d.state,
        stolen: d.stolen,
      })),
      charms: this.charms.map((c) => ({
        id: c.id,
        pos: [round3(c.x), round3(c.y), round3(c.z)],
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE),
      })),
    };
  }

  getEndRecord(): EndRecord {
    return {
      type: "end",
      ticks: this.tick,
      state: this.state,
      score: this.score,
    };
  }

  /**
   * Advances by 1 wall tick (1/60s), following Ticket-02 mandatory 12-step tick order.
   */
  step(input: FrameInput): EventRecord[] {
    if (this.state === "won" || this.state === "lost") {
      return [];
    }

    const events: EventRecord[] = [];
    const emit = (name: EventName, data: Record<string, unknown>): void => {
      events.push({ type: "event", tick: this.tick, name, data });
    };

    // Wall tick always advances
    this.tick += 1;

    // STEP 1: Read input — handle pause FIRST
    const pausePressed = input.pause && !this.prevPause;
    this.prevPause = input.pause;

    if (pausePressed) {
      if (this.state === "playing") {
        this.state = "paused";
        emit("paused", {});
        return events;
      } else if (this.state === "paused") {
        this.state = "playing";
        emit("resumed", {});
      }
    }

    if (this.state === "paused") {
      return events;
    }

    // Active simulation tick
    this.simTick += 1;
    if (!this.nightStartEmitted) {
      this.nightStartEmitted = true;
      emit("night_start", { night: this.night });
    }

    const jumpPressed = input.jump && !this.prevJump;
    const interactPressed = input.interact && !this.prevInteract;
    const pulsePressed = input.pulse && !this.prevPulse;
    const dashPressed = input.dash && !this.prevDash;
    this.prevJump = input.jump;
    this.prevInteract = input.interact;
    this.prevPulse = input.pulse;
    this.prevDash = input.dash;

    // STEP 2: Decrement counters (time, cooldowns, invuln, stun, charm, dropped TTL, charm respawn, wind)
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.simTick / TICK_RATE);

    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.dashCdTicks > 0) this.player.dashCdTicks -= 1;
    if (this.player.pulseCdTicks > 0) this.player.pulseCdTicks -= 1;
    if (this.player.charmTicks > 0) this.player.charmTicks -= 1;
    if (this.player.dashRemainingTicks > 0) this.player.dashRemainingTicks -= 1;

    // Fall respawn countdown
    if (this.player.fallRespawnTicks > 0) {
      this.player.fallRespawnTicks -= 1;
      if (this.player.fallRespawnTicks === 0) {
        this.player.x = this.map.spawnPos[0];
        this.player.y = this.map.spawnPos[1];
        this.player.z = this.map.spawnPos[2];
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.vz = 0;
        this.player.grounded = true;
        this.player.launchActive = false;
        this.player.dashRemainingTicks = 0;
        this.player.invulnTicks = Math.round(this.tuning.invuln_s * TICK_RATE);
        this.player.facingYawRad = 0;
      }
    }

    // Shade timers
    for (const s of this.shades) {
      if (s.stateTicksLeft > 0) {
        s.stateTicksLeft -= 1;
        if (s.stateTicksLeft === 0) {
          if (s.state === "stunned" || s.state === "recoil" || s.state === "spawning") {
            s.state = "wander";
          }
        }
      }
    }

    // Dropped mote TTL
    if (this.motes.length > 0) {
      const aliveMotes: MoteInternal[] = [];
      for (const m of this.motes) {
        if (m.ttlTicks !== null) {
          m.ttlTicks -= 1;
          if (m.ttlTicks <= 0) continue;
        }
        aliveMotes.push(m);
      }
      this.motes = aliveMotes;
    }

    // Charm respawn
    for (const c of this.charms) {
      if (!c.available && c.respawnTicks > 0) {
        c.respawnTicks -= 1;
        if (c.respawnTicks === 0) {
          c.available = true;
        }
      }
    }

    // Night 3 Wind cycle (every 30s -> 5s active, 2s pre-warning)
    if (this.windEnabled) {
      if (this.windRemainingTicks > 0) {
        this.windRemainingTicks -= 1;
        if (this.windRemainingTicks === 0) {
          this.windActive = false;
          this.nextWindDirDeg = round3(this.prng.range(0, 360));
        }
      }
      const cyclePos = this.simTick % WIND_CYCLE_TICKS;
      this.windWarning =
        !this.windActive && cyclePos >= WIND_CYCLE_TICKS - WIND_WARNING_TICKS;
      if (this.simTick > 0 && cyclePos === 0) {
        this.windActive = true;
        this.windWarning = false;
        this.windDirDeg = this.nextWindDirDeg;
        this.windRemainingTicks = WIND_DURATION_TICKS;
      }
    } else {
      this.windActive = false;
      this.windWarning = false;
    }

    // STEP 3: Move Mây (jump, dash, jump pads, wind) then check fall (Y < -10)
    if (this.player.fallRespawnTicks === 0) {
      let mx = input.move[0];
      let mz = input.move[1];
      const mLen = Math.hypot(mx, mz);
      if (mLen > 1) {
        mx /= mLen;
        mz /= mLen;
      }

      let worldMoveX = 0;
      let worldMoveZ = 0;
      if (mLen > 1e-6) {
        const theta = (input.cam_yaw_deg * Math.PI) / 180;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        worldMoveX = mx * cosT + mz * sinT;
        worldMoveZ = -mx * sinT + mz * cosT;
        this.player.facingYawRad = Math.atan2(worldMoveX, worldMoveZ);
      }

      // Dash activation
      const dashDurationTicks = Math.round(this.tuning.dash_duration_s * TICK_RATE); // 12
      const dashCooldownTicks = Math.round(this.tuning.dash_cooldown_s * TICK_RATE); // 90
      if (
        dashPressed &&
        this.player.dashRemainingTicks === 0 &&
        (this.player.dashCdTicks === 0 || this.player.charmTicks > 0)
      ) {
        if (mLen > 1e-6) {
          const wLen = Math.hypot(worldMoveX, worldMoveZ);
          this.player.dashDirX = worldMoveX / wLen;
          this.player.dashDirZ = worldMoveZ / wLen;
        } else {
          this.player.dashDirX = Math.sin(this.player.facingYawRad);
          this.player.dashDirZ = Math.cos(this.player.facingYawRad);
        }
        this.player.dashRemainingTicks = dashDurationTicks;
        this.player.dashCdTicks = this.player.charmTicks > 0 ? 0 : dashCooldownTicks;
        this.player.launchActive = false;
        this.player.vy = 0;
        emit("dash", {});
      }

      // Determine horizontal velocity
      const moveSpeed =
        this.player.charmTicks > 0 ? CHARM_SPEED : this.tuning.player_speed;

      if (this.player.dashRemainingTicks > 0) {
        this.player.vx = this.player.dashDirX * this.tuning.dash_speed;
        this.player.vz = this.player.dashDirZ * this.tuning.dash_speed;
        this.player.vy = 0;
      } else if (this.player.launchActive) {
        this.player.vx = this.player.launchVx;
        this.player.vz = this.player.launchVz;
      } else {
        this.player.vx = worldMoveX * moveSpeed;
        this.player.vz = worldMoveZ * moveSpeed;
      }

      // Wind push
      if (this.windActive) {
        const windRad = (this.windDirDeg * Math.PI) / 180;
        this.player.vx += Math.cos(windRad) * WIND_PUSH_SPEED;
        this.player.vz += Math.sin(windRad) * WIND_PUSH_SPEED;
      }

      // Jump (only when grounded and not dashing)
      if (jumpPressed && this.player.grounded && this.player.dashRemainingTicks === 0) {
        this.player.vy = JUMP_VELOCITY;
        this.player.grounded = false;
      }

      // Horizontal step + Night 3 wall/bell-tower resolution
      const candX = this.player.x + this.player.vx / TICK_RATE;
      const candZ = this.player.z + this.player.vz / TICK_RATE;
      if (this.night === 3) {
        const [rx, rz] = resolveNight3Horizontal(
          this.player.x,
          this.player.z,
          candX,
          candZ,
          this.player.y
        );
        this.player.x = rx;
        this.player.z = rz;
      } else {
        this.player.x = candX;
        this.player.z = candZ;
      }

      // Vertical step & ground resolution
      if (this.player.dashRemainingTicks > 0) {
        const sup = getSupportHeight(this.night, this.player.x, this.player.z, this.player.y);
        if (sup !== null && this.player.y <= sup + 0.05 && this.player.y >= sup - 0.55) {
          this.player.y = sup;
          this.player.grounded = true;
        } else {
          this.player.grounded = false;
        }
      } else {
        const prevY = this.player.y;
        const supBefore = getSupportHeight(this.night, this.player.x, this.player.z, prevY);
        if (this.player.grounded && this.player.vy <= 0 && supBefore !== null && Math.abs(prevY - supBefore) <= 0.55) {
          // Stay glued while walking up/down ramps
          this.player.y = supBefore;
          this.player.vy = 0;
          this.player.grounded = true;
        } else {
          this.player.vy -= GRAVITY / TICK_RATE;
          const nextY = prevY + this.player.vy / TICK_RATE;
          const supAfter = getSupportHeight(this.night, this.player.x, this.player.z, prevY);
          if (supAfter !== null && this.player.vy <= 0 && nextY <= supAfter && prevY >= supAfter - 0.55) {
            this.player.y = supAfter;
            this.player.vy = 0;
            this.player.grounded = true;
            this.player.launchActive = false;
          } else {
            this.player.y = nextY;
            this.player.grounded = false;
          }
        }
      }

      // Jump pads check (when grounded or feet touch pad)
      if (this.player.grounded && !this.player.launchActive && this.player.dashRemainingTicks === 0) {
        for (const pad of this.map.jumpPads) {
          if (
            distXZ(this.player.x, this.player.z, pad.pos[0], pad.pos[2]) <= pad.radius + DIST_EPS &&
            Math.abs(this.player.y - pad.pos[1]) <= 0.4
          ) {
            this.player.vy = pad.launchVy;
            this.player.launchVx = pad.dirX * pad.launchHorizSpeed;
            this.player.launchVz = pad.dirZ * pad.launchHorizSpeed;
            this.player.vx = this.player.launchVx;
            this.player.vz = this.player.launchVz;
            this.player.launchActive = true;
            this.player.grounded = false;
            break;
          }
        }
      }

      // Check fall below Y = -10 (occurs once, ignores invuln)
      if (this.tuning.fall_enabled && this.player.y < FALL_Y_THRESHOLD) {
        this.player.flames = Math.max(0, this.player.flames - 1);
        const lost = this.player.carried;
        this.player.carried = 0;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.vz = 0;
        this.player.launchActive = false;
        this.player.dashRemainingTicks = 0;
        emit("player_hit", {
          by: "fall",
          flames: this.player.flames,
          dropped: 0,
          lost,
        });
        if (this.player.flames > 0) {
          this.player.fallRespawnTicks = FALL_RESPAWN_WAIT_TICKS;
        }
      }
    }

    // STEP 4: Pick up motes & charms
    if (this.player.fallRespawnTicks === 0 && this.player.flames > 0) {
      if (this.player.carried < this.tuning.carry_capacity && this.motes.length > 0) {
        const remaining: MoteInternal[] = [];
        for (const m of this.motes) {
          const canPickDropped = m.kind !== "dropped" || m.spawnSimTick < this.simTick;
          const canPickRandom = m.spawnSimTick < this.simTick;
          if (
            this.player.carried < this.tuning.carry_capacity &&
            canPickDropped &&
            canPickRandom &&
            distXZ(this.player.x, this.player.z, m.x, m.z) <= this.tuning.pickup_radius + DIST_EPS &&
            Math.abs(this.player.y - m.y) <= 1.5 + DIST_EPS
          ) {
            this.player.carried += 1;
            emit("mote_picked", { carried: this.player.carried });
          } else {
            remaining.push(m);
          }
        }
        this.motes = remaining;
      }

      for (const c of this.charms) {
        if (
          c.available &&
          distXZ(this.player.x, this.player.z, c.x, c.z) <= this.tuning.pickup_radius + DIST_EPS &&
          Math.abs(this.player.y - c.y) <= 1.5 + DIST_EPS
        ) {
          c.available = false;
          c.respawnTicks = CHARM_RESPAWN_TICKS;
          this.player.charmTicks = CHARM_DURATION_TICKS;
          this.player.dashCdTicks = 0;
          emit("charm_picked", { charm_id: c.id, charm_ticks: CHARM_DURATION_TICKS });
        }
      }
    }

    // STEP 5: Interact with lanterns
    if (
      interactPressed &&
      this.player.fallRespawnTicks === 0 &&
      this.player.flames > 0 &&
      this.player.carried > 0
    ) {
      let bestLantern: LanternInternal | null = null;
      let bestDist = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = distXZ(this.player.x, this.player.z, l.x, l.z);
        if (d <= this.tuning.interact_radius + DIST_EPS) {
          if (
            d < bestDist - DIST_EPS ||
            (Math.abs(d - bestDist) <= DIST_EPS &&
              bestLantern !== null &&
              l.id < bestLantern.id)
          ) {
            bestDist = d;
            bestLantern = l;
          }
        }
      }

      if (bestLantern) {
        const needed = Math.max(0, this.tuning.lantern_cost - bestLantern.deposited);
        const amount = Math.min(this.player.carried, needed);
        if (amount > 0) {
          this.player.carried -= amount;
          bestLantern.deposited += amount;
          this.score += amount * this.tuning.score.per_mote;
          emit("deposit", {
            lantern_id: bestLantern.id,
            amount,
            deposited: bestLantern.deposited,
          });

          if (bestLantern.deposited >= this.tuning.lantern_cost) {
            bestLantern.lit = true;
            this.score += this.tuning.score.per_lantern;
            emit("lantern_lit", { lantern_id: bestLantern.id });

            // Mark shades inside newly lit lantern's 6m safe zone for <=30-tick push-out
            for (const s of this.shades) {
              if (distXZ(s.x, s.z, bestLantern.x, bestLantern.z) < this.tuning.safe_radius) {
                s.safePushTicksLeft = SHADE_SAFE_PUSH_TICKS;
              }
            }
          }
        }
      }
    }

    // STEP 6: Update safe zones (push out any shades caught inside newly lit lanterns within <= 30 ticks)
    const litLanterns = this.lanterns.filter((l) => l.lit);
    for (const s of this.shades) {
      if (s.safePushTicksLeft > 0) {
        let stillInside = false;
        for (const l of litLanterns) {
          const dx = s.x - l.x;
          const dz = s.z - l.z;
          const d = Math.hypot(dx, dz);
          if (d < this.tuning.safe_radius) {
            stillInside = true;
            const nx = d > 1e-6 ? dx / d : 1;
            const nz = d > 1e-6 ? dz / d : 0;
            const remaining = this.tuning.safe_radius + 0.01 - d;
            const stepMove = remaining / s.safePushTicksLeft;
            s.x += nx * stepMove;
            s.z += nz * stepMove;
          }
        }
        s.safePushTicksLeft = stillInside ? s.safePushTicksLeft - 1 : 0;
      }
    }

    // STEP 7: Pulse (Tỏa Sáng)
    if (
      pulsePressed &&
      this.player.fallRespawnTicks === 0 &&
      this.player.flames > 0 &&
      this.player.pulseCdTicks === 0 &&
      this.player.carried >= this.tuning.pulse_cost
    ) {
      this.player.carried -= this.tuning.pulse_cost;
      this.player.pulseCdTicks = Math.round(this.tuning.pulse_cooldown_s * TICK_RATE);

      const cx = this.player.x;
      const cy = this.player.y + PULSE_CENTER_Y_OFFSET;
      const cz = this.player.z;

      const stunDurationTicks = Math.round(this.tuning.pulse_stun_s * TICK_RATE); // 120
      const stunnedIds: string[] = [];

      const sortedShades = [...this.shades].sort((a, b) => a.id.localeCompare(b.id));
      for (const s of sortedShades) {
        const d3 = dist3D(cx, cy, cz, s.x, s.y, s.z);
        if (d3 <= this.tuning.pulse_radius + DIST_EPS) {
          const dx = s.x - cx;
          const dz = s.z - cz;
          const dXZ = Math.hypot(dx, dz);
          s.pushDirX = dXZ > 1e-6 ? dx / dXZ : 1; // coincident -> +X per spec
          s.pushDirZ = dXZ > 1e-6 ? dz / dXZ : 0;
          s.pushTicksLeft = PULSE_PUSH_TICKS;
          s.state = "stunned";
          s.stateTicksLeft = stunDurationTicks;
          this.score += this.tuning.score.per_stun;
          stunnedIds.push(s.id);
        }
      }

      // Pulse effect on Drifters (Gió Lạc)
      const sortedDrifters = [...this.drifters].sort((a, b) => a.id.localeCompare(b.id));
      for (const d of sortedDrifters) {
        if (d.state === "removed") continue;
        const d3 = dist3D(cx, cy, cz, d.x, d.y, d.z);
        if (d3 <= this.tuning.pulse_radius + DIST_EPS) {
          if (d.state === "chase") {
            d.state = "flee";
            d.stateTicksLeft = DRIFTER_FLEE_TICKS;
          } else if (d.state === "flee" && d.stolen > 0) {
            const amount = d.stolen;
            d.stolen = 0;
            d.stateTicksLeft = DRIFTER_DROPPED_FLEE_TICKS;
            const dropY = getSupportHeight(this.night, d.x, d.z, d.y) ?? 0;
            for (let i = 0; i < amount; i++) {
              const angle = (i / amount) * Math.PI * 2;
              this.motes.push({
                id: `M${this.nextMoteNum++}`,
                x: round3(d.x + Math.cos(angle) * 0.5),
                y: dropY,
                z: round3(d.z + Math.sin(angle) * 0.5),
                kind: "dropped",
                ttlTicks: DROPPED_MOTE_TTL_TICKS,
                spawnSimTick: this.simTick,
                spawnPointIndex: null,
              });
            }
            emit("drifter_drop", { drifter_id: d.id, amount });
          }
        }
      }

      emit("pulse", { stunned_ids: stunnedIds });
    }

    // STEP 8: Move Shades & Drifters
    const shadeSpeed = this.map.shadeSpeed;
    for (const s of this.shades) {
      if (s.state === "spawning") continue;

      if (s.state === "stunned") {
        if (s.pushTicksLeft > 0) {
          const stepPush = this.tuning.pulse_push_m / PULSE_PUSH_TICKS;
          const nx = s.x + s.pushDirX * stepPush;
          const nz = s.z + s.pushDirZ * stepPush;
          // Stop if hitting bell tower obstacle or outside island ground
          const blockedBell =
            this.night === 3 && s.y >= 5.5 && Math.hypot(nx, nz) < 2.0;
          if (!blockedBell && isOverGround(this.night, nx, nz)) {
            s.x = nx;
            s.z = nz;
          } else {
            s.pushTicksLeft = 0;
          }
          if (s.pushTicksLeft > 0) s.pushTicksLeft -= 1;
        }
        continue;
      }

      if (s.state === "recoil") {
        const stepRecoil = SHADE_RECOIL_DIST / SHADE_RECOIL_TICKS;
        const candX = s.x + s.recoilDirX * stepRecoil;
        const candZ = s.z + s.recoilDirZ * stepRecoil;
        if (isOverGround(this.night, candX, candZ)) {
          s.x = candX;
          s.z = candZ;
        }
        this.clampShadeOutsideSafeZones(s, litLanterns);
        continue;
      }

      if (s.safePushTicksLeft > 0) continue;

      // Detection / disengage (wander <-> chase)
      const dToPlayer = distXZ(s.x, s.z, this.player.x, this.player.z);
      if (
        s.state === "wander" &&
        this.player.fallRespawnTicks === 0 &&
        dToPlayer <= SHADE_DETECT_RADIUS + DIST_EPS
      ) {
        s.state = "chase";
      } else if (
        s.state === "chase" &&
        (this.player.fallRespawnTicks > 0 || dToPlayer > SHADE_DISENGAGE_RADIUS)
      ) {
        s.state = "wander";
      }

      let targetX = this.player.x;
      let targetZ = this.player.z;

      if (s.state === "wander") {
        // Move toward nearest unlit lantern (tie-break by id)
        let bestL: LanternInternal | null = null;
        let bestD = Infinity;
        for (const l of this.lanterns) {
          if (l.lit) continue;
          const d = distXZ(s.x, s.z, l.x, l.z);
          if (d < bestD - DIST_EPS || (Math.abs(d - bestD) <= DIST_EPS && bestL && l.id < bestL.id)) {
            bestD = d;
            bestL = l;
          }
        }
        if (bestL) {
          targetX = bestL.x;
          targetZ = bestL.z;
        } else {
          targetX = 0;
          targetZ = 0;
        }
      }

      const dx = targetX - s.x;
      const dz = targetZ - s.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-6) {
        const stepMove = Math.min(dist, shadeSpeed / TICK_RATE);
        const candX = s.x + (dx / dist) * stepMove;
        const candZ = s.z + (dz / dist) * stepMove;
        if (isOverGround(this.night, candX, candZ)) {
          s.x = candX;
          s.z = candZ;
        }
      }

      this.clampShadeOutsideSafeZones(s, litLanterns);
    }

    // Move Drifters
    for (const d of this.drifters) {
      if (d.state === "removed") continue;
      const dToPlayer = distXZ(d.x, d.z, this.player.x, this.player.z);

      if (d.state === "idle") {
        if (
          !d.hasStolen &&
          this.player.fallRespawnTicks === 0 &&
          this.player.carried >= DRIFTER_DETECT_MIN_CARRIED &&
          dToPlayer <= DRIFTER_DETECT_RADIUS + DIST_EPS
        ) {
          d.state = "chase";
        } else {
          d.idleAngle += 0.02;
          d.x += (Math.cos(d.idleAngle) * DRIFTER_IDLE_SPEED) / TICK_RATE;
          d.z += (Math.sin(d.idleAngle) * DRIFTER_IDLE_SPEED) / TICK_RATE;
        }
      }

      if (d.state === "chase") {
        if (
          this.player.fallRespawnTicks > 0 ||
          this.player.carried < DRIFTER_DETECT_MIN_CARRIED ||
          dToPlayer > DRIFTER_DETECT_RADIUS + DIST_EPS
        ) {
          d.state = "idle";
        } else if (dToPlayer > 1e-6) {
          const stepMove = Math.min(dToPlayer, DRIFTER_CHASE_SPEED / TICK_RATE);
          d.x += ((this.player.x - d.x) / dToPlayer) * stepMove;
          d.z += ((this.player.z - d.z) / dToPlayer) * stepMove;
        }
      } else if (d.state === "flee") {
        const dx = d.x - this.player.x;
        const dz = d.z - this.player.z;
        const dist = Math.hypot(dx, dz);
        const nx = dist > 1e-6 ? dx / dist : 1;
        const nz = dist > 1e-6 ? dz / dist : 0;
        d.x += (nx * DRIFTER_FLEE_SPEED) / TICK_RATE;
        d.z += (nz * DRIFTER_FLEE_SPEED) / TICK_RATE;
        d.stateTicksLeft -= 1;
        if (d.stateTicksLeft <= 0) {
          d.state = "removed";
        }
      }
    }

    // STEP 9: Collisions — Drifters steal FIRST, then Shades hit (ascending ID order)
    if (this.player.fallRespawnTicks === 0 && this.player.flames > 0) {
      const sortedDrifters = [...this.drifters].sort((a, b) => a.id.localeCompare(b.id));
      for (const d of sortedDrifters) {
        if (d.state !== "chase" || d.hasStolen) continue;
        if (
          this.player.carried > 0 &&
          distXZ(this.player.x, this.player.z, d.x, d.z) <= DRIFTER_STEAL_RADIUS + DIST_EPS
        ) {
          const amount = Math.min(DRIFTER_STEAL_MAX, this.player.carried);
          this.player.carried -= amount;
          d.stolen = amount;
          d.hasStolen = true;
          d.state = "flee";
          d.stateTicksLeft = DRIFTER_FLEE_TICKS;
          emit("drifter_steal", {
            drifter_id: d.id,
            amount,
            carried: this.player.carried,
          });
        }
      }

      if (this.player.invulnTicks === 0) {
        const sortedShades = [...this.shades].sort((a, b) => a.id.localeCompare(b.id));
        for (const s of sortedShades) {
          if (
            s.state === "stunned" ||
            s.state === "spawning" ||
            s.state === "recoil" ||
            s.safePushTicksLeft > 0
          ) {
            continue;
          }
          if (
            distXZ(this.player.x, this.player.z, s.x, s.z) <= this.tuning.shade_hit_radius + DIST_EPS &&
            Math.abs(this.player.y - s.y) <= SHADE_HEIGHT_TOLERANCE + DIST_EPS
          ) {
            this.player.flames = Math.max(0, this.player.flames - 1);
            const dropped = Math.floor(this.player.carried / 2);
            this.player.carried -= dropped;
            this.player.invulnTicks = Math.round(this.tuning.invuln_s * TICK_RATE);

            // Spawn dropped motes in ring 1.5–2.5 m around Mây (TTL 480, pickable next tick)
            for (let i = 0; i < dropped; i++) {
              const angle = this.prng.range(0, Math.PI * 2);
              const radius = this.prng.range(1.5, 2.5);
              const mx = round3(this.player.x + Math.cos(angle) * radius);
              const mz = round3(this.player.z + Math.sin(angle) * radius);
              const my = getSupportHeight(this.night, mx, mz, this.player.y) ?? this.player.y;
              this.motes.push({
                id: `M${this.nextMoteNum++}`,
                x: mx,
                y: round3(my),
                z: mz,
                kind: "dropped",
                ttlTicks: DROPPED_MOTE_TTL_TICKS,
                spawnSimTick: this.simTick,
                spawnPointIndex: null,
              });
            }

            // Shade recoils 2m over 60 ticks
            const rdx = s.x - this.player.x;
            const rdz = s.z - this.player.z;
            const rd = Math.hypot(rdx, rdz);
            s.recoilDirX = rd > 1e-6 ? rdx / rd : 1;
            s.recoilDirZ = rd > 1e-6 ? rdz / rd : 0;
            s.state = "recoil";
            s.stateTicksLeft = SHADE_RECOIL_TICKS;

            emit("player_hit", {
              by: "shade",
              flames: this.player.flames,
              dropped,
            });
            break; // Max 1 flame loss per tick
          }
        }
      }
    }

    // STEP 10: Scheduled spawns (interactable from NEXT tick)
    if (this.randomMotes && this.simTick > 0 && this.simTick % MOTE_SPAWN_INTERVAL_TICKS === 0) {
      this.spawnScheduledMote();
    }

    if (this.randomShades) {
      if (this.simTick === SHADE_INITIAL_SPAWN_TICK) {
        for (let i = 0; i < 2; i++) {
          const spawned = this.spawnScheduledShade();
          if (spawned) emit("shade_spawned", { id: spawned.id });
        }
      } else if (
        this.simTick > SHADE_INITIAL_SPAWN_TICK &&
        (this.simTick - SHADE_INITIAL_SPAWN_TICK) % this.map.shadeSpawnIntervalTicks === 0
      ) {
        const spawned = this.spawnScheduledShade();
        if (spawned) emit("shade_spawned", { id: spawned.id });
      }
    }

    if (
      this.randomDrifters &&
      this.simTick > 0 &&
      this.simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0
    ) {
      this.spawnScheduledDrifter();
    }

    // STEP 11: Win / Loss check (exact Ticket-02 priority)
    if (this.player.flames <= 0) {
      this.state = "lost";
      this.endReason = "no_flames";
      emit("game_over", { result: "lost", reason: "no_flames" });
    } else if (this.lanterns.every((l) => l.lit)) {
      const timeBonus =
        Math.floor(this.timeLeftS + DIST_EPS) * this.tuning.score.per_second_left;
      const flameBonus = this.player.flames * this.tuning.score.per_flame_left;
      this.score += timeBonus + flameBonus;
      this.state = "won";
      this.endReason = "all_lit";
      emit("game_over", { result: "won", reason: "all_lit" });
    } else if (this.timeLeftS <= 0) {
      this.state = "lost";
      this.endReason = "dawn";
      emit("game_over", { result: "lost", reason: "dawn" });
    }

    return events;
  }

  private clampShadeOutsideSafeZones(
    s: ShadeInternal,
    litLanterns: LanternInternal[]
  ): void {
    for (let pass = 0; pass < 2; pass++) {
      for (const l of litLanterns) {
        const dx = s.x - l.x;
        const dz = s.z - l.z;
        const d = Math.hypot(dx, dz);
        if (d < this.tuning.safe_radius) {
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          const pushR = this.tuning.safe_radius + 0.002;
          s.x = l.x + nx * pushR;
          s.z = l.z + nz * pushR;
        }
      }
    }
  }
}
