import contractData from "../../game.contract.json";
import { DT, Simulation } from "../core/simulation.js";
import type { FrameInput, GameContract } from "../core/types.js";
import { SoundEngine } from "./audio.js";
import { GameHUD } from "./hud.js";
import { IslandRenderer } from "./renderer.js";

const contract = contractData as GameContract;
const container = document.getElementById("app")!;

const renderer = new IslandRenderer(container, contract.tuning);
const sound = new SoundEngine();

let sim = new Simulation(202601, 1, contract.tuning);
let started = false;
let gameOverShown = false;
let camYawDeg = 0;
let accumulator = 0;
let lastTime = performance.now();

const keys = new Set<string>();
let dragging = false;
let lastMouseX = 0;

function resetGame(autoStart: boolean): void {
  const newSeed = Math.floor(Date.now() % 1_000_000) + 1;
  sim = new Simulation(newSeed, 1, contract.tuning);
  started = autoStart;
  gameOverShown = false;
  camYawDeg = 0;
  accumulator = 0;
  renderer.resetEffects();
  hud.update(sim.getSnapshot(), sim.getDiagnostics().pulseCooldownTicks);
}

const hud = new GameHUD(container, contract.tuning, {
  onStart: () => {
    started = true;
    lastTime = performance.now();
  },
  onRestart: () => {
    resetGame(true);
  },
  onToggleMute: () => sound.toggleMute(),
});

// Keyboard & mouse camera controls
window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  keys.add(e.code);
  if (!e.repeat && e.code === "KeyR" && started) {
    hud.hideOverlay();
    resetGame(true);
  }
  if (!e.repeat && e.code === "KeyM") {
    hud.setMutedState(sound.toggleMute());
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

window.addEventListener("blur", () => {
  keys.clear();
  dragging = false;
});

renderer.renderer.domElement.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastMouseX = e.clientX;
});

window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouseX;
  lastMouseX = e.clientX;
  camYawDeg = (camYawDeg - dx * 0.35) % 360;
});

window.addEventListener("pointerup", () => {
  dragging = false;
});

function buildInput(): FrameInput {
  // Camera sits behind Mây along (-sin(θ), -cos(θ)) looking toward (+sin(θ), +cos(θ)).
  // In Contract C world formula, W = +Z (mz=+1), S = -Z (mz=-1), A = +X (mx=+1), D = -X (mx=-1).
  let mx = 0;
  let mz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) mz += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) mz -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx -= 1;

  return {
    move: [mx, mz],
    cam_yaw_deg: camYawDeg,
    jump: keys.has("Space"),
    interact: keys.has("KeyE") || keys.has("KeyF"),
    pulse: keys.has("KeyQ") || keys.has("ShiftLeft") || keys.has("ShiftRight"),
  };
}

function loop(now: number): void {
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  // Optional keyboard camera rotation (Z / C)
  if (started && sim.getState() === "playing") {
    if (keys.has("KeyZ")) camYawDeg = (camYawDeg + 110 * frameDt) % 360;
    if (keys.has("KeyC")) camYawDeg = (camYawDeg - 110 * frameDt) % 360;

    accumulator += frameDt;
    while (accumulator >= DT && sim.getState() === "playing") {
      const input = buildInput();
      const events = sim.step(input);
      accumulator -= DT;

      for (const ev of events) {
        if (ev.name === "mote_picked") {
          sound.playMotePickup(Number(ev.data.carried ?? 1));
        } else if (ev.name === "deposit") {
          sound.playDeposit();
        } else if (ev.name === "lantern_lit") {
          sound.playLanternLit();
        } else if (ev.name === "pulse") {
          sound.playPulse();
          const snap = sim.getSnapshot();
          renderer.triggerPulseEffect(snap.player.pos[0], snap.player.pos[2]);
        } else if (ev.name === "player_hit") {
          sound.playHit();
        } else if (ev.name === "game_over") {
          if (ev.data.result === "won") sound.playWin();
          else sound.playLose();
        }
      }
    }
  }

  const snap = sim.getSnapshot();
  const diag = sim.getDiagnostics();
  renderer.syncAndRender(snap, camYawDeg, diag.facingYawRad, diag.invulnTicks, frameDt);
  hud.update(snap, diag.pulseCooldownTicks);

  if (snap.state !== "playing" && !gameOverShown) {
    gameOverShown = true;
    hud.showEndScreen(snap, diag.endReason);
  }

  requestAnimationFrame(loop);
}

// Initial render
hud.update(sim.getSnapshot(), 0);
requestAnimationFrame(loop);
