export type Vec3 = [number, number, number];

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
}

export interface GameTuning {
  player_speed: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  score: ScoreTuning;
}

export interface GameContract {
  contract_version: string;
  team: string;
  build_cmd: string;
  run_cmd: string;
  headless_cmd: string;
  tuning: GameTuning;
}

export interface FrameInput {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
}

export interface InputFramePatch {
  tick: number;
  move?: [number, number];
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
}

export interface InputFile {
  frames: InputFramePatch[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
  state?: string;
}

export type ScenarioMote = Vec3 | { id?: string; pos: Vec3 };

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: ScenarioMote[];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export type GameState = "playing" | "won" | "lost";

export interface SnapshotPlayer {
  pos: Vec3;
  flames: number;
  carried: number;
}

export interface SnapshotLantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface SnapshotShade {
  id: string;
  pos: Vec3;
  state: string;
}

export interface SnapshotMote {
  id: string;
  pos: Vec3;
}

export interface SnapshotRecord {
  type: "snapshot";
  tick: number;
  sim_tick: number;
  state: GameState;
  time_left_s: number;
  score: number;
  player: SnapshotPlayer;
  lanterns: SnapshotLantern[];
  shades: SnapshotShade[];
  motes_active: number;
  motes: SnapshotMote[];
}

export type EventName =
  | "mote_picked"
  | "deposit"
  | "lantern_lit"
  | "pulse"
  | "player_hit"
  | "shade_spawned"
  | "game_over";

export interface EventRecord {
  type: "event";
  tick: number;
  name: EventName;
  data: Record<string, unknown>;
}

export interface EndRecord {
  type: "end";
  ticks: number;
  state: GameState;
  score: number;
}

export type OutputRecord = SnapshotRecord | EventRecord | EndRecord;
