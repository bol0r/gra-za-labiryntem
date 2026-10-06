export function createAudio() {
  let ctx = null;
  let master = null;
  let droneA = null;
  let droneB = null;
  let sentinel = null;
  let sentGain = null;
  let noise = null;
  let muted = false;
  let stepAt = 0;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    droneA = osc(46, "sine", 0.03);
    droneB = osc(69.2, "sine", 0.014);
    startWind();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(droneA.frequency);
    lfo.start();
    sentinel = ctx.createOscillator();
    sentinel.type = "sine";
    sentinel.frequency.value = 46;
    sentGain = ctx.createGain();
    sentGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    sentinel.connect(filter);
    filter.connect(sentGain);
    sentGain.connect(master);
    sentinel.start();
    const len = Math.floor(ctx.sampleRate * 0.18);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }

  function osc(freq, type, gain) {
    const node = ctx.createOscillator();
    const amp = ctx.createGain();
    node.type = type;
    node.frequency.value = freq;
    amp.gain.value = gain;
    node.connect(amp);
    amp.connect(master);
    node.start();
    return node;
  }

  function tone(freq, dur, type, gain) {
    if (!ctx || muted) return;
    const node = ctx.createOscillator();
    const amp = ctx.createGain();
    node.type = type;
    node.frequency.value = freq;
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    node.connect(amp);
    amp.connect(master);
    node.start();
    node.stop(ctx.currentTime + dur + 0.02);
  }

  function startWind() {
    const seconds = 2;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    const amp = ctx.createGain();
    amp.gain.value = 0.045;
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start();
  }

  function burst(freq, dur, gain, q) {
    if (!ctx || muted || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    const now = ctx.currentTime;
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume();
    },
    toggle() {
      ensure();
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.32;
      return muted;
    },
    get muted() {
      return muted;
    },
    play(name) {
      ensure();
      if (name === "ping") {
        burst(380, 0.08, 0.22, 0.8);
        tone(118, 0.07, "sine", 0.05);
      }
      if (name === "seal") {
        tone(740, 0.16, "sine", 0.055);
        tone(1180, 0.1, "sine", 0.03);
        tone(186, 0.22, "triangle", 0.05);
      }
      if (name === "veil") {
        burst(240, 0.18, 0.08, 0.5);
        tone(156, 0.28, "sine", 0.04);
      }
      if (name === "alert") burst(320, 0.07, 0.12, 1);
      if (name === "hunt") tone(48, 0.5, "sine", 0.09);
      if (name === "win") {
        tone(196, 0.35, "sine", 0.06);
        setTimeout(() => tone(294, 0.45, "sine", 0.05), 120);
      }
      if (name === "lose") tone(52, 0.8, "sine", 0.1);
      if (name === "start") tone(98, 0.4, "sine", 0.05);
    },
    update(dt, world) {
      if (!ctx || !world) return;
      const dist = world.dist;
      const near = Math.max(0, 1 - dist / 8);
      if (sentGain) {
        const target = muted ? 0 : near * near * (world.role === "runner" ? 0.08 : 0.03);
        sentGain.gain.value += (target - sentGain.gain.value) * 0.1;
      }
      if (sentinel) {
        const hunt = world.state === "hunt" ? 10 : 0;
        sentinel.frequency.value = 42 + near * 36 + hunt;
      }
      if (!world.moving || muted) return;
      stepAt -= dt;
      if (stepAt <= 0) {
        stepAt = world.sprint ? 0.28 : 0.42;
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = world.sprint ? 280 : 180;
        const amp = ctx.createGain();
        amp.gain.value = world.role === "runner" ? 0.18 : 0.04;
        src.connect(filter);
        filter.connect(amp);
        amp.connect(master);
        src.start();
      }
    },
  };
}
