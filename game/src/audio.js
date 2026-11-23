// Solmar — WebAudio synth sound effects. No audio files: every sound is
// built from oscillators and filtered noise at run time.
export function initAudio(G) {
  const A = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    sirenOn: false,
    ready: false,
  };

  function ensure() {
    if (A.ready) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.35;
      A.master.connect(A.ctx.destination);
      // Engine hum: a low sawtooth whose pitch follows speed.
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 55;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      const lp = A.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      A.engineOsc.connect(lp);
      lp.connect(A.engineGain);
      A.engineGain.connect(A.master);
      A.engineOsc.start();
      // Police siren: a sine that wails between two tones.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'sine';
      A.sirenOsc.frequency.value = 720;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenLfo = A.ctx.createOscillator();
      A.sirenLfo.type = 'square';
      A.sirenLfo.frequency.value = 0.55;
      const lfoGain = A.ctx.createGain();
      lfoGain.gain.value = 180;
      A.sirenLfo.connect(lfoGain);
      lfoGain.connect(A.sirenOsc.frequency);
      A.sirenOsc.connect(A.sirenGain);
      A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      A.sirenLfo.start();
      A.ready = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(A.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ensure()) return;
    const t = A.ctx.currentTime;
    const len = Math.floor(A.ctx.sampleRate * dur);
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq || 1800;
    f.Q.value = 0.8;
    const g = A.ctx.createGain();
    g.gain.value = vol || 0.4;
    src.connect(f);
    f.connect(g);
    g.connect(A.master);
    src.start(t);
  }

  G.audio = {
    unlock() {
      ensure();
      if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
    },
    engine(speed01, driving) {
      if (!A.ready) return;
      const target = driving ? 0.05 + speed01 * 0.11 : 0;
      A.engineGain.gain.setTargetAtTime(target, A.ctx.currentTime, 0.1);
      A.engineOsc.frequency.setTargetAtTime(52 + speed01 * 95, A.ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!A.ready) return;
      if (on === A.sirenOn) return;
      A.sirenOn = on;
      A.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, A.ctx.currentTime, 0.3);
    },
    shot(kind) {
      if (kind === 'shotgun') noiseBurst(0.22, 0.55, 900);
      else if (kind === 'smg') noiseBurst(0.07, 0.3, 2400);
      else noiseBurst(0.12, 0.4, 1600);
    },
    punch() {
      noiseBurst(0.09, 0.35, 500);
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.3, 990);
    },
    cash() {
      blip(880, 0.09, 'triangle', 0.28);
      setTimeout(() => blip(1320, 0.14, 'triangle', 0.28), 90);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.3), i * 110));
    },
    busted() {
      blip(220, 0.5, 'sawtooth', 0.25, 110);
    },
    wasted() {
      blip(330, 0.7, 'sawtooth', 0.25, 82);
    },
    click() {
      blip(1200, 0.05, 'square', 0.15);
    },
  };
  return G.audio;
}
