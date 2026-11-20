import type { GameTuning, SnapshotRecord } from "../core/types.js";

export interface HudCallbacks {
  onStart: () => void;
  onRestart: () => void;
  onToggleMute: () => boolean;
}

export class GameHUD {
  private flamesEl: HTMLElement;
  private carriedEl: HTMLElement;
  private pulseEl: HTMLElement;
  private lanternDotsEl: HTMLElement;
  private timerEl: HTMLElement;
  private scoreEl: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private promptEl: HTMLElement;
  private overlayEl: HTMLElement;
  private overlayTitleEl: HTMLElement;
  private overlaySubEl: HTMLElement;
  private overlayStatsEl: HTMLElement;
  private overlayBtnEl: HTMLButtonElement;

  private tuning: GameTuning;
  private isStartScreen = true;

  constructor(container: HTMLElement, tuning: GameTuning, callbacks: HudCallbacks) {
    this.tuning = tuning;

    const hudLayer = document.createElement("div");
    hudLayer.className = "hud-layer";
    hudLayer.innerHTML = `
      <div class="hud-top">
        <div class="panel">
          <div class="stat-row">
            <span class="label">Ngọn lửa</span>
            <div class="flames-bar" id="hud-flames"></div>
          </div>
          <div class="stat-row">
            <span class="label">Đom đóm</span>
            <span class="value-warm" id="hud-carried">0 / ${tuning.carry_capacity}</span>
          </div>
          <div class="stat-row">
            <span class="label">Tỏa sáng</span>
            <span id="hud-pulse" style="font-size:13px;color:#ffd27d;">Cần ${tuning.pulse_cost} ánh sáng</span>
          </div>
        </div>

        <div class="panel center-banner">
          <div class="night-title">Đêm 1 · Đảo Bến</div>
          <div class="lantern-dots" id="hud-lanterns"></div>
          <div class="timer-text" id="hud-timer">05:00</div>
        </div>

        <div class="panel">
          <div class="stat-row" style="justify-content:space-between;">
            <span class="label">Điểm</span>
            <span class="value-warm" id="hud-score">0</span>
          </div>
          <div class="hud-actions">
            <button class="hud-btn" id="btn-mute">Âm thanh: Bật</button>
            <button class="hud-btn" id="btn-restart">Chơi lại</button>
          </div>
        </div>
      </div>

      <div class="hud-bottom">
        <div class="context-prompt" id="hud-prompt"></div>
        <div class="controls-bar">
          <kbd>W A S D</kbd> Di chuyển ·
          <kbd>Space</kbd> Nhảy ·
          <kbd>E</kbd> Thắp đèn ·
          <kbd>Q</kbd> / <kbd>Shift</kbd> Tỏa sáng ·
          <kbd>Kéo chuột</kbd> / <kbd>Z C</kbd> Xoay camera
        </div>
      </div>
    `;
    container.appendChild(hudLayer);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="card">
        <h1 id="ov-title">Đảo Đèn Lồng</h1>
        <p class="subtitle" id="ov-sub">
          Đêm 1 — Đảo Bến. Hãy cùng Mây thu thập đom đóm, mang về thắp sáng cả ${tuning.lantern_count_night1} Đèn Lồng Lớn
          và dùng ánh sáng để xua đuổi Bóng Mực trong sương đen.
        </p>
        <div class="stats-grid" id="ov-stats" style="display:none;"></div>
        <button class="primary-btn" id="ov-btn">Bắt đầu Đêm 1</button>
      </div>
    `;
    container.appendChild(overlay);

    this.flamesEl = hudLayer.querySelector("#hud-flames")!;
    this.carriedEl = hudLayer.querySelector("#hud-carried")!;
    this.pulseEl = hudLayer.querySelector("#hud-pulse")!;
    this.lanternDotsEl = hudLayer.querySelector("#hud-lanterns")!;
    this.timerEl = hudLayer.querySelector("#hud-timer")!;
    this.scoreEl = hudLayer.querySelector("#hud-score")!;
    this.muteBtn = hudLayer.querySelector("#btn-mute")!;
    this.promptEl = hudLayer.querySelector("#hud-prompt")!;
    this.overlayEl = overlay;
    this.overlayTitleEl = overlay.querySelector("#ov-title")!;
    this.overlaySubEl = overlay.querySelector("#ov-sub")!;
    this.overlayStatsEl = overlay.querySelector("#ov-stats")!;
    this.overlayBtnEl = overlay.querySelector("#ov-btn")!;

    this.muteBtn.addEventListener("click", () => {
      this.muteBtn.blur();
      const muted = callbacks.onToggleMute();
      this.setMutedState(muted);
    });

    const restartBtn = hudLayer.querySelector<HTMLButtonElement>("#btn-restart")!;
    restartBtn.addEventListener("click", () => {
      restartBtn.blur();
      this.hideOverlay();
      callbacks.onRestart();
    });

    this.overlayBtnEl.addEventListener("click", () => {
      this.overlayBtnEl.blur();
      this.hideOverlay();
      if (this.isStartScreen) {
        this.isStartScreen = false;
        callbacks.onStart();
      } else {
        callbacks.onRestart();
      }
    });
  }

  setMutedState(muted: boolean): void {
    this.muteBtn.textContent = muted ? "Âm thanh: Tắt" : "Âm thanh: Bật";
  }

  hideOverlay(): void {
    this.overlayEl.classList.add("hidden");
  }

  update(snapshot: SnapshotRecord, pulseCooldownTicks: number): void {
    // Flames
    this.flamesEl.innerHTML = "";
    for (let i = 0; i < this.tuning.flames; i++) {
      const dot = document.createElement("span");
      dot.className = i < snapshot.player.flames ? "flame-dot" : "flame-dot lost";
      this.flamesEl.appendChild(dot);
    }

    // Carried motes
    this.carriedEl.textContent = `${snapshot.player.carried} / ${this.tuning.carry_capacity}`;

    // Pulse readiness
    if (pulseCooldownTicks > 0) {
      this.pulseEl.textContent = `Hồi chiêu ${(pulseCooldownTicks / 60).toFixed(1)}s`;
      this.pulseEl.style.color = "#a79ec0";
    } else if (snapshot.player.carried >= this.tuning.pulse_cost) {
      this.pulseEl.textContent = "Sẵn sàng (Q)";
      this.pulseEl.style.color = "#8ff5b5";
    } else {
      this.pulseEl.textContent = `Cần ${this.tuning.pulse_cost} đom đóm`;
      this.pulseEl.style.color = "#cbbba0";
    }

    // Lantern pips
    this.lanternDotsEl.innerHTML = "";
    for (const l of snapshot.lanterns) {
      const pip = document.createElement("span");
      pip.className = l.lit ? "lantern-pip lit" : "lantern-pip";
      pip.title = `${l.id}: ${l.lit ? "Đã thắp" : `${l.deposited}/${this.tuning.lantern_cost}`}`;
      this.lanternDotsEl.appendChild(pip);
    }

    // Timer MM:SS
    const secs = Math.max(0, Math.ceil(snapshot.time_left_s));
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    this.timerEl.textContent = `${mm}:${ss}`;

    // Score
    this.scoreEl.textContent = String(snapshot.score);

    // Context prompt when near an unlit lantern
    const [px, , pz] = snapshot.player.pos;
    let promptText = "";
    for (const l of snapshot.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(px - l.pos[0], pz - l.pos[2]);
      if (d <= this.tuning.interact_radius) {
        if (snapshot.player.carried > 0) {
          promptText = `Nhấn E để nạp ánh sáng vào Đèn ${l.id} (${l.deposited}/${this.tuning.lantern_cost})`;
        } else {
          promptText = `Đèn ${l.id} cần thêm ${this.tuning.lantern_cost - l.deposited} đom đóm`;
        }
        break;
      }
    }
    if (promptText) {
      this.promptEl.textContent = promptText;
      this.promptEl.classList.add("visible");
    } else {
      this.promptEl.classList.remove("visible");
    }
  }

  showEndScreen(
    snapshot: SnapshotRecord,
    reason: "all_lit" | "dawn" | "no_flames" | null
  ): void {
    this.isStartScreen = false;
    const won = snapshot.state === "won";
    const litCount = snapshot.lanterns.filter((l) => l.lit).length;

    this.overlayTitleEl.textContent = won
      ? "Ánh sáng trở lại Đảo Bến!"
      : reason === "dawn"
        ? "Bình minh đã lên..."
        : "Ngọn lửa đã tắt...";

    this.overlaySubEl.textContent = won
      ? `Cả ${snapshot.lanterns.length} Đèn Lồng Lớn đã bừng sáng, xua tan sương đen khỏi hòn đảo.`
      : reason === "dawn"
        ? "Đêm đã hết trước khi tất cả các Đèn Lồng Lớn được thắp sáng."
        : "Bóng Mực đã dập tắt ngọn lửa của Mây. Hãy thử lại nhé!";

    this.overlayStatsEl.style.display = "grid";
    this.overlayStatsEl.innerHTML = `
      <div class="stat-box"><div class="k">Tổng điểm</div><div class="v">${snapshot.score}</div></div>
      <div class="stat-box"><div class="k">Đèn đã thắp</div><div class="v">${litCount} / ${snapshot.lanterns.length}</div></div>
      <div class="stat-box"><div class="k">Thời gian còn lại</div><div class="v">${Math.floor(snapshot.time_left_s)}s</div></div>
      <div class="stat-box"><div class="k">Ngọn lửa còn lại</div><div class="v">${snapshot.player.flames}</div></div>
    `;
    this.overlayBtnEl.textContent = "Chơi lại Đêm 1";
    this.overlayEl.classList.remove("hidden");
  }
}
