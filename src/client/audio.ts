/**
 * Procedural Web Audio soundscape for Đảo Đèn Lồng.
 * Client-only creative feature — zero impact on headless simulation.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
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
    if (!ctx) return;
    const now = ctx.currentTime + delayS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + durationS);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationS);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationS + 0.03);
  }

  /** Pentatonic chime rising with carried firefly count. */
  playMotePickup(carried: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const idx = Math.max(0, Math.min(scale.length - 1, carried - 1));
    this.playTone(scale[idx], 0.24, "sine", 0.14);
    this.playTone(scale[idx] * 1.5, 0.18, "triangle", 0.05, 0.04);
  }

  playDeposit(): void {
    this.playTone(440, 0.22, "triangle", 0.12);
    this.playTone(659.25, 0.26, "sine", 0.1, 0.06);
  }

  playLanternLit(): void {
    this.playTone(261.63, 0.75, "sine", 0.16);
    this.playTone(392.0, 0.7, "triangle", 0.12, 0.07);
    this.playTone(523.25, 0.8, "sine", 0.14, 0.14);
    this.playTone(783.99, 0.85, "sine", 0.09, 0.22);
  }

  playPulse(): void {
    this.playTone(340, 0.45, "sine", 0.16, 0, 720);
    this.playTone(680, 0.38, "triangle", 0.08, 0.03, 980);
  }

  playHit(): void {
    this.playTone(170, 0.32, "sawtooth", 0.11, 0, 72);
    this.playTone(110, 0.35, "sine", 0.15, 0, 58);
  }

  playWin(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, i) => {
      this.playTone(n, 0.55, "sine", 0.13, i * 0.1);
    });
  }

  playLose(): void {
    const notes = [329.63, 293.66, 246.94, 196.0];
    notes.forEach((n, i) => {
      this.playTone(n, 0.45, "triangle", 0.11, i * 0.14);
    });
  }
}
