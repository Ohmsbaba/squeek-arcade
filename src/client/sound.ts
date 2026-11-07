"use client";
/**
 * Every sound is synthesised on the spot, so there's nothing to download. Quiet by default,
 * rate-limited where it could turn into a machine gun, and mute is remembered.
 */
const MUTE_KEY = "sa_muted";

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wheel: { osc: OscillatorNode; gain: GainNode; noise: AudioBufferSourceNode; noiseGain: GainNode; filter: BiquadFilterNode } | null = null;
  private lastPeg = 0;
  muted = false;
  private listeners = new Set<() => void>();

  init() {
    this.muted = localStorage.getItem(MUTE_KEY) === "1";
    this.emit();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  private emit() {
    this.listeners.forEach((f) => f());
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
    this.emit();
  }

  private ready(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      const limiter = this.ctx.createDynamicsCompressor();
      this.master.connect(limiter).connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; to?: number } = {}) {
    const ctx = this.ready();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + (opts.at ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.vol ?? 0.2, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, freq: number, vol: number, at = 0) {
    const ctx = this.ready();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private buffer: AudioBuffer | null = null;
  private noiseBuffer(ctx: AudioContext) {
    if (this.buffer) return this.buffer;
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this.buffer = b);
  }

  click() { this.tone(520, 0.05, { type: "square", vol: 0.05, to: 380 }); }
  tick() { this.tone(880, 0.03, { type: "triangle", vol: 0.05 }); }
  countdown(final: boolean) { this.tone(final ? 990 : 660, final ? 0.22 : 0.12, { type: "triangle", vol: 0.12 }); }
  drop() {
    this.tone(320, 0.16, { type: "sine", vol: 0.18, to: 150 });
    this.noiseBurst(0.08, 1800, 0.06);
  }
  /** Row sets pitch: the fall plays a little descending tune. */
  peg(row: number, impact: number) {
    const now = performance.now();
    if (now - this.lastPeg < 32) return;
    this.lastPeg = now;
    const base = 1250 - row * 62;
    this.tone(base + Math.random() * 30, 0.06, { type: "triangle", vol: Math.min(0.14, 0.035 + impact * 0.008) });
  }
  /** One token of several settling into its slot. Higher pays ring higher. */
  ballLand(multHundredths: number) {
    const m = Math.max(0.2, multHundredths / 100);
    this.tone(330 * Math.min(4, 1 + Math.log2(1 + m) * 0.6), 0.14, { type: "triangle", vol: 0.1 });
  }
  /** Two tokens knocking together. */
  knock() {
    const now = performance.now();
    if (now - this.lastPeg < 60) return;
    this.lastPeg = now;
    this.tone(560 + Math.random() * 90, 0.04, { type: "square", vol: 0.03 });
  }
  landing(multHundredths: number) {
    const big = multHundredths >= 200;
    this.noiseBurst(0.1, 500, 0.12);
    this.tone(big ? 392 : 220, 0.18, { type: "triangle", vol: 0.16 });
    if (multHundredths >= 100) this.tone(big ? 587 : 330, 0.2, { type: "triangle", vol: 0.13, at: 0.08 });
    if (big) {
      this.tone(784, 0.24, { type: "triangle", vol: 0.13, at: 0.16 });
      this.tone(1175, 0.42, { type: "sine", vol: 0.12, at: 0.26 });
    }
    if (multHundredths >= 1000) [1319, 1568, 1976, 2349].forEach((f, i) => this.tone(f, 0.3, { type: "sine", vol: 0.09, at: 0.4 + i * 0.07 }));
  }
  cashout() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, { type: "triangle", vol: 0.13, at: i * 0.055 }));
    [0, 0.07, 0.14].forEach((at) => this.noiseBurst(0.05, 5200, 0.04, at));
  }
  wheelStop() {
    this.stopWheel();
    this.tone(180, 0.55, { type: "sawtooth", vol: 0.12, to: 42 });
    this.noiseBurst(0.42, 3200, 0.1);
    this.tone(95, 0.3, { type: "sine", vol: 0.2, at: 0.3, to: 60 });
  }
  achievement() {
    [659, 880, 1109, 1319].forEach((f, i) => this.tone(f, 0.32, { type: "sine", vol: 0.1, at: i * 0.09 }));
  }

  /** The wheel's running hum. Call setWheel(intensity 0..1) every so often while it turns. */
  startWheel() {
    const ctx = this.ready();
    if (!ctx || this.wheel) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 42;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 340;
    osc.connect(lowpass).connect(gain).connect(this.master!);
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx);
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(filter).connect(noiseGain).connect(this.master!);
    osc.start();
    noise.start();
    this.wheel = { osc, gain, noise, noiseGain, filter };
  }
  setWheel(intensity: number) {
    if (!this.wheel || !this.ctx) return;
    const t = this.ctx.currentTime;
    const i = Math.max(0, Math.min(1, intensity));
    this.wheel.osc.frequency.setTargetAtTime(42 + i * 190, t, 0.08);
    this.wheel.gain.gain.setTargetAtTime(this.muted ? 0 : 0.035 + i * 0.05, t, 0.1);
    this.wheel.filter.frequency.setTargetAtTime(800 + i * 2400, t, 0.1);
    this.wheel.noiseGain.gain.setTargetAtTime(this.muted ? 0 : 0.012 + i * 0.03, t, 0.1);
  }
  stopWheel() {
    const w = this.wheel;
    if (!w || !this.ctx) return;
    this.wheel = null;
    const t = this.ctx.currentTime;
    w.gain.gain.setTargetAtTime(0, t, 0.05);
    w.noiseGain.gain.setTargetAtTime(0, t, 0.05);
    w.osc.stop(t + 0.4);
    w.noise.stop(t + 0.4);
  }
}

export const sound = new Sound();
