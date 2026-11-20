import contractData from "../../game.contract.json";
import { DT, Simulation } from "../core/simulation.js";
import type { FrameInput, GameContract } from "../core/types.js";
import { SoundEngine } from "./audio.js";
import { GameHUD, type UserSettings } from "./hud.js";
import { IslandRenderer } from "./renderer.js";

const SETTINGS_KEY = "dao_den_long_settings_v1";

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return {
        volume: typeof parsed.volume === "number" ? parsed.volume : 0.7,
        mouseSensitivity:
          typeof parsed.mouseSensitivity === "number" ? parsed.mouseSensitivity : 1.0,
      };
    }
  } catch {
    // ignore storage errors
  }
  return { volume: 0.7, mouseSensitivity: 1.0 };
}

function saveSettings(s: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

const contract = contractData as GameContract;
const container = document.getElementById("app")!;
let settings = loadSettings();

const renderer = new IslandRenderer(container, contract.tuning);
const sound = new SoundEngine();
sound.setVolume(settings.volume);

let currentNight: 1 | 2 | 3 = 1;
let totalCampaignScore = 0;
let sim = new Simulation(202601, currentNight, contract.tuning);
let inMenuOrIntro = true;
let gameOverShown = false;
let camYawDeg = 0;
let accumulator = 0;
let lastTime = performance.now();
let lastCountdownSec = 11;
let prevWindWarning = false;
let pendingPauseToggle = false;

const keys = new Set<string>();
let dragging = false;
let lastMouseX = 0;

function loadNight(night: 1 | 2 | 3, showIntro: boolean): void {
  currentNight = night;
  const seed = Math.floor(Date.now() % 1_000_000) + night * 100;
  sim = new Simulation(seed, night, contract.tuning);
  gameOverShown = false;
  camYawDeg = 0;
  accumulator = 0;
  lastCountdownSec = 11;
  prevWindWarning = false;
  pendingPauseToggle = false;
  renderer.resetEffects();

  if (showIntro) {
    inMenuOrIntro = true;
    hud.showNightIntro(sim.map);
  } else {
    inMenuOrIntro = false;
    hud.hideOverlay();
    sound.startNightBgm();
  }
}

const hud = new GameHUD(container, contract.tuning, settings, {
  onPlayCampaign: () => {
    totalCampaignScore = 0;
    loadNight(1, true);
  },
  onStartNight: () => {
    inMenuOrIntro = false;
    lastTime = performance.now();
    sound.startNightBgm();
  },
  onResume: () => {
    if (sim.getState() === "paused") {
      pendingPauseToggle = true;
    }
  },
  onRestartNight: () => {
    loadNight(currentNight, false);
  },
  onNextNight: () => {
    const next = Math.min(3, currentNight + 1) as 1 | 2 | 3;
    loadNight(next, true);
  },
  onMainMenu: () => {
    inMenuOrIntro = true;
    sound.stopNightBgm();
    hud.showMainMenu();
  },
  onSettingsChange: (next) => {
    settings = next;
    sound.setVolume(next.volume);
    saveSettings(next);
  },
});

hud.showMainMenu();

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  keys.add(e.code);

  if (!e.repeat && !inMenuOrIntro && (e.code === "Escape" || e.code === "KeyP")) {
    if (sim.getState() === "playing" || sim.getState() === "paused") {
      pendingPauseToggle = true;
    }
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
  camYawDeg = (camYawDeg - dx * 0.35 * settings.mouseSensitivity) % 360;
});

window.addEventListener("pointerup", () => {
  dragging = false;
});

function buildInput(): FrameInput {
  let mx = 0;
  let mz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) mz += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) mz -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx -= 1;

  const pauseVal = pendingPauseToggle;
  pendingPauseToggle = false;

  return {
    move: [mx, mz],
    cam_yaw_deg: camYawDeg,
    jump: keys.has("Space"),
    interact: keys.has("KeyE") || keys.has("KeyF"),
    pulse: keys.has("KeyQ"),
    dash: keys.has("ShiftLeft") || keys.has("ShiftRight"),
    pause: pauseVal,
  };
}

function loop(now: number): void {
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (!inMenuOrIntro) {
    if (sim.getState() === "playing") {
      if (keys.has("KeyZ")) camYawDeg = (camYawDeg + 110 * frameDt) % 360;
      if (keys.has("KeyC")) camYawDeg = (camYawDeg - 110 * frameDt) % 360;
    }

    accumulator += frameDt;
    while (accumulator >= DT) {
      const st = sim.getState();
      if (st === "won" || st === "lost") {
        accumulator = 0;
        break;
      }
      const prevGrounded = sim.getSnapshot().player.grounded;
      const input = buildInput();
      const events = sim.step(input);
      accumulator -= DT;

      const snapNow = sim.getSnapshot();
      if (prevGrounded && !snapNow.player.grounded && snapNow.player.vel[1] > 1) {
        sound.playJump();
      }

      for (const ev of events) {
        if (ev.name === "paused") hud.showPauseMenu();
        else if (ev.name === "resumed") hud.hideOverlay();
        else if (ev.name === "mote_picked") sound.playMotePickup(Number(ev.data.carried ?? 1));
        else if (ev.name === "charm_picked") sound.playCharmPickup();
        else if (ev.name === "deposit") sound.playDeposit();
        else if (ev.name === "lantern_lit") sound.playLanternLit();
        else if (ev.name === "dash") sound.playDash();
        else if (ev.name === "shade_spawned") sound.playShadeSpawn();
        else if (ev.name === "pulse") {
          sound.playPulse();
          renderer.triggerPulseEffect(
            snapNow.player.pos[0],
            snapNow.player.pos[1],
            snapNow.player.pos[2]
          );
        } else if (ev.name === "player_hit") {
          sound.playHit();
        } else if (ev.name === "game_over") {
          if (ev.data.result === "won") {
            totalCampaignScore += snapNow.score;
            sound.playWin();
          } else {
            sound.playLose();
          }
        }
      }

      // Last 10s countdown sound
      const secCeil = Math.ceil(snapNow.time_left_s);
      if (snapNow.state === "playing" && secCeil <= 10 && secCeil >= 1 && secCeil < lastCountdownSec) {
        lastCountdownSec = secCeil;
        sound.playCountdownTick();
      }

      const diagNow = sim.getDiagnostics();
      if (diagNow.windWarning && !prevWindWarning) {
        sound.playWindWarning();
      }
      prevWindWarning = diagNow.windWarning;
    }
  }

  const snap = sim.getSnapshot();
  const diag = sim.getDiagnostics();
  renderer.syncAndRender(snap, sim.map, camYawDeg, diag.facingYawRad, diag.windWarning, frameDt);
  const arrow = renderer.getNearestUnlitLanternScreen(snap);
  hud.update(snap, sim.map, diag.windWarning, arrow);

  if ((snap.state === "won" || snap.state === "lost") && !gameOverShown) {
    gameOverShown = true;
    hud.showNightResult(snap, totalCampaignScore, diag.endReason);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
