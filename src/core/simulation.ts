import { SeededPRNG } from "./prng.js";
import type {
  EndRecord,
  EventName,
  EventRecord,
  FrameInput,
  GameState,
  GameTuning,
  ScenarioConfig,
  SnapshotRecord,
  Vec3,
} from "./types.js";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const DIST_EPS = 1e-9;
export const ISLAND_RADIUS = 42;
export const LANTERN_RING_RADIUS = 25;
export const JUMP_VELOCITY = 7.0;
export const GRAVITY = 20.0;

const INITIAL_RANDOM_MOTES = 15;
const MAX_RANDOM_MOTES = 20;
const MOTE_SPAWN_INTERVAL_TICKS = 4 * TICK_RATE;

const INITIAL_RANDOM_SHADES = 2;
const MAX_RANDOM_SHADES = 5;
const SHADE_SPAWN_INTERVAL_TICKS = 35 * TICK_RATE;
const DEFAULT_SHADE_Y = 0.9;

interface PlayerInternal {
  x: number;
  y: number;
  z: number;
  vy: number;
  flames: number;
  carried: number;
  invulnTicks: number;
  pulseCooldownTicks: number;
  facingYawRad: number;
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
  state: string;
  stunTicks: number;
}

interface MoteInternal {
  id: string;
  x: number;
  y: number;
  z: number;
}

export function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function defaultNight1Lanterns(count: number): LanternInternal[] {
  const lanterns: LanternInternal[] = [];
  for (let i = 0; i < count; i++) {
    // L1 at (0, 0, +25), then clockwise around the circular island
    const angle = (i * 2 * Math.PI) / count;
    const x = Math.sin(angle) * LANTERN_RING_RADIUS;
    const z = Math.cos(angle) * LANTERN_RING_RADIUS;
    lanterns.push({
      id: `L${i + 1}`,
      x: round3(x),
      y: 0,
      z: round3(z),
      lit: false,
      deposited: 0,
    });
  }
  return lanterns;
}

export interface SimulationDiagnostics {
  invulnTicks: number;
  pulseCooldownTicks: number;
  facingYawRad: number;
  islandRadius: number;
  endReason: "all_lit" | "dawn" | "no_flames" | null;
}

export class Simulation {
  readonly seed: number;
  readonly night: number;
  readonly tuning: GameTuning;

  private prng: SeededPRNG;
  private tick = 0;
  private simTick = 0;
  private state: GameState = "playing";
  private endReason: "all_lit" | "dawn" | "no_flames" | null = null;
  private score = 0;
  private initialTimeLeftS: number;
  private timeLeftS: number;

  private randomMotes: boolean;
  private randomShades: boolean;
  private nextMoteNum = 1;
  private nextShadeNum = 1;
  private boundRadius = ISLAND_RADIUS;

  private player: PlayerInternal;
  private lanterns: LanternInternal[];
  private shades: ShadeInternal[] = [];
  private motes: MoteInternal[] = [];

  private prevJump = false;
  private prevInteract = false;
  private prevPulse = false;

  constructor(
    seed: number,
    night: number,
    tuning: GameTuning,
    scenario?: ScenarioConfig
  ) {
    if (night !== 1) {
      throw new Error(`Unsupported night "${night}" in Phase 1 (only night 1 is supported).`);
    }

    this.seed = seed;
    this.night = night;
    this.tuning = tuning;
    this.prng = new SeededPRNG(seed);

    this.initialTimeLeftS =
      scenario?.time_left_s !== undefined
        ? scenario.time_left_s
        : tuning.night1_duration_s;
    this.timeLeftS = this.initialTimeLeftS;

    this.randomMotes = scenario?.random_motes ?? true;
    this.randomShades = scenario?.random_shades ?? true;

    const pPos: Vec3 = scenario?.player?.pos ?? [0, 0, 0];
    this.player = {
      x: pPos[0],
      y: pPos[1],
      z: pPos[2],
      vy: 0,
      flames: scenario?.player?.flames ?? tuning.flames,
      carried: scenario?.player?.carried ?? 0,
      invulnTicks: 0,
      pulseCooldownTicks: 0,
      facingYawRad: 0,
    };

    // Build default Night 1 lanterns and apply any scenario overrides
    this.lanterns = defaultNight1Lanterns(tuning.lantern_count_night1);
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

    // Initialize motes (scenario list replaces defaults; no events emitted)
    if (scenario?.motes !== undefined) {
      for (const m of scenario.motes) {
        if (Array.isArray(m)) {
          const id = `M${this.nextMoteNum++}`;
          this.motes.push({ id, x: m[0], y: m[1], z: m[2] });
        } else {
          const id = m.id ?? `M${this.nextMoteNum++}`;
          this.bumpCounterFromId(id, "M");
          this.motes.push({ id, x: m.pos[0], y: m.pos[1], z: m.pos[2] });
        }
      }
    } else if (this.randomMotes) {
      for (let i = 0; i < INITIAL_RANDOM_MOTES; i++) {
        this.spawnRandomMote();
      }
    }

    // Initialize shades (scenario list replaces defaults; no events emitted)
    if (scenario?.shades !== undefined) {
      for (const s of scenario.shades) {
        const id = s.id ?? `S${this.nextShadeNum++}`;
        this.bumpCounterFromId(id, "S");
        this.shades.push({
          id,
          x: s.pos[0],
          y: s.pos[1],
          z: s.pos[2],
          state: s.state ?? "chase",
          stunTicks: s.state === "stunned" ? Math.round(tuning.pulse_stun_s * TICK_RATE) : 0,
        });
      }
    } else if (this.randomShades) {
      for (let i = 0; i < INITIAL_RANDOM_SHADES; i++) {
        this.spawnRandomShade();
      }
    }

    // Expand movement clamp boundary if scenario places entities beyond default island radius
    let maxR = Math.hypot(this.player.x, this.player.z);
    for (const l of this.lanterns) maxR = Math.max(maxR, Math.hypot(l.x, l.z));
    for (const m of this.motes) maxR = Math.max(maxR, Math.hypot(m.x, m.z));
    for (const s of this.shades) maxR = Math.max(maxR, Math.hypot(s.x, s.z));
    this.boundRadius = Math.max(ISLAND_RADIUS, maxR + 5);
  }

  private bumpCounterFromId(id: string, prefix: "M" | "S"): void {
    if (id.startsWith(prefix)) {
      const n = Number(id.slice(1));
      if (Number.isInteger(n) && n >= 1) {
        if (prefix === "M") this.nextMoteNum = Math.max(this.nextMoteNum, n + 1);
        else this.nextShadeNum = Math.max(this.nextShadeNum, n + 1);
      }
    }
  }

  private spawnRandomMote(): MoteInternal {
    for (let attempt = 0; attempt < 20; attempt++) {
      const [x, z] = this.prng.pointInRing(5, ISLAND_RADIUS - 5);
      if (distXZ(x, z, this.player.x, this.player.z) > this.tuning.pickup_radius + 1.5) {
        const mote: MoteInternal = {
          id: `M${this.nextMoteNum++}`,
          x: round3(x),
          y: 0,
          z: round3(z),
        };
        this.motes.push(mote);
        return mote;
      }
    }
    const [x, z] = this.prng.pointInRing(10, ISLAND_RADIUS - 6);
    const mote: MoteInternal = {
      id: `M${this.nextMoteNum++}`,
      x: round3(x),
      y: 0,
      z: round3(z),
    };
    this.motes.push(mote);
    return mote;
  }

  private spawnRandomShade(): ShadeInternal {
    let chosenX = 0;
    let chosenZ = ISLAND_RADIUS - 6;
    for (let attempt = 0; attempt < 25; attempt++) {
      const [x, z] = this.prng.pointInRing(22, ISLAND_RADIUS - 4);
      const farFromPlayer = distXZ(x, z, this.player.x, this.player.z) > 10;
      const outsideSafeZones = this.lanterns.every(
        (l) => !l.lit || distXZ(x, z, l.x, l.z) >= this.tuning.safe_radius + 1.0
      );
      if (farFromPlayer && outsideSafeZones) {
        chosenX = x;
        chosenZ = z;
        break;
      }
      chosenX = x;
      chosenZ = z;
    }
    const shade: ShadeInternal = {
      id: `S${this.nextShadeNum++}`,
      x: round3(chosenX),
      y: DEFAULT_SHADE_Y,
      z: round3(chosenZ),
      state: "chase",
      stunTicks: 0,
    };
    this.shades.push(shade);
    return shade;
  }

  getTick(): number {
    return this.tick;
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
      pulseCooldownTicks: this.player.pulseCooldownTicks,
      facingYawRad: this.player.facingYawRad,
      islandRadius: ISLAND_RADIUS,
      endReason: this.endReason,
    };
  }

  getSnapshot(): SnapshotRecord {
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      player: {
        pos: [round3(this.player.x), round3(this.player.y), round3(this.player.z)],
        flames: this.player.flames,
        carried: this.player.carried,
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
   * Advances the simulation by exactly 1 tick (1/60s), reading the input for tick k
   * and producing state k+1. Events emitted during this step carry tick = k+1.
   */
  step(input: FrameInput): EventRecord[] {
    if (this.state !== "playing") {
      return [];
    }

    const events: EventRecord[] = [];
    const emit = (name: EventName, data: Record<string, unknown>): void => {
      events.push({ type: "event", tick: this.tick, name, data });
    };

    // 1. Advance tick counter & update time left without cumulative float drift
    this.tick += 1;
    this.simTick = this.tick;
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.tick / TICK_RATE);

    // 2. Tick down integer cooldown & stun timers
    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.pulseCooldownTicks > 0) this.player.pulseCooldownTicks -= 1;

    for (const s of this.shades) {
      if (s.stunTicks > 0) {
        s.stunTicks -= 1;
        if (s.stunTicks === 0) {
          s.state = "chase";
        }
      }
    }

    // 3. Rising-edge detection for discrete actions
    const jumpPressed = input.jump && !this.prevJump;
    const interactPressed = input.interact && !this.prevInteract;
    const pulsePressed = input.pulse && !this.prevPulse;
    this.prevJump = input.jump;
    this.prevInteract = input.interact;
    this.prevPulse = input.pulse;

    // 4. Player horizontal movement (exact Test Contract C formula)
    let mx = input.move[0];
    let mz = input.move[1];
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) {
      mx /= mLen;
      mz /= mLen;
    }

    if (mLen > 1e-6) {
      const theta = (input.cam_yaw_deg * Math.PI) / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const worldX = mx * cosT + mz * sinT;
      const worldZ = -mx * sinT + mz * cosT;

      this.player.x += (worldX * this.tuning.player_speed) / TICK_RATE;
      this.player.z += (worldZ * this.tuning.player_speed) / TICK_RATE;
      this.player.facingYawRad = Math.atan2(worldX, worldZ);

      // Keep player on the circular island (fall_enabled is false)
      const r = Math.hypot(this.player.x, this.player.z);
      if (r > this.boundRadius) {
        const scale = this.boundRadius / r;
        this.player.x *= scale;
        this.player.z *= scale;
      }
    }

    // Jump & vertical gravity
    if (jumpPressed && this.player.y <= 0) {
      this.player.vy = JUMP_VELOCITY;
    }
    if (this.player.y > 0 || this.player.vy !== 0) {
      this.player.vy -= GRAVITY * DT;
      this.player.y += this.player.vy * DT;
      if (this.player.y <= 0) {
        this.player.y = 0;
        this.player.vy = 0;
      }
    }

    // 5. Automatic mote pickup (XZ distance <= pickup_radius)
    if (this.player.carried < this.tuning.carry_capacity && this.motes.length > 0) {
      const remaining: MoteInternal[] = [];
      for (const m of this.motes) {
        if (
          this.player.carried < this.tuning.carry_capacity &&
          distXZ(this.player.x, this.player.z, m.x, m.z) <= this.tuning.pickup_radius + DIST_EPS
        ) {
          this.player.carried += 1;
          this.score += this.tuning.score.per_mote;
          emit("mote_picked", { carried: this.player.carried });
        } else {
          remaining.push(m);
        }
      }
      this.motes = remaining;
    }

    // 6. Interact: deposit light into nearest unlit lantern within interact_radius
    if (interactPressed && this.player.carried > 0) {
      let bestLantern: LanternInternal | null = null;
      let bestDist = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = distXZ(this.player.x, this.player.z, l.x, l.z);
        if (d <= this.tuning.interact_radius + DIST_EPS && d < bestDist) {
          bestDist = d;
          bestLantern = l;
        }
      }

      if (bestLantern) {
        const needed = Math.max(0, this.tuning.lantern_cost - bestLantern.deposited);
        const amount = Math.min(this.player.carried, needed);
        if (amount > 0) {
          this.player.carried -= amount;
          bestLantern.deposited += amount;
          emit("deposit", {
            lantern_id: bestLantern.id,
            amount,
            deposited: bestLantern.deposited,
          });

          if (bestLantern.deposited >= this.tuning.lantern_cost) {
            bestLantern.lit = true;
            this.score += this.tuning.score.per_lantern;
            emit("lantern_lit", { lantern_id: bestLantern.id });

            // Check win condition: all lanterns lit
            if (this.lanterns.every((l) => l.lit)) {
              const timeBonus =
                Math.floor(this.timeLeftS + DIST_EPS) * this.tuning.score.per_second_left;
              const flameBonus = this.player.flames * this.tuning.score.per_flame_left;
              this.score += timeBonus + flameBonus;
              this.state = "won";
              this.endReason = "all_lit";
              emit("game_over", { result: "won", reason: "all_lit" });
              return events;
            }
          }
        }
      }
    }

    // 7. Pulse: spend light to stun and push nearby shades
    if (
      pulsePressed &&
      this.player.pulseCooldownTicks === 0 &&
      this.player.carried >= this.tuning.pulse_cost
    ) {
      this.player.carried -= this.tuning.pulse_cost;
      this.player.pulseCooldownTicks = Math.round(
        this.tuning.pulse_cooldown_s * TICK_RATE
      );

      const stunnedIds: string[] = [];
      const stunDurationTicks = Math.round(this.tuning.pulse_stun_s * TICK_RATE);

      for (const s of this.shades) {
        const dx = s.x - this.player.x;
        const dz = s.z - this.player.z;
        const d = Math.hypot(dx, dz);
        if (d <= this.tuning.pulse_radius + DIST_EPS) {
          const nx = d > 1e-6 ? dx / d : 0;
          const nz = d > 1e-6 ? dz / d : 1;
          s.x += nx * this.tuning.pulse_push_m;
          s.z += nz * this.tuning.pulse_push_m;
          s.state = "stunned";
          s.stunTicks = stunDurationTicks;
          this.score += this.tuning.score.per_stun;
          stunnedIds.push(s.id);
        }
      }

      emit("pulse", { stunned_ids: stunnedIds });
    }

    // 8. Periodic deterministic spawns when enabled
    if (
      this.randomMotes &&
      this.tick % MOTE_SPAWN_INTERVAL_TICKS === 0 &&
      this.motes.length < MAX_RANDOM_MOTES
    ) {
      this.spawnRandomMote();
    }

    if (
      this.randomShades &&
      this.tick % SHADE_SPAWN_INTERVAL_TICKS === 0 &&
      this.shades.length < MAX_RANDOM_SHADES
    ) {
      const spawned = this.spawnRandomShade();
      emit("shade_spawned", { id: spawned.id });
    }

    // 9. Update shades (chase player while respecting safe_radius of lit lanterns)
    const litLanterns = this.lanterns.filter((l) => l.lit);
    for (const s of this.shades) {
      if (s.state === "stunned") continue;

      let candX = s.x;
      let candZ = s.z;
      const toPlayerX = this.player.x - s.x;
      const toPlayerZ = this.player.z - s.z;
      const dToPlayer = Math.hypot(toPlayerX, toPlayerZ);

      if (dToPlayer > 1e-6) {
        const stepDist = Math.min(dToPlayer, this.tuning.shade_speed * DT);
        candX += (toPlayerX / dToPlayer) * stepDist;
        candZ += (toPlayerZ / dToPlayer) * stepDist;
      }

      let repelled = false;
      for (let pass = 0; pass < 2; pass++) {
        for (const l of litLanterns) {
          const lx = candX - l.x;
          const lz = candZ - l.z;
          const dL = Math.hypot(lx, lz);
          if (dL < this.tuning.safe_radius) {
            repelled = true;
            let nx: number;
            let nz: number;
            if (dL > 1e-6) {
              nx = lx / dL;
              nz = lz / dL;
            } else {
              const prevDx = s.x - l.x;
              const prevDz = s.z - l.z;
              const prevD = Math.hypot(prevDx, prevDz);
              if (prevD > 1e-6) {
                nx = prevDx / prevD;
                nz = prevDz / prevD;
              } else {
                nx = 0;
                nz = 1;
              }
            }
            const pushR = this.tuning.safe_radius + 0.001;
            candX = l.x + nx * pushR;
            candZ = l.z + nz * pushR;
          }
        }
      }

      s.x = candX;
      s.z = candZ;
      s.state = repelled ? "flee" : "chase";
    }

    // 10. Shade vs player collision
    if (this.player.invulnTicks === 0) {
      for (const s of this.shades) {
        if (s.state === "stunned") continue;
        if (distXZ(this.player.x, this.player.z, s.x, s.z) <= this.tuning.shade_hit_radius + DIST_EPS) {
          this.player.flames = Math.max(0, this.player.flames - 1);
          const dropped =
            this.tuning.hit_drop_ratio > 0
              ? Math.min(
                  this.player.carried,
                  Math.round(this.player.carried * this.tuning.hit_drop_ratio)
                )
              : 0;
          this.player.carried -= dropped;
          this.player.invulnTicks = Math.round(this.tuning.invuln_s * TICK_RATE);

          emit("player_hit", {
            by: "shade",
            flames: this.player.flames,
            dropped,
          });

          if (this.player.flames <= 0) {
            this.state = "lost";
            this.endReason = "no_flames";
            emit("game_over", { result: "lost", reason: "no_flames" });
            return events;
          }
          break;
        }
      }
    }

    // 11. Dawn timeout check
    if (this.timeLeftS <= 0) {
      this.state = "lost";
      this.endReason = "dawn";
      emit("game_over", { result: "lost", reason: "dawn" });
    }

    return events;
  }
}
