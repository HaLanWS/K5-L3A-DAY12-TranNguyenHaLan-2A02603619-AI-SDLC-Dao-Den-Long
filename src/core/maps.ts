import type { Vec3 } from "./types.js";

export interface JumpPadDef {
  id: string;
  pos: Vec3;
  radius: number;
  launchVy: number;
  launchHorizSpeed: number;
  dirX: number;
  dirZ: number;
}

export interface CharmDef {
  id: string;
  pos: Vec3;
}

export interface NightMapConfig {
  night: 1 | 2 | 3;
  name: string;
  introQuote: string;
  spawnPos: Vec3;
  lanterns: { id: string; pos: Vec3 }[];
  motePoints: Vec3[];
  shadePoints: Vec3[];
  shadeSpawnIntervalTicks: number;
  shadeMaxCount: number;
  shadeSpeed: number;
  jumpPads: JumpPadDef[];
  charms: CharmDef[];
  hasDrifters: boolean;
  hasWind: boolean;
}

function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

function ringPoints(
  cx: number,
  cz: number,
  y: number,
  radius: number,
  anglesDeg: number[]
): Vec3[] {
  return anglesDeg.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return [round3(cx + Math.cos(rad) * radius), y, round3(cz + Math.sin(rad) * radius)];
  });
}

function rangeDeg(start: number, step: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(start + i * step);
  return out;
}

function buildNight1Map(): NightMapConfig {
  const motePoints: Vec3[] = [
    ...ringPoints(0, 0, 0, 12, rangeDeg(0, 45, 8)),
    ...ringPoints(0, 0, 0, 33, rangeDeg(0, 22.5, 16)),
  ];
  const shadePoints: Vec3[] = ringPoints(0, 0, 0, 37, rangeDeg(15, 30, 12));

  return {
    night: 1,
    name: "Đảo Bến",
    introQuote:
      "Ông Đăng: \"Đêm đầu tiên ở Đảo Bến, sương đen vừa tràn về. Hãy thắp lại 5 Đèn Lồng Lớn trước khi ngọn lửa tắt!\"",
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: "L1", pos: [0, 0, 25] },
      { id: "L2", pos: [23.8, 0, 7.7] },
      { id: "L3", pos: [14.7, 0, -20.2] },
      { id: "L4", pos: [-14.7, 0, -20.2] },
      { id: "L5", pos: [-23.8, 0, 7.7] },
    ],
    motePoints,
    shadePoints,
    shadeSpawnIntervalTicks: 8 * 60, // 480 ticks
    shadeMaxCount: 6,
    shadeSpeed: 4.0,
    jumpPads: [],
    charms: [],
    hasDrifters: false,
    hasWind: false,
  };
}

function buildNight2Map(): NightMapConfig {
  const motePoints: Vec3[] = [
    ...ringPoints(0, 0, 0, 10, [0, 90, 180, 270]),
    ...ringPoints(0, 0, 0, 22, rangeDeg(0, 45, 8)),
    ...ringPoints(70, 0, 0, 10, [0, 90, 180, 270]),
    ...ringPoints(70, 0, 0, 22, rangeDeg(0, 45, 8)),
  ];
  const shadePoints: Vec3[] = [
    ...ringPoints(0, 0, 0, 26, rangeDeg(22.5, 45, 8)),
    ...ringPoints(70, 0, 0, 26, rangeDeg(22.5, 45, 8)),
  ];

  // Jump pad (20,0,18) -> center B (70,0,0)
  const dx1 = 70 - 20;
  const dz1 = 0 - 18;
  const len1 = Math.hypot(dx1, dz1);

  // Jump pad (50,0,-18) -> center A (0,0,0)
  const dx2 = 0 - 50;
  const dz2 = 0 - -18;
  const len2 = Math.hypot(dx2, dz2);

  return {
    night: 2,
    name: "Đảo Cau",
    introQuote:
      "Ông Đăng: \"Đảo Cau nối đôi bờ bằng chiếc cầu tre mong manh. Cẩn thận Gió Lạc rình rập và tận dụng Bùa Gió nhé, Mây!\"",
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: "L1", pos: [0, 0, 20] },
      { id: "L2", pos: [17, 0, -10] },
      { id: "L3", pos: [-17, 0, -10] },
      { id: "L4", pos: [70, 0, 20] },
      { id: "L5", pos: [87, 0, -10] },
      { id: "L6", pos: [53, 0, -10] },
    ],
    motePoints,
    shadePoints,
    shadeSpawnIntervalTicks: 7 * 60, // 420 ticks
    shadeMaxCount: 8,
    shadeSpeed: 4.0,
    jumpPads: [
      {
        id: "JP1",
        pos: [20, 0, 18],
        radius: 1.0,
        launchVy: 14.0,
        launchHorizSpeed: 24.0,
        dirX: dx1 / len1,
        dirZ: dz1 / len1,
      },
      {
        id: "JP2",
        pos: [50, 0, -18],
        radius: 1.0,
        launchVy: 14.0,
        launchHorizSpeed: 24.0,
        dirX: dx2 / len2,
        dirZ: dz2 / len2,
      },
    ],
    charms: [{ id: "C1", pos: [35, 0, 0] }],
    hasDrifters: true,
    hasWind: false,
  };
}

function buildNight3Map(): NightMapConfig {
  const motePoints: Vec3[] = [
    ...ringPoints(0, 0, 0, 34, rangeDeg(0, 20, 18)),
    ...ringPoints(0, 0, 3, 18, rangeDeg(20, 20, 8)),
    ...ringPoints(0, 0, 6, 5, [45, 135, 225, 315]),
  ];
  const shadePoints: Vec3[] = ringPoints(0, 0, 0, 43, rangeDeg(0, 22.5, 16));

  return {
    night: 3,
    name: "Đảo Chuông",
    introQuote:
      "Ông Đăng: \"Đêm cuối ở Đảo Chuông ba tầng gió lộng. Leo dốc, bật bục nhảy lên đỉnh tháp chuông và mang bình minh trở lại!\"",
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: "L1", pos: [0, 6, 6] },
      { id: "L2", pos: [18, 3, 10] },
      { id: "L3", pos: [-18, 3, 10] },
      { id: "L4", pos: [35, 0, -10] },
      { id: "L5", pos: [-35, 0, -10] },
      { id: "L6", pos: [20, 0, -35] },
      { id: "L7", pos: [-20, 0, -35] },
    ],
    motePoints,
    shadePoints,
    shadeSpawnIntervalTicks: 6 * 60, // 360 ticks
    shadeMaxCount: 10,
    shadeSpeed: 4.5,
    jumpPads: [
      {
        id: "JP1",
        pos: [0, 3, 13],
        radius: 1.0,
        launchVy: 12.0,
        launchHorizSpeed: 8.0,
        dirX: 0,
        dirZ: -1,
      },
    ],
    charms: [
      { id: "C1", pos: [30, 0, 25] },
      { id: "C2", pos: [-30, 0, 25] },
    ],
    hasDrifters: true,
    hasWind: true,
  };
}

export function getNightMap(night: number): NightMapConfig {
  if (night === 1) return buildNight1Map();
  if (night === 2) return buildNight2Map();
  if (night === 3) return buildNight3Map();
  throw new Error(`Unsupported night "${night}" (expected 1, 2, or 3).`);
}

const RAMP_ANGLES_RAD = [(30 * Math.PI) / 180, (150 * Math.PI) / 180];

/**
 * Returns the ramp surface elevation if (x, z) lies on either Night 3 ramp
 * (width 3m, radial r in [24, 30] rising from Y=0 at r=30 to Y=3 at r=24), else null.
 */
function getNight3RampHeight(x: number, z: number): number | null {
  for (const rad of RAMP_ANGLES_RAD) {
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const along = x * ux + z * uz;
    const perp = Math.abs(-x * uz + z * ux);
    if (along >= 24 - 1e-6 && along <= 30 + 1e-6 && perp <= 1.5 + 1e-6) {
      const t = Math.max(0, Math.min(1, (30 - along) / 6));
      return t * 3;
    }
  }
  return null;
}

/**
 * Returns all valid walkable surface heights at (x, z) for the given night.
 * Empty array means void / sea of clouds (player falls).
 */
export function getSurfaceHeights(night: number, x: number, z: number): number[] {
  if (night === 1) {
    return Math.hypot(x, z) <= 40 + 1e-6 ? [0] : [];
  }
  if (night === 2) {
    const onA = Math.hypot(x, z) <= 28 + 1e-6;
    const onB = Math.hypot(x - 70, z) <= 28 + 1e-6;
    const onBridge = x >= 26 - 1e-6 && x <= 44 + 1e-6 && Math.abs(z) <= 2 + 1e-6;
    return onA || onB || onBridge ? [0] : [];
  }
  if (night === 3) {
    const r = Math.hypot(x, z);
    if (r > 45 + 1e-6) return [];
    const heights: number[] = [0];
    const rampY = getNight3RampHeight(x, z);
    if (rampY !== null) heights.push(rampY);
    if (r >= 12 - 1e-6 && r <= 24 + 1e-6 && z > 0) heights.push(3);
    if (r <= 8 + 1e-6) heights.push(6);
    return heights;
  }
  return [];
}

/**
 * Returns the highest walkable surface at (x, z) that is reachable from `currentY`
 * (allowing step-up <= 0.55m for smooth ramp transitions), or null if void.
 */
export function getSupportHeight(
  night: number,
  x: number,
  z: number,
  currentY: number
): number | null {
  const heights = getSurfaceHeights(night, x, z);
  if (heights.length === 0) return null;
  let best: number | null = null;
  for (const h of heights) {
    if (h <= currentY + 0.55) {
      if (best === null || h > best) best = h;
    }
  }
  return best;
}

/**
 * Checks whether moving horizontally to (x, z) at altitude `currentY` hits a solid vertical wall
 * (Night 3 tier cliff face or Night 3 bell tower cylinder r=2, Y in [6, 14]).
 */
export function isBlockedByObstacle(
  night: number,
  x: number,
  z: number,
  currentY: number
): boolean {
  if (night !== 3) return false;

  const r = Math.hypot(x, z);
  // Bell tower cylinder at center of Tier 2 (r <= 2, height 8m -> Y in [6, 14])
  if (r < 2.0 - 1e-6 && currentY >= 5.5 && currentY < 14.0) {
    return true;
  }

  // Tier 2 cliff (r <= 8, top at Y = 6): impassable wall if below Y = 5.45
  if (r <= 8 + 1e-6 && currentY < 5.45 && currentY > -0.5) {
    // Wait: player spawns at (0,0,0) inside r <= 8 on Tier 0!
    // Only treat Tier 2 cliff as blocking if trying to walk INTO Tier 2 from outside when between Y=0.5 and Y=5.45
    // Actually on Night 3, Tier 2 is a raised plateau at center (0, 6, 0) OR a solid central cylinder!
    // Wait: Player spawns at (0, 0, 0) on Tier 0, OR does Tier 2 sit above Tier 0?
    // Let's check Ticket-02: "Xuất phát (0,0,0)" on Night 1; Night 3 says:
    // "tầng 0 (Y=0) toàn đảo; tầng 1 (Y=3) là vành khăn bán kính 12–24 m ở nửa có z > 0; tầng 2 (Y=6) là đĩa bán kính 8 m ở tâm."
    // If player spawns at (0,0,0) on Night 3, they are ON Tier 0 under/inside r <= 8!
    // So Tier 2 (Y=6) and Tier 1 (Y=3) should ONLY block entry if player is ALREADY outside and approaches from the side?
    // Wait: if player starts at (0,0,0) on Tier 0 and walks outward to r=30 to climb the ramp, they MUST be able to walk on Tier 0 at r <= 8!
    // Let's check: on Tier 0 (Y=0), if Tier 2 is a floating/pillared terrace at Y=6 (or Tier 0 is full island under it), walking on Tier 0 works seamlessly,
    // and jumping at r=8 only reaches Y=1.225 < 6 so player can NEVER jump onto Tier 2 anyway (must use jump pad at (0,3,13))!
    // Meanwhile, Tier 1 (12 <= r <= 24, z > 0, Y=3) blocks horizontal entry from Tier 0 if you are NOT on the ramp and try to enter its wall!
    return false;
  }

  return false;
}

/**
 * Resolves horizontal movement on Night 3 so the player cannot walk through the bell tower
 * or through Tier 1's vertical cliff wall from Tier 0 (except via the 2 ramps).
 */
export function resolveNight3Horizontal(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  currentY: number
): [number, number] {
  let x = toX;
  let z = toZ;

  // 1. Bell tower solid cylinder (r = 2.0 at Y >= 5.5)
  if (currentY >= 5.5 && currentY < 14.0) {
    const r = Math.hypot(x, z);
    if (r < 2.0) {
      const nx = r > 1e-6 ? x / r : 0;
      const nz = r > 1e-6 ? z / r : 1;
      x = nx * 2.005;
      z = nz * 2.005;
    }
  }

  // 2. Tier 1 vertical cliff wall (12 <= r <= 24, z > 0, top at Y = 3):
  // If player is below Y = 2.45 and NOT on a ramp, prevent stepping horizontally into the solid Tier 1 cliff
  if (currentY < 2.45) {
    const toR = Math.hypot(x, z);
    const inTier1 = toR >= 12 && toR <= 24 && z > 0;
    const fromR = Math.hypot(fromX, fromZ);
    const wasInTier1 = fromR >= 12 && fromR <= 24 && fromZ > 0;
    const onRamp = getNight3RampHeight(x, z) !== null;
    if (inTier1 && !wasInTier1 && !onRamp) {
      return [fromX, fromZ];
    }
  }

  return [x, z];
}

/** Checks if a position (x, z) is over solid walkable ground for a given night (used for shade push/movement). */
export function isOverGround(night: number, x: number, z: number): boolean {
  return getSurfaceHeights(night, x, z).length > 0;
}
