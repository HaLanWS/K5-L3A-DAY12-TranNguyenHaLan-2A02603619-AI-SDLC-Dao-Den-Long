import type { NightMapConfig } from "../core/maps.js";
import type { GameTuning, SnapshotRecord } from "../core/types.js";

export interface UserSettings {
  volume: number;
  mouseSensitivity: number;
}

export interface HudCallbacks {
  onPlayCampaign: () => void;
  onStartNight: () => void;
  onResume: () => void;
  onRestartNight: () => void;
  onNextNight: () => void;
  onMainMenu: () => void;
  onSettingsChange: (settings: UserSettings) => void;
}

export class GameHUD {
  private flamesEl: HTMLElement;
  private nightTitleEl: HTMLElement;
  private timerEl: HTMLElement;
  private windBadgeEl: HTMLElement;
  private lanternSummaryEl: HTMLElement;
  private scoreEl: HTMLElement;
  private moteBarEl: HTMLElement;
  private promptEl: HTMLElement;
  private dashBoxEl: HTMLElement;
  private dashCdEl: HTMLElement;
  private pulseBoxEl: HTMLElement;
  private pulseCdEl: HTMLElement;
  private arrowEl: HTMLElement;
  private overlayEl: HTMLElement;
  private cardEl: HTMLElement;

  private tuning: GameTuning;
  private callbacks: HudCallbacks;
  private settings: UserSettings;

  constructor(
    container: HTMLElement,
    tuning: GameTuning,
    settings: UserSettings,
    callbacks: HudCallbacks
  ) {
    this.tuning = tuning;
    this.settings = { ...settings };
    this.callbacks = callbacks;

    const hudLayer = document.createElement("div");
    hudLayer.className = "hud-layer";
    hudLayer.innerHTML = `
      <div class="hud-top">
        <div class="panel">
          <div class="label">Ngọn Lửa</div>
          <div class="flames-bar" id="hud-flames"></div>
        </div>

        <div class="panel center-banner">
          <div class="night-title" id="hud-night-title">Đêm 1 · Đảo Bến</div>
          <div class="timer-text" id="hud-timer">05:00</div>
          <div class="wind-badge" id="hud-wind"></div>
        </div>

        <div class="panel right-stats">
          <div class="lantern-summary" id="hud-lanterns">Đèn: 0 / 5</div>
          <div class="label">Điểm</div>
          <div class="value-gold" id="hud-score">0</div>
        </div>
      </div>

      <div class="hud-bottom">
        <div class="bottom-spacer"></div>
        <div class="bottom-center">
          <div class="context-prompt" id="hud-prompt"></div>
          <div class="mote-bar" id="hud-motes"></div>
        </div>
        <div class="abilities-panel">
          <div class="ability-box" id="box-dash">
            <div class="ability-key">SHIFT</div>
            <div class="ability-name">Lướt</div>
            <div class="ability-cd" id="cd-dash">Sẵn sàng</div>
          </div>
          <div class="ability-box" id="box-pulse">
            <div class="ability-key">Q</div>
            <div class="ability-name">Tỏa Sáng</div>
            <div class="ability-cd" id="cd-pulse">Cần 3</div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(hudLayer);

    const arrow = document.createElement("div");
    arrow.className = "offscreen-arrow";
    arrow.textContent = "➤";
    container.appendChild(arrow);
    this.arrowEl = arrow;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `<div class="card" id="ov-card"></div>`;
    container.appendChild(overlay);

    this.flamesEl = hudLayer.querySelector("#hud-flames")!;
    this.nightTitleEl = hudLayer.querySelector("#hud-night-title")!;
    this.timerEl = hudLayer.querySelector("#hud-timer")!;
    this.windBadgeEl = hudLayer.querySelector("#hud-wind")!;
    this.lanternSummaryEl = hudLayer.querySelector("#hud-lanterns")!;
    this.scoreEl = hudLayer.querySelector("#hud-score")!;
    this.moteBarEl = hudLayer.querySelector("#hud-motes")!;
    this.promptEl = hudLayer.querySelector("#hud-prompt")!;
    this.dashBoxEl = hudLayer.querySelector("#box-dash")!;
    this.dashCdEl = hudLayer.querySelector("#cd-dash")!;
    this.pulseBoxEl = hudLayer.querySelector("#box-pulse")!;
    this.pulseCdEl = hudLayer.querySelector("#cd-pulse")!;
    this.overlayEl = overlay;
    this.cardEl = overlay.querySelector("#ov-card")!;
  }

  hideOverlay(): void {
    this.overlayEl.classList.add("hidden");
  }

  showMainMenu(): void {
    this.overlayEl.classList.remove("hidden");
    this.cardEl.innerHTML = `
      <h1>Đảo Đèn Lồng</h1>
      <p class="subtitle">
        Cùng Mây vượt qua 3 Đêm trên Đảo Bến, Đảo Cau và Đảo Chuông — thu thập đom đóm,
        thắp sáng Đèn Lồng Lớn, né Bóng Mực và Gió Lạc để đón Bình Minh.
      </p>
      <div class="btn-stack">
        <button class="primary-btn" id="btn-play">Chơi mới (3 Đêm)</button>
        <button class="secondary-btn" id="btn-settings">Cài đặt</button>
      </div>
    `;
    this.cardEl.querySelector<HTMLButtonElement>("#btn-play")!.onclick = (e) => {
      (e.target as HTMLElement).blur();
      this.callbacks.onPlayCampaign();
    };
    this.cardEl.querySelector<HTMLButtonElement>("#btn-settings")!.onclick = () => {
      this.showSettings(() => this.showMainMenu());
    };
  }

  showNightIntro(map: NightMapConfig): void {
    this.overlayEl.classList.remove("hidden");
    this.cardEl.innerHTML = `
      <h1>Đêm ${map.night} — ${map.name}</h1>
      <div class="quote">${map.introQuote}</div>
      <p class="subtitle">
        Mục tiêu: thắp sáng ${map.lanterns.length} Đèn Lồng Lớn.<br/>
        <b>WASD</b> Di chuyển · <b>Space</b> Nhảy · <b>Shift</b> Lướt · <b>E</b> Nạp ánh sáng · <b>Q</b> Tỏa Sáng · <b>Esc/P</b> Tạm dừng
      </p>
      <button class="primary-btn" id="btn-go">Bắt đầu Đêm ${map.night}</button>
    `;
    this.cardEl.querySelector<HTMLButtonElement>("#btn-go")!.onclick = (e) => {
      (e.target as HTMLElement).blur();
      this.hideOverlay();
      this.callbacks.onStartNight();
    };
  }

  showPauseMenu(): void {
    this.overlayEl.classList.remove("hidden");
    this.cardEl.innerHTML = `
      <h1>Tạm dừng</h1>
      <div class="btn-stack">
        <button class="primary-btn" id="btn-resume">Tiếp tục</button>
        <button class="secondary-btn" id="btn-restart">Chơi lại Đêm</button>
        <button class="secondary-btn" id="btn-settings">Cài đặt</button>
        <button class="secondary-btn" id="btn-menu">Về menu</button>
      </div>
    `;
    this.cardEl.querySelector<HTMLButtonElement>("#btn-resume")!.onclick = (e) => {
      (e.target as HTMLElement).blur();
      this.hideOverlay();
      this.callbacks.onResume();
    };
    this.cardEl.querySelector<HTMLButtonElement>("#btn-restart")!.onclick = (e) => {
      (e.target as HTMLElement).blur();
      this.hideOverlay();
      this.callbacks.onRestartNight();
    };
    this.cardEl.querySelector<HTMLButtonElement>("#btn-settings")!.onclick = () => {
      this.showSettings(() => this.showPauseMenu());
    };
    this.cardEl.querySelector<HTMLButtonElement>("#btn-menu")!.onclick = () => {
      this.callbacks.onMainMenu();
    };
  }

  showSettings(onBack: () => void): void {
    this.overlayEl.classList.remove("hidden");
    this.cardEl.innerHTML = `
      <h1>Cài đặt</h1>
      <div class="setting-row">
        <label for="rng-vol">Âm lượng (<span id="val-vol">${Math.round(this.settings.volume * 100)}%</span>)</label>
        <input id="rng-vol" type="range" min="0" max="100" value="${Math.round(this.settings.volume * 100)}" />
      </div>
      <div class="setting-row">
        <label for="rng-sens">Độ nhạy chuột (<span id="val-sens">${this.settings.mouseSensitivity.toFixed(1)}</span>)</label>
        <input id="rng-sens" type="range" min="2" max="20" value="${Math.round(this.settings.mouseSensitivity * 10)}" />
      </div>
      <div class="btn-stack" style="margin-top:18px;">
        <button class="primary-btn" id="btn-back">Quay lại</button>
      </div>
    `;
    const volInput = this.cardEl.querySelector<HTMLInputElement>("#rng-vol")!;
    const sensInput = this.cardEl.querySelector<HTMLInputElement>("#rng-sens")!;
    volInput.oninput = () => {
      this.settings.volume = Number(volInput.value) / 100;
      this.cardEl.querySelector("#val-vol")!.textContent = `${volInput.value}%`;
      this.callbacks.onSettingsChange({ ...this.settings });
    };
    sensInput.oninput = () => {
      this.settings.mouseSensitivity = Number(sensInput.value) / 10;
      this.cardEl.querySelector("#val-sens")!.textContent = this.settings.mouseSensitivity.toFixed(1);
      this.callbacks.onSettingsChange({ ...this.settings });
    };
    this.cardEl.querySelector<HTMLButtonElement>("#btn-back")!.onclick = onBack;
  }

  showNightResult(
    snapshot: SnapshotRecord,
    totalCampaignScore: number,
    reason: "all_lit" | "dawn" | "no_flames" | null
  ): void {
    this.overlayEl.classList.remove("hidden");
    const won = snapshot.state === "won";
    const isFinalDawn = won && snapshot.night === 3;
    const litCount = snapshot.lanterns.filter((l) => l.lit).length;

    const title = isFinalDawn
      ? "Bình Minh Trên Ba Hòn Đảo!"
      : won
        ? `Hoàn thành Đêm ${snapshot.night}!`
        : reason === "dawn"
          ? "Bình minh đã lên quá sớm..."
          : "Ngọn lửa đã tắt...";

    const subtitle = isFinalDawn
      ? "Cả ba hòn đảo đã rực sáng. Mây đã đưa bình minh ấm áp trở lại biển mây!"
      : won
        ? "Tất cả Đèn Lồng Lớn của hòn đảo này đã sáng rực. Sẵn sàng sang hòn đảo tiếp theo!"
        : "Đừng nản lòng — hãy thử lại Đêm này nhé!";

    this.cardEl.innerHTML = `
      <h1>${title}</h1>
      <p class="subtitle">${subtitle}</p>
      <div class="stats-grid">
        <div class="stat-box"><div class="k">Điểm Đêm ${snapshot.night}</div><div class="v">${snapshot.score}</div></div>
        <div class="stat-box"><div class="k">Tổng điểm</div><div class="v">${totalCampaignScore}</div></div>
        <div class="stat-box"><div class="k">Đèn đã thắp</div><div class="v">${litCount} / ${snapshot.lanterns.length}</div></div>
        <div class="stat-box"><div class="k">Ngọn Lửa</div><div class="v">${snapshot.player.flames}</div></div>
      </div>
      <div class="btn-row">
        ${
          isFinalDawn
            ? `<button class="primary-btn" id="btn-menu">Về Menu Chính</button>`
            : won
              ? `<button class="primary-btn" id="btn-next">Sang Đêm ${snapshot.night + 1}</button>`
              : `<button class="primary-btn" id="btn-retry">Chơi lại Đêm ${snapshot.night}</button>`
        }
        ${!isFinalDawn ? `<button class="secondary-btn" id="btn-menu">Về Menu</button>` : ""}
      </div>
    `;

    this.cardEl.querySelector<HTMLButtonElement>("#btn-next")?.addEventListener("click", (e) => {
      (e.target as HTMLElement).blur();
      this.callbacks.onNextNight();
    });
    this.cardEl.querySelector<HTMLButtonElement>("#btn-retry")?.addEventListener("click", (e) => {
      (e.target as HTMLElement).blur();
      this.hideOverlay();
      this.callbacks.onRestartNight();
    });
    this.cardEl.querySelector<HTMLButtonElement>("#btn-menu")?.addEventListener("click", () => {
      this.callbacks.onMainMenu();
    });
  }

  update(
    snapshot: SnapshotRecord,
    map: NightMapConfig,
    windWarning: boolean,
    arrowInfo: { x: number; y: number; angleDeg: number; offscreen: boolean } | null
  ): void {
    this.nightTitleEl.textContent = `Đêm ${map.night} · ${map.name}`;

    // Flames
    this.flamesEl.innerHTML = "";
    for (let i = 0; i < this.tuning.flames; i++) {
      const d = document.createElement("span");
      d.className = i < snapshot.player.flames ? "flame-dot" : "flame-dot lost";
      this.flamesEl.appendChild(d);
    }

    // Timer mm:ss, red + blinking when <= 30s
    const secs = Math.max(0, Math.ceil(snapshot.time_left_s));
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    this.timerEl.textContent = `${mm}:${ss}`;
    this.timerEl.className = secs <= 30 ? "timer-text danger" : "timer-text";

    // Wind status
    if (snapshot.wind.active) {
      this.windBadgeEl.textContent = `Gió mạnh đang thổi (${Math.round(snapshot.wind.dir_deg)}°)`;
      this.windBadgeEl.className = "wind-badge active";
    } else if (windWarning) {
      this.windBadgeEl.textContent = "Cảnh báo: Gió mạnh sắp thổi!";
      this.windBadgeEl.className = "wind-badge warn";
    } else if (snapshot.player.charm_s > 0) {
      this.windBadgeEl.textContent = `Bùa Gió: ${snapshot.player.charm_s.toFixed(1)}s`;
      this.windBadgeEl.className = "wind-badge warn";
    } else {
      this.windBadgeEl.textContent = "";
      this.windBadgeEl.className = "wind-badge";
    }

    // Lanterns & Score
    const litCount = snapshot.lanterns.filter((l) => l.lit).length;
    this.lanternSummaryEl.textContent = `Đèn: ${litCount} / ${snapshot.lanterns.length}`;
    this.scoreEl.textContent = String(snapshot.score);

    // 10-slot mote bar
    this.moteBarEl.innerHTML = "";
    for (let i = 0; i < this.tuning.carry_capacity; i++) {
      const slot = document.createElement("span");
      slot.className = i < snapshot.player.carried ? "mote-slot filled" : "mote-slot";
      this.moteBarEl.appendChild(slot);
    }

    // Dash & Pulse ability icons
    const charmActive = snapshot.player.charm_s > 0;
    if (charmActive) {
      this.dashBoxEl.className = "ability-box charm-active";
      this.dashCdEl.textContent = "Bùa Gió!";
    } else if (snapshot.player.dash_cd_s > 0) {
      this.dashBoxEl.className = "ability-box";
      this.dashCdEl.textContent = `${snapshot.player.dash_cd_s.toFixed(1)}s`;
    } else {
      this.dashBoxEl.className = "ability-box ready";
      this.dashCdEl.textContent = "Sẵn sàng";
    }

    if (snapshot.player.pulse_cd_s > 0) {
      this.pulseBoxEl.className = "ability-box";
      this.pulseCdEl.textContent = `${snapshot.player.pulse_cd_s.toFixed(1)}s`;
    } else if (snapshot.player.carried >= this.tuning.pulse_cost) {
      this.pulseBoxEl.className = "ability-box ready";
      this.pulseCdEl.textContent = "Sẵn sàng";
    } else {
      this.pulseBoxEl.className = "ability-box";
      this.pulseCdEl.textContent = `Cần ${this.tuning.pulse_cost}`;
    }

    // Context prompt "E — Nạp ánh sáng (x/10)"
    const [px, , pz] = snapshot.player.pos;
    let promptText = "";
    for (const l of snapshot.lanterns) {
      if (l.lit) continue;
      if (Math.hypot(px - l.pos[0], pz - l.pos[2]) <= this.tuning.interact_radius) {
        promptText = `E — Nạp ánh sáng (${l.deposited}/${this.tuning.lantern_cost})`;
        break;
      }
    }
    if (promptText) {
      this.promptEl.textContent = promptText;
      this.promptEl.classList.add("visible");
    } else {
      this.promptEl.classList.remove("visible");
    }

    // Off-screen nearest unlit lantern arrow
    if (arrowInfo && arrowInfo.offscreen) {
      this.arrowEl.style.display = "flex";
      this.arrowEl.style.left = `${arrowInfo.x}px`;
      this.arrowEl.style.top = `${arrowInfo.y}px`;
      this.arrowEl.style.transform = `translate(-50%, -50%) rotate(${arrowInfo.angleDeg}deg)`;
    } else {
      this.arrowEl.style.display = "none";
    }
  }
}
