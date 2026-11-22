// Solmar — all sound is synthesized with WebAudio. No audio files, no
// network: engine hum, sirens, gunfire, punches, crashes, pickups and jingles.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.noiseBuf = null;
  }

  // Call from a user gesture (the Start button). Safe to call twice.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Shared noise buffer for shots and crashes.
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Engine: two detuned saws through a lowpass, gain follows the throttle.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    // Siren: a sine whose pitch wobbles between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.9;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Called every frame: speed01 0..1, throttle 0..1, driving bool.
  engine(speed01, throttle, driving) {
    if (!this.ctx) return;
    const target = driving ? 0.05 + speed01 * 0.1 + throttle * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    const freq = 52 + speed01 * 130 + throttle * 30;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 0.5, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + speed01 * 900, this.ctx.currentTime, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shot() { this.noise(0.14, 0.5, 2400); this.blip(180, 0.1, 'square', 0.15); }
  punch() { this.blip(150, 0.12, 'sine', 0.4); this.noise(0.08, 0.2, 500); }
  crash(intensity) { this.noise(0.35, Math.min(0.6, 0.2 + intensity * 0.02), 900); }
  pickup() { this.blip(880, 0.1, 'sine', 0.2); this.blip(1318, 0.16, 'sine', 0.2, 0.09); }
  click() { this.blip(660, 0.05, 'square', 0.1); }
  busted() { this.blip(392, 0.25, 'sawtooth', 0.2); this.blip(311, 0.3, 'sawtooth', 0.2, 0.22); this.blip(233, 0.5, 'sawtooth', 0.2, 0.44); }
  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.blip(n, 0.22, 'triangle', 0.22, i * 0.11));
  }
  missionFail() { this.blip(330, 0.3, 'sawtooth', 0.18); this.blip(220, 0.45, 'sawtooth', 0.18, 0.25); }
}
