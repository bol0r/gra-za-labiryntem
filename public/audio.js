export function createAudio() {
  let ctx = null;
  let master = null;
  let droneA = null;
  let droneB = null;
  let sentinel = null;
  let sentGain = null;
  let noise = null;
  let cloth = null;
  let muted = false;
  let stepAt = 0;
  let stepFlip = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    droneA = osc(40, "sine", 0.028);
    droneB = osc(60.5, "sine", 0.012);
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
    sentinel.frequency.value = 34;
    sentGain = ctx.createGain();
    sentGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 90;
    sentinel.connect(filter);
    filter.connect(sentGain);
    sentGain.connect(master);
    sentinel.start();
    const len = Math.floor(ctx.sampleRate * 0.18);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const clothLen = Math.floor(ctx.sampleRate * 0.35);
    cloth = ctx.createBuffer(1, clothLen, ctx.sampleRate);
    const clothData = cloth.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < clothLen; i++) {
      brown = brown * 0.92 + (Math.random() * 2 - 1) * 0.08;
      clothData[i] = brown;
    }
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

  function shaped(buffer, type, freq, q, dur, gain) {
    if (!ctx || muted || !buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
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

  function loseWash() {
    if (!ctx || muted || !cloth) return;
    const src = ctx.createBufferSource();
    src.buffer = cloth;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(240, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 1.3);
    const amp = ctx.createGain();
    const now = ctx.currentTime;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(0.09, now + 0.45);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(now);
    src.stop(now + 1.75);
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
        tone(156, 0.18, "sine", 0.06);
        shaped(noise, "bandpass", 190, 0.8, 0.08, 0.1);
      }
      if (name === "seal") {
        tone(740, 0.16, "sine", 0.055);
        tone(1180, 0.1, "sine", 0.03);
        tone(186, 0.22, "triangle", 0.05);
      }
      if (name === "veil") {
        shaped(noise, "bandpass", 240, 0.5, 0.18, 0.08);
        tone(156, 0.28, "sine", 0.04);
      }
      if (name === "alert") shaped(noise, "bandpass", 320, 1, 0.07, 0.12);
      if (name === "hunt") tone(36, 0.55, "sine", 0.08);
      if (name === "win") {
        tone(247, 0.4, "triangle", 0.045);
        shaped(noise, "bandpass", 520, 1.4, 0.04, 0.035);
        setTimeout(() => {
          tone(370, 0.55, "triangle", 0.038);
          shaped(noise, "bandpass", 680, 1.2, 0.035, 0.028);
        }, 190);
      }
      if (name === "lose") {
        tone(58, 0.9, "sine", 0.07);
        loseWash();
      }
      if (name === "start") tone(98, 0.4, "sine", 0.05);
    },
    update(dt, world) {
      if (!ctx || !world) return;
      const dist = world.dist;
      const near = Math.max(0, 1 - dist / 8);
      if (sentGain) {
        const target = muted ? 0 : near * near * (world.role === "runner" ? 0.16 : 0.05);
        sentGain.gain.value += (target - sentGain.gain.value) * 0.08;
      }
      if (sentinel) {
        const hunt = world.state === "hunt" ? 6 : 0;
        sentinel.frequency.value = 30 + near * 14 + hunt;
      }
      if (!world.moving || muted) return;
      stepAt -= dt;
      if (stepAt <= 0) {
        stepAt = world.sprint ? 0.28 : 0.46;
        stepFlip = !stepFlip;
        const loud = world.role === "runner";
        shaped(cloth, "lowpass", world.sprint ? 520 : 340, 0.7, 0.07, loud ? 0.11 : 0.03);
        if (stepFlip) shaped(cloth, "bandpass", 640, 0.6, 0.16, loud ? 0.035 : 0.012);
      }
    },
  };
}
