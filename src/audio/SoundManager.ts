/**
 * SoundManager — krátké syntetizované zvuky přes Web Audio API (žádné asset soubory).
 * Prezentační vrstva. Prohlížeče blokují zvuk do první interakce, takže AudioContext
 * resumujeme na první gesto uživatele.
 */
type AudioCtor = typeof AudioContext;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7; // master hlasitost 0..1
  private readonly last: Record<string, number> = {};

  /** Throttle: vrátí false, pokud daný zvuk hrál nedávno (anti-spam u botů). */
  private gate(key: string, gapMs: number): boolean {
    const now = performance.now();
    if ((this.last[key] ?? 0) + gapMs > now) return false;
    this.last[key] = now;
    return true;
  }

  constructor() {
    const resume = (): void => {
      this.ensureCtx();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Nastaví master hlasitost (0..1). */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
  }

  get masterVolume(): number {
    return this.volume;
  }

  private ensureCtx(): void {
    if (this.ctx) return;
    const Ctor: AudioCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (Ctor) {
      try {
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
      }
    }
  }

  /** Jeden krátký tón s obálkou. */
  private blip(freq: number, dur: number, type: OscillatorType = 'sine', peak = 0.08): void {
    if (!this.enabled || this.volume <= 0) return;
    this.ensureCtx();
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak * this.volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /** Sekvence tónů (arpeggio). */
  private chime(freqs: number[], step = 0.06, type: OscillatorType = 'sine', peak = 0.07): void {
    if (!this.enabled) return;
    freqs.forEach((f, i) => window.setTimeout(() => this.blip(f, 0.18, type, peak), i * step * 1000));
  }

  // ── Konkrétní zvuky (vysokofrekvenční mají throttle kvůli botům) ──
  like(): void {
    if (this.gate('like', 70)) this.blip(660, 0.12, 'sine', 0.07);
  }
  swipe(): void {
    if (this.gate('swipe', 70)) this.blip(300, 0.07, 'triangle', 0.05);
  }
  comment(): void {
    if (this.gate('comment', 90)) this.blip(520, 0.1, 'square', 0.04);
  }
  goodComment(): void {
    this.chime([523, 659, 784, 1047], 0.07, 'sine', 0.08); // veselý vzestup
  }
  badComment(): void {
    this.chime([330, 262, 196], 0.1, 'sawtooth', 0.05); // sestup, drsnější
  }
  bubble(): void {
    this.chime([784, 1175], 0.05, 'sine', 0.09); // „pop"
  }
  upgrade(): void {
    this.chime([392, 523, 659], 0.06, 'triangle', 0.07);
  }
  gem(): void {
    this.chime([659, 880, 1175, 1568], 0.06, 'sine', 0.1); // třpyt
  }
  reactionTick(up: boolean): void {
    if (this.gate('tick', 55)) this.blip(up ? 880 : 280, 0.04, 'sine', 0.025); // cvak naskakujících reakcí
  }
}
