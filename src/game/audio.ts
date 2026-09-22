/**
 * Tiny synthesized sound kit (Web Audio) — no audio files to ship.
 * The context is created lazily on the first user gesture (browser autoplay rules).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.3, delay = 0, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, filterType: BiquadFilterType, freq: number, vol = 0.3, delay = 0, q = 1, sweepTo?: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  bounce(strength = 1) {
    this.tone(120, 0.12, "sine", 0.35 * strength, 0, 60);
    this.noise(0.05, "lowpass", 900, 0.12 * strength);
  }

  swish() {
    this.noise(0.38, "bandpass", 5200, 0.35, 0, 0.8, 1800);
  }

  rim() {
    this.tone(520, 0.35, "triangle", 0.22);
    this.tone(780, 0.28, "square", 0.05);
    this.tone(1340, 0.18, "sine", 0.08);
  }

  badge() {
    [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.18, i * 0.07));
  }

  release() {
    this.noise(0.12, "highpass", 2400, 0.08);
  }

  crowd(big = false) {
    this.noise(big ? 1.6 : 1.0, "bandpass", 900, big ? 0.32 : 0.2, 0, 0.5, 600);
    this.noise(big ? 1.2 : 0.8, "bandpass", 2200, big ? 0.14 : 0.08, 0.05, 0.7);
  }

  groan() {
    this.noise(0.9, "lowpass", 600, 0.18, 0, 0.6, 220);
  }

  tick() {
    this.tone(1400, 0.05, "square", 0.06);
  }

  buzzer() {
    this.tone(196, 0.9, "sawtooth", 0.16);
    this.tone(233, 0.9, "square", 0.07);
  }

  startCharge() {
    if (!this.ctx || !this.master) return;
    this.stopCharge();
    this.chargeOsc = this.ctx.createOscillator();
    this.chargeGain = this.ctx.createGain();
    this.chargeOsc.type = "triangle";
    this.chargeOsc.frequency.value = 220;
    this.chargeGain.gain.value = 0.0001;
    this.chargeGain.gain.exponentialRampToValueAtTime(0.06, this.ctx.currentTime + 0.05);
    this.chargeOsc.connect(this.chargeGain).connect(this.master);
    this.chargeOsc.start();
  }

  updateCharge(charge: number, inSweet: boolean) {
    if (!this.ctx || !this.chargeOsc || !this.chargeGain) return;
    this.chargeOsc.frequency.setTargetAtTime(220 + charge * 520, this.ctx.currentTime, 0.02);
    this.chargeGain.gain.setTargetAtTime(inSweet ? 0.1 : 0.05, this.ctx.currentTime, 0.03);
  }

  stopCharge() {
    if (!this.ctx || !this.chargeOsc || !this.chargeGain) return;
    const osc = this.chargeOsc;
    this.chargeGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.02);
    osc.stop(this.ctx.currentTime + 0.1);
    this.chargeOsc = null;
    this.chargeGain = null;
  }

  dispose() {
    this.stopCharge();
    void this.ctx?.close();
    this.ctx = null;
  }
}
