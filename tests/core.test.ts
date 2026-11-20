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

describe("Phase 3 Core Simulation — Contract v1.2 (Đèn Cạn Dầu)", () => {
  it("fuel decays at 1.0/s and turns lantern off when reaching 0", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: "L1", fuel: 2.0, lit: true }],
      motes: [],
      shades: [],
      time_left_s: 100,
    });

    for (let i = 0; i < 60; i++) sim.step(idle);
    expect(sim.getSnapshot().lanterns.find((l) => l.id === "L1")?.fuel).toBeCloseTo(1.0, 1);

    let outEv = null;
    for (let i = 0; i < 65; i++) {
      const evs = sim.step(idle);
      const ev = evs.find((e) => e.name === "lantern_out");
      if (ev) outEv = ev;
    }
    expect(outEv).toBeDefined();
    expect(sim.getSnapshot().lanterns.find((l) => l.id === "L1")?.lit).toBe(false);
  });

  it("refuels lit lantern, caps at 100 fuel, scores +5 per mote, and expands capacity", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 24], carried: 5 },
      lanterns: [{ id: "L1", pos: [0, 0, 25], fuel: 85, lit: true }],
      motes: [],
      shades: [],
      time_left_s: 100,
    });

    // ceil((100 - 85)/10) = 2 motes used
    const evs = sim.step({ ...idle, interact: true });
    const refuelEv = evs.find((e) => e.name === "refuel");
    expect(refuelEv?.data).toEqual({ lantern_id: "L1", amount: 2, fuel: 100 });
    expect(sim.getSnapshot().player.carried).toBe(3);
    expect(sim.getSnapshot().score).toBe(10); // 2 motes * 5
  });

  it("relighting an ever_lit lantern only costs 5 motes and awards +40 points", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 24], carried: 5 },
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: false, ever_lit: true, deposited: 0 }],
      motes: [],
      shades: [],
      time_left_s: 100,
    });

    const evs = sim.step({ ...idle, interact: true });
    const litEv = evs.find((e) => e.name === "lantern_lit");
    expect(litEv?.data).toEqual({ lantern_id: "L1", relight: true });
    // 5 motes * 5 + 40 relight = 65
    expect(sim.getSnapshot().score).toBe(65);
    expect(sim.getSnapshot().player.capacity).toBe(12); // 10 + 2 * 1
  });

  it("shade enters drain state on lantern with fuel < 30 and pulse awards +15 points", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 0], carried: 3 },
      lanterns: [{ id: "L1", pos: [0, 0, 20], fuel: 20, lit: true }],
      shades: [{ id: "S1", pos: [0, 0.8, 19.5], state: "wander" }],
      motes: [],
      time_left_s: 100,
    });

    sim.step(idle);
    expect(sim.getSnapshot().shades[0].state).toBe("drain");

    // Move Mây close to pulse the draining shade
    const simPulse = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 18], carried: 3 },
      lanterns: [{ id: "L1", pos: [0, 0, 20], fuel: 20, lit: true }],
      shades: [{ id: "S1", pos: [0, 0.8, 19.5], state: "drain", target_lantern_id: "L1" }],
      motes: [],
      time_left_s: 100,
    });

    simPulse.step({ ...idle, pulse: true });
    expect(simPulse.getSnapshot().score).toBe(15);
  });

  it("wins with dawn_survived at timeout if >= 60% lanterns lit (3/5 in Night 1)", () => {
    const sim = new Simulation(1, 1, tuning, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 0], flames: 3 },
      lanterns: [
        { id: "L1", fuel: 50, lit: true },
        { id: "L2", fuel: 50, lit: true },
        { id: "L3", fuel: 50, lit: true },
        { id: "L4", lit: false },
        { id: "L5", lit: false },
      ],
      motes: [],
      shades: [],
      time_left_s: 1 / 60,
    });

    const evs = sim.step(idle);
    const winEv = evs.find((e) => e.name === "game_over" && e.data.result === "won");
    expect(winEv?.data.reason).toBe("dawn_survived");
    expect(sim.getSnapshot().state).toBe("won");
  });
});
