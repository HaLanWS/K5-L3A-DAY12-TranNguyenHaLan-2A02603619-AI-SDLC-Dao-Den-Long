/**
 * Procedural Web Audio Engine (Night BGM + full SFX suite per Ticket-02).
 * Client-only — zero impact on headless simulation.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private volume = 0.7;
  private muted = false;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime
      );
    }
  }

  getVolume(): number {
    return this.volume;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.setVolume(this.volume);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || this.volume <= 0) return null;
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  startNightBgm(): void {
    if (this.bgmTimer !== null) return;
    const notes = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
    let step = 0;
    this.bgmTimer = window.setInterval(() => {
      const freq = notes[step % notes.length];
      step += 1;
      this.playTone(freq * 0.5, 1.4, "sine", 0.035);
      if (step % 2 === 0) {
        this.playTone(freq, 0.9, "triangle", 0.02, 0.15);
      }
    }, 1500);
  }

  stopNightBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private playTone(
    freq: number,
    durationS: number,
    type: OscillatorType,
    volume: number,
    delayS = 0,
    endFreq?: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime + delayS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + durationS);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationS);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationS + 0.03);
  }

  playMotePickup(carried: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const f = scale[Math.min(scale.length - 1, Math.max(0, carried - 1))];
    this.playTone(f, 0.22, "sine", 0.14);
  }

  playCharmPickup(): void {
    this.playTone(587.33, 0.22, "triangle", 0.16);
    this.playTone(880.0, 0.3, "sine", 0.14, 0.07);
    this.playTone(1174.66, 0.35, "sine", 0.12, 0.14);
  }

  playDeposit(): void {
    this.playTone(440, 0.2, "triangle", 0.12);
    this.playTone(659.25, 0.24, "sine", 0.1, 0.05);
  }

  playLanternLit(): void {
    this.playTone(261.63, 0.7, "sine", 0.18);
    this.playTone(392.0, 0.65, "triangle", 0.13, 0.07);
    this.playTone(523.25, 0.75, "sine", 0.15, 0.14);
  }

  playPulse(): void {
    this.playTone(340, 0.42, "sine", 0.17, 0, 740);
    this.playTone(680, 0.36, "triangle", 0.09, 0.03, 1020);
  }

  playJump(): void {
    this.playTone(260, 0.16, "sine", 0.1, 0, 520);
  }

  playDash(): void {
    this.playTone(620, 0.18, "triangle", 0.12, 0, 260);
  }

  playHit(): void {
    this.playTone(170, 0.3, "sawtooth", 0.12, 0, 70);
    this.playTone(105, 0.34, "sine", 0.16, 0, 52);
  }

  playShadeSpawn(): void {
    this.playTone(145, 0.45, "sawtooth", 0.08, 0, 95);
    this.playTone(210, 0.35, "triangle", 0.06, 0.08, 120);
  }

  playWindWarning(): void {
    this.playTone(320, 0.55, "sine", 0.07, 0, 480);
  }

  playCountdownTick(): void {
    this.playTone(880, 0.09, "square", 0.07);
  }

  playWin(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((n, i) => {
      this.playTone(n, 0.55, "sine", 0.14, i * 0.1);
    });
  }

  playLose(): void {
    [329.63, 293.66, 246.94, 196.0].forEach((n, i) => {
      this.playTone(n, 0.45, "triangle", 0.12, i * 0.14);
    });
  }
}
