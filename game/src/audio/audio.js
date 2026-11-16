// Sound, synthesised: no audio file in this game. Every shot, step and beep is a noise burst or an
// oscillator built when it is needed, through one master gain, panned by where it happened. The
// context is created on the first click, because browsers require one.

const NOISE_SECONDS = 2;

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + white * 0.32) * 0.86; // a touch of low end so noise is not pure hiss
      data[i] = last;
    }
    return ctx;
  }

  function chain(pan, gain) {
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = pan < -1 ? -1 : pan > 1 ? 1 : pan;
      g.connect(p);
      p.connect(master);
    } else g.connect(master);
    return g;
  }

  /** A filtered noise burst: gunshots, footfalls, explosions. */
  function burst({ dur, f0, f1, q = 1, type = 'bandpass', gain = 0.5, pan = 0, attack = 0.002, delay = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    filter.Q.value = q;
    const env = chain(pan, gain);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(env);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** A swept oscillator: the body of a shot, the beep of a bomb, the ring of a flash. */
  function tone({ f0, f1, dur, type = 'sine', gain = 0.3, pan = 0, delay = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const env = chain(pan, gain);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  const library = {
    rifle(pan) {
      burst({ dur: 0.16, f0: 1800, f1: 260, q: 0.7, gain: 0.62, pan });
      tone({ f0: 140, f1: 46, dur: 0.13, gain: 0.34, pan });
      burst({ dur: 0.05, f0: 5200, f1: 2400, q: 0.4, type: 'highpass', gain: 0.22, pan });
    },
    pistol(pan) {
      burst({ dur: 0.1, f0: 2600, f1: 420, q: 0.9, gain: 0.44, pan });
      tone({ f0: 180, f1: 70, dur: 0.08, gain: 0.2, pan });
    },
    knife(pan) {
      burst({ dur: 0.14, f0: 4200, f1: 900, q: 0.6, type: 'highpass', gain: 0.18, pan });
    },
    step(pan, quiet) {
      burst({ dur: 0.07, f0: 620, f1: 180, q: 0.8, type: 'lowpass', gain: quiet ? 0.05 : 0.11, pan });
      burst({ dur: 0.03, f0: 2400, f1: 1200, q: 0.5, type: 'highpass', gain: quiet ? 0.02 : 0.04, pan });
    },
    hit(pan) {
      tone({ f0: 420, f1: 190, dur: 0.06, type: 'triangle', gain: 0.14, pan });
    },
    headshot(pan) {
      tone({ f0: 1750, f1: 1300, dur: 0.11, type: 'sine', gain: 0.16, pan });
      tone({ f0: 2600, f1: 2200, dur: 0.07, type: 'sine', gain: 0.09, pan, delay: 0.01 });
    },
    flesh() {
      burst({ dur: 0.11, f0: 900, f1: 180, q: 1.2, type: 'lowpass', gain: 0.16 });
    },
    reload() {
      burst({ dur: 0.04, f0: 2200, f1: 1400, q: 1, type: 'bandpass', gain: 0.2 });
      burst({ dur: 0.05, f0: 1500, f1: 700, q: 1, gain: 0.18, delay: 0.42 });
      burst({ dur: 0.05, f0: 1900, f1: 900, q: 1, gain: 0.22, delay: 0.95 });
    },
    dry() {
      burst({ dur: 0.03, f0: 3200, f1: 2000, q: 2, gain: 0.16 });
    },
    buy() {
      tone({ f0: 760, f1: 780, dur: 0.06, type: 'square', gain: 0.1 });
      tone({ f0: 1140, f1: 1160, dur: 0.08, type: 'square', gain: 0.1, delay: 0.07 });
    },
    beep(urgent) {
      tone({ f0: urgent ? 2100 : 1500, f1: urgent ? 2200 : 1550, dur: 0.05, type: 'square', gain: 0.12 });
    },
    plant() {
      tone({ f0: 300, f1: 900, dur: 0.4, type: 'sawtooth', gain: 0.12 });
    },
    defused() {
      tone({ f0: 900, f1: 300, dur: 0.5, type: 'sine', gain: 0.16 });
    },
    explode(pan) {
      burst({ dur: 1.4, f0: 700, f1: 60, q: 0.6, type: 'lowpass', gain: 0.95, pan });
      tone({ f0: 90, f1: 24, dur: 1.1, gain: 0.6, pan });
      burst({ dur: 0.5, f0: 4000, f1: 300, q: 0.5, type: 'highpass', gain: 0.3, pan });
    },
    flash(pan) {
      burst({ dur: 0.7, f0: 2600, f1: 9000, q: 0.5, type: 'highpass', gain: 0.5, pan });
      tone({ f0: 3000, f1: 5200, dur: 0.9, type: 'sine', gain: 0.14, pan });
    },
    ring() {
      tone({ f0: 3400, f1: 3200, dur: 2.6, type: 'sine', gain: 0.06 });
    },
    roundStart() {
      burst({ dur: 0.5, f0: 400, f1: 1600, q: 0.5, type: 'bandpass', gain: 0.16 });
      tone({ f0: 180, f1: 180, dur: 0.3, type: 'sine', gain: 0.12, delay: 0.1 });
    },
    win() {
      tone({ f0: 520, f1: 780, dur: 0.5, type: 'triangle', gain: 0.14 });
      tone({ f0: 780, f1: 1040, dur: 0.6, type: 'triangle', gain: 0.12, delay: 0.14 });
    },
    lose() {
      tone({ f0: 420, f1: 210, dur: 0.7, type: 'triangle', gain: 0.14 });
    },
  };

  return {
    init,
    play(name, pan = 0, extra = 0) {
      if (!ctx || !library[name]) return;
      const fn = library[name];
      if (name === 'step') fn(pan, extra);
      else if (name === 'beep') fn(extra > 0);
      else fn(pan);
    },
    get ready() {
      return ctx !== null;
    },
  };
}
