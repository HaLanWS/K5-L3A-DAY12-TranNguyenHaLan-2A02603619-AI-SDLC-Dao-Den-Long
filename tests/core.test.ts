import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Simulation } from "../src/core/simulation.js";
import type { FrameInput, GameContract, GameTuning } from "../src/core/types.js";

const contract: GameContract = JSON.parse(
  fs.readFileSync(path.resolve("game.contract.json"), "utf8")
);
const tuning: GameTuning = contract.tuning;

const idle: FrameInput = {
  move: [0, 0],
  cam_yaw_deg: 0,
  jump: false,
  interact: false,
  pulse: false,
};

describe("Core Simulation — Test Contract v1.0", () => {
  it("matches game.contract.json Night 1 defaults without emitting setup events", () => {
    const sim = new Simulation(42, 1, tuning, {
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 5]],
      shades: [{ id: "S1", pos: [10, 0, 0] }],
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: true }],
      time_left_s: 300,
    });

    const snap = sim.getSnapshot();
    expect(snap.tick).toBe(0);
    expect(snap.sim_tick).toBe(0);
    expect(snap.state).toBe("playing");
    expect(snap.score).toBe(0); // pre-lit lantern must NOT grant score
    expect(snap.player.pos).toEqual([0, 0, 0]);
    expect(snap.lanterns).toHaveLength(5);
    expect(snap.lanterns.find((l) => l.id === "L1")?.lit).toBe(true);
    expect(snap.motes_active).toBe(1);
    expect(snap.shades).toHaveLength(1);
  });

  it("moves accurately along world axes, rotates with cam_yaw_deg, and normalizes diagonal move > 1", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
    });

    // Move forward (+Z) at cam_yaw_deg = 0 for 60 ticks (1s) -> +6.0m on Z
    for (let i = 0; i < 60; i++) {
      sim.step({ ...idle, move: [0, 1], cam_yaw_deg: 0 });
    }
    expect(sim.getSnapshot().player.pos).toEqual([0, 0, 6]);

    // Move [0, 1] with cam_yaw_deg = 90 -> x' = 0*0 + 1*1 = +1 (+X) for 60 ticks -> +6.0m on X
    for (let i = 0; i < 60; i++) {
      sim.step({ ...idle, move: [0, 1], cam_yaw_deg: 90 });
    }
    expect(sim.getSnapshot().player.pos).toEqual([6, 0, 6]);

    // Move [1, 1] (length sqrt(2) > 1) must be normalized to length 1 -> +6m total distance in 60 ticks
    const before = sim.getSnapshot().player.pos;
    for (let i = 0; i < 60; i++) {
      sim.step({ ...idle, move: [1, 1], cam_yaw_deg: 0 });
    }
    const after = sim.getSnapshot().player.pos;
    const dist = Math.hypot(after[0] - before[0], after[2] - before[2]);
    expect(dist).toBeCloseTo(tuning.player_speed, 2);
  });

  it("jumps on rising edge and lands back on Y = 0", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
    });

    sim.step({ ...idle, jump: true });
    let maxY = sim.getSnapshot().player.pos[1];
    expect(maxY).toBeGreaterThan(0);

    // Hold jump=true continuously — should not double-jump after landing
    for (let i = 0; i < 60; i++) {
      sim.step({ ...idle, jump: true });
      maxY = Math.max(maxY, sim.getSnapshot().player.pos[1]);
    }
    expect(maxY).toBeGreaterThan(1.0);
    expect(sim.getSnapshot().player.pos[1]).toBe(0);
  });

  it("picks up motes within pickup_radius respecting carry_capacity and scores per_mote", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 0], carried: 0 },
      motes: [
        [0, 0, 1.5],
        [0, 0, 1.5],
        [0, 0, 1.5],
        [0, 0, 1.5],
        [0, 0, 1.5],
        [0, 0, 1.5], // 6th mote exceeds carry_capacity=5
      ],
      shades: [],
    });

    const events = sim.step(idle);
    const picked = events.filter((e) => e.name === "mote_picked");
    expect(picked).toHaveLength(tuning.carry_capacity);
    expect(sim.getSnapshot().player.carried).toBe(tuning.carry_capacity);
    expect(sim.getSnapshot().motes_active).toBe(1);
    expect(sim.getSnapshot().score).toBe(tuning.carry_capacity * tuning.score.per_mote);
  });

  it("deposits into unlit lantern on rising edge, lights it, and wins when all 5 lanterns are lit", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 23], carried: 4, flames: 3 },
      lanterns: [
        { id: "L1", pos: [0, 0, 25], deposited: 0, lit: false },
        { id: "L2", lit: true },
        { id: "L3", lit: true },
        { id: "L4", lit: true },
        { id: "L5", lit: true },
      ],
      motes: [],
      shades: [],
      time_left_s: 100,
    });

    const events = sim.step({ ...idle, interact: true });
    expect(events.map((e) => e.name)).toEqual(["deposit", "lantern_lit", "game_over"]);
    expect(events[0].data).toEqual({
      lantern_id: "L1",
      amount: tuning.lantern_cost,
      deposited: tuning.lantern_cost,
    });
    expect(events[1].data).toEqual({ lantern_id: "L1" });
    expect(events[2].data).toEqual({ result: "won", reason: "all_lit" });

    const snap = sim.getSnapshot();
    expect(snap.state).toBe("won");
    expect(snap.player.carried).toBe(4 - tuning.lantern_cost);
    const expectedScore =
      tuning.score.per_lantern +
      Math.floor(100 - 1 / 60) * tuning.score.per_second_left +
      3 * tuning.score.per_flame_left;
    expect(snap.score).toBe(expectedScore);
  });

  it("pulses to push and stun shades within pulse_radius and enforces cooldown", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 0], carried: 3 },
      shades: [
        { id: "S1", pos: [0, 0.9, 5] }, // inside pulse_radius (7m)
        { id: "S2", pos: [20, 0.9, 0] }, // outside pulse_radius
      ],
      motes: [],
    });

    const events = sim.step({ ...idle, pulse: true });
    const pulseEv = events.find((e) => e.name === "pulse");
    expect(pulseEv).toBeDefined();
    expect(pulseEv?.data).toEqual({ stunned_ids: ["S1"] });

    const snap1 = sim.getSnapshot();
    expect(snap1.player.carried).toBe(3 - tuning.pulse_cost);
    expect(snap1.score).toBe(tuning.score.per_stun);
    const s1 = snap1.shades.find((s) => s.id === "S1")!;
    expect(s1.state).toBe("stunned");
    expect(s1.pos[2]).toBeCloseTo(5 + tuning.pulse_push_m, 3);

    // Immediately trying to pulse again during cooldown does nothing
    sim.step({ ...idle, pulse: false });
    const ev2 = sim.step({ ...idle, pulse: true });
    expect(ev2.find((e) => e.name === "pulse")).toBeUndefined();

    // Wait out full pulse_stun_s -> S1 resumes chasing
    const stunTicks = Math.round(tuning.pulse_stun_s * 60);
    for (let i = 0; i < stunTicks; i++) {
      sim.step(idle);
    }
    expect(sim.getSnapshot().shades.find((s) => s.id === "S1")?.state).toBe("chase");
  });

  it("blocks shades from entering safe_radius around lit lanterns", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 25], flames: 3 },
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: true }],
      shades: [{ id: "S1", pos: [0, 0.9, 17] }],
      motes: [],
    });

    for (let i = 0; i < 240; i++) {
      sim.step(idle);
      const s1 = sim.getSnapshot().shades[0];
      const distToL1 = Math.hypot(s1.pos[0] - 0, s1.pos[2] - 25);
      expect(distToL1).toBeGreaterThanOrEqual(tuning.safe_radius - 0.002);
    }
    expect(sim.getSnapshot().player.flames).toBe(3);
  });

  it("deals damage on shade hit, drops motes by hit_drop_ratio, applies invuln_s, and loses at 0 flames", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 0], carried: 4, flames: 2 },
      shades: [{ id: "S1", pos: [0, 0.9, 0.5] }],
      motes: [],
    });

    // Hit 1 on tick 1
    const ev1 = sim.step(idle);
    const hit1 = ev1.find((e) => e.name === "player_hit");
    expect(hit1?.data).toEqual({ by: "shade", flames: 1, dropped: 2 });
    expect(sim.getSnapshot().player.carried).toBe(2);

    // Next 89 ticks: invulnerable (1.5s = 90 ticks)
    for (let i = 0; i < Math.round(tuning.invuln_s * 60) - 1; i++) {
      const ev = sim.step(idle);
      expect(ev.find((e) => e.name === "player_hit")).toBeUndefined();
    }

    // Tick 91 (exact 90 ticks later): vulnerable again -> Hit 2 -> 0 flames -> lost
    const evFinal = sim.step(idle);
    expect(evFinal.map((e) => e.name)).toEqual(["player_hit", "game_over"]);
    expect(evFinal[1].data).toEqual({ result: "lost", reason: "no_flames" });
    expect(sim.getSnapshot().state).toBe("lost");
  });

  it("ends with lost / dawn when time_left_s reaches 0", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      time_left_s: 1,
    });

    let gameOverEv = null;
    for (let i = 0; i < 60; i++) {
      const evs = sim.step(idle);
      for (const e of evs) {
        if (e.name === "game_over") gameOverEv = e;
      }
    }

    expect(gameOverEv).not.toBeNull();
    expect(gameOverEv?.tick).toBe(60);
    expect(gameOverEv?.data).toEqual({ result: "lost", reason: "dawn" });
    expect(sim.getSnapshot().state).toBe("lost");
    expect(sim.getSnapshot().time_left_s).toBe(0);
  });

  it("preserves sub-unit move speed, avoids -0 on 180deg yaw, preserves mote Y, and auto-lights full scenario lanterns", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      motes: [{ id: "M_CUSTOM", pos: [10, 0.5, 0] }],
      shades: [],
      lanterns: [{ id: "L2", deposited: tuning.lantern_cost }],
    });

    const s0 = sim.getSnapshot();
    expect(s0.motes).toEqual([{ id: "M_CUSTOM", pos: [10, 0.5, 0] }]);
    expect(s0.lanterns.find((l) => l.id === "L2")?.lit).toBe(true);
    expect(s0.score).toBe(0);

    // Sub-unit move [0.5, 0] must NOT be scaled up (moves 0.5 * 6.0 = 3.0m in 60 ticks)
    for (let i = 0; i < 60; i++) {
      sim.step({ ...idle, move: [0.5, 0], cam_yaw_deg: 0 });
    }
    expect(sim.getSnapshot().player.pos).toEqual([3, 0, 0]);

    // Move at cam_yaw_deg = 180 back toward origin; ensure no -0 in coordinates
    for (let i = 0; i < 60; i++) {
      sim.step({ ...idle, move: [0.5, 0], cam_yaw_deg: 180 });
    }
    const pos = sim.getSnapshot().player.pos;
    expect(pos[0]).toBe(0);
    expect(Object.is(pos[0], -0)).toBe(false);
    expect(Object.is(pos[2], -0)).toBe(false);
  });

  it("picks up exact boundary mote on tick 72 without 1/60 float drift", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 9]],
      shades: [],
    });

    let pickedTick = -1;
    for (let i = 0; i < 80; i++) {
      const evs = sim.step({ ...idle, move: [0, 1], cam_yaw_deg: 0 });
      const p = evs.find((e) => e.name === "mote_picked");
      if (p) pickedTick = p.tick;
    }
    // 6.0 m/s = 0.1 m/tick -> at tick 72 player is at z=7.2, dist to z=9.0 is exact 1.8 === pickup_radius
    expect(pickedTick).toBe(72);
  });
});
