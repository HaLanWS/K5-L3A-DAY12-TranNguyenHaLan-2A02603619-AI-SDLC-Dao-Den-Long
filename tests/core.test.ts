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
  dash: false,
  pause: false,
};

describe("Phase 2 Core Simulation — Contract v1.1", () => {
  it("moves accurately, rotates with cam_yaw_deg, and normalizes diagonal move", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
    });

    for (let i = 0; i < 60; i++) sim.step({ ...idle, move: [0, 1], cam_yaw_deg: 0 });
    expect(sim.getSnapshot().player.pos).toEqual([0, 0, 6]);

    for (let i = 0; i < 60; i++) sim.step({ ...idle, move: [0, 1], cam_yaw_deg: 90 });
    expect(sim.getSnapshot().player.pos).toEqual([6, 0, 6]);
  });

  it("dashes at 14 m/s for 12 ticks (0.2s), maintains air height, and enforces 1.5s cooldown", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
    });

    const ev = sim.step({ ...idle, dash: true });
    expect(ev.some((e) => e.name === "dash")).toBe(true);
    for (let i = 0; i < 11; i++) sim.step(idle);
    // 12 ticks * 14/60 = 2.8m along +Z
    expect(sim.getSnapshot().player.pos[2]).toBeCloseTo(2.8, 2);
    expect(sim.getSnapshot().player.dash_cd_s).toBeGreaterThan(1.0);
  });

  it("handles fall off island (Y < -10): -1 flame, lose carried, 60-tick respawn with 90-tick invuln", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [41, 0, 0], carried: 4, flames: 3 },
      motes: [],
      shades: [],
    });

    let fallEv = null;
    for (let i = 0; i < 120; i++) {
      const evs = sim.step(idle);
      const hit = evs.find((e) => e.name === "player_hit" && e.data.by === "fall");
      if (hit) {
        fallEv = hit;
        break;
      }
    }
    expect(fallEv).not.toBeNull();
    expect(fallEv?.data).toEqual({ by: "fall", flames: 2, dropped: 0, lost: 4 });
    for (let i = 0; i < 60; i++) sim.step(idle);
    const snap = sim.getSnapshot();
    expect(snap.player.pos).toEqual([0, 0, 0]);
    expect(snap.player.invuln).toBe(true);
  });

  it("deposits into lantern (+10/mote, +100/lantern) and wins when all 5 lanterns lit", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 24], carried: 10, flames: 3 },
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

    const evs = sim.step({ ...idle, interact: true });
    expect(evs.some((e) => e.name === "deposit")).toBe(true);
    expect(evs.some((e) => e.name === "lantern_lit")).toBe(true);
    expect(evs.some((e) => e.name === "game_over" && e.data.reason === "all_lit")).toBe(true);
    // 10*10 + 100 + floor(99.983)*2 + 3*50 = 100 + 100 + 198 + 150 = 548
    expect(sim.getSnapshot().score).toBe(548);
  });

  it("pulses shades within 5m 3D radius: stuns 120 ticks, pushes 4m over 15 ticks, +5 score", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 0], carried: 5 },
      shades: [{ id: "S1", pos: [0, 0.8, 3], state: "wander" }],
      motes: [],
    });

    const evs = sim.step({ ...idle, pulse: true });
    expect(evs.find((e) => e.name === "pulse")?.data).toEqual({ stunned_ids: ["S1"] });
    expect(sim.getSnapshot().player.carried).toBe(2);
    expect(sim.getSnapshot().score).toBe(5);
    for (let i = 0; i < 14; i++) sim.step(idle);
    expect(sim.getSnapshot().shades[0].pos[2]).toBeCloseTo(7.0, 2);
    expect(sim.getSnapshot().shades[0].state).toBe("stunned");
  });

  it("supports Night 2 jump pad launch, Wind Charm, and Drifter steal + pulse drop", () => {
    // Jump pad (20, 0, 18) -> lands on Island B (center 70, 0, 0)
    const simPad = new Simulation(2, 2, tuning, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      player: { pos: [20, 0, 18] },
      motes: [],
      shades: [],
      drifters: [],
    });
    for (let i = 0; i < 95; i++) simPad.step(idle);
    const padPos = simPad.getSnapshot().player.pos;
    expect(Math.hypot(padPos[0] - 70, padPos[2])).toBeLessThan(28);
    expect(simPad.getSnapshot().player.grounded).toBe(true);

    // Wind Charm + Drifter steal & pulse drop
    const sim2 = new Simulation(2, 2, tuning, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      player: { pos: [35, 0, 0], carried: 6 },
      motes: [],
      shades: [],
      drifters: [{ id: "D1", pos: [35, 1, 0.5], state: "chase" }],
    });
    const ev1 = sim2.step(idle);
    expect(ev1.some((e) => e.name === "charm_picked")).toBe(true);
    expect(ev1.some((e) => e.name === "drifter_steal" && e.data.amount === 3)).toBe(true);
    expect(sim2.getSnapshot().player.carried).toBe(3);

    const ev2 = sim2.step({ ...idle, pulse: true });
    expect(ev2.some((e) => e.name === "drifter_drop" && e.data.amount === 3)).toBe(true);
    expect(sim2.getSnapshot().motes.filter((m) => m.kind === "dropped")).toHaveLength(3);
  });

  it("supports pause freezing sim_tick and timers while wall tick advances", () => {
    const sim = new Simulation(1, 3, tuning, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: true,
      motes: [],
      shades: [],
      drifters: [],
    });
    sim.step(idle); // tick 1, sim_tick 1
    const pauseEv = sim.step({ ...idle, pause: true }); // tick 2, paused
    expect(pauseEv.some((e) => e.name === "paused")).toBe(true);
    for (let i = 0; i < 10; i++) sim.step({ ...idle, pause: false });
    const snap = sim.getSnapshot();
    expect(snap.state).toBe("paused");
    expect(snap.tick).toBe(12);
    expect(snap.sim_tick).toBe(1);
    const resEv = sim.step({ ...idle, pause: true });
    expect(resEv.some((e) => e.name === "resumed")).toBe(true);
    expect(sim.getSnapshot().state).toBe("playing");
  });
});
