function clampPercent(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function createAudio(initial = {}) {
  let ctx = null;
  let master = null;
  let droneA = null;
  let droneB = null;
  let sentinel = null;
  let sentGain = null;
  let noise = null;
  let cloth = null;
  let volume = clampPercent(initial.volume, 80);
  let muted = !!initial.muted;
  let stepAt = 0;
  let stepFlip = false;
  let warmed = false;

  function applyGain() {
    if (!master) return;
    master.gain.value = muted ? 0 : (volume / 80) * 0.62;
  }

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyGain();
    droneA = osc(46, "sine", 0.012);
    droneB = osc(92, "sine", 0.008);
    startWind();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 1.2;
    lfo.connect(lfoGain);
    lfoGain.connect(droneA.frequency);
    const lfoOct = ctx.createGain();
    lfoOct.gain.value = 2;
    lfoGain.connect(lfoOct);
    lfoOct.connect(droneB.frequency);
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
    amp.gain.value = 0.028;
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
      if (!ctx) return;
      const resume = ctx.state === "running" ? Promise.resolve() : ctx.resume();
      Promise.resolve(resume).then(() => {
        if (warmed || muted || !ctx || ctx.state !== "running") return;
        warmed = true;
        tone(196, 0.1, "sine", 0.14);
        tone(294, 0.18, "triangle", 0.08);
      }).catch(() => {});
    },
    toggle() {
      ensure();
      muted = !muted;
      applyGain();
      if (ctx && ctx.state !== "running") ctx.resume();
      return muted;
    },
    setMuted(on) {
      muted = !!on;
      applyGain();
    },
    setVolume(percent) {
      volume = clampPercent(percent, volume);
      applyGain();
    },
    volumePercent() {
      return volume;
    },
    get muted() {
      return muted;
    },
    play(name) {
      ensure();
      if (ctx && ctx.state !== "running") ctx.resume();
      if (name === "ping") {
        tone(420, 0.16, "sine", 0.16);
        shaped(noise, "bandpass", 480, 0.8, 0.08, 0.22);
      }
      if (name === "knock") {
        tone(168, 0.07, "triangle", 0.2);
        tone(96, 0.14, "sine", 0.16);
        shaped(noise, "lowpass", 320, 0.7, 0.1, 0.24);
      }
      if (name === "seal") {
        tone(740, 0.16, "sine", 0.12);
        tone(1180, 0.1, "sine", 0.07);
        tone(220, 0.22, "triangle", 0.12);
      }
      if (name === "veil") {
        shaped(noise, "bandpass", 360, 0.5, 0.22, 0.18);
        tone(196, 0.28, "sine", 0.1);
      }
      if (name === "alert") shaped(noise, "bandpass", 520, 1, 0.08, 0.22);
      if (name === "hunt") tone(82, 0.55, "sine", 0.16);
      if (name === "win") {
        tone(247, 0.4, "triangle", 0.12);
        shaped(noise, "bandpass", 520, 1.4, 0.05, 0.08);
        setTimeout(() => {
          tone(370, 0.55, "triangle", 0.1);
          shaped(noise, "bandpass", 680, 1.2, 0.04, 0.06);
        }, 190);
      }
      if (name === "lose") {
        tone(110, 0.9, "sine", 0.16);
        loseWash();
      }
      if (name === "start") {
        tone(196, 0.22, "sine", 0.08);
        tone(294, 0.32, "sine", 0.05);
      }
      if (name === "key") {
        tone(392, 0.12, "sine", 0.08);
        tone(523, 0.22, "sine", 0.06);
      }
      if (name === "shard") tone(330, 0.16, "sine", 0.07);
      if (name === "escape") tone(146, 0.28, "sine", 0.06);
    },
    hear(pan, dist) {
      ensure();
      if (!ctx || muted) return;
      if (ctx.state !== "running") ctx.resume();
      const node = ctx.createOscillator();
      const amp = ctx.createGain();
      const width = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      node.type = "sine";
      node.frequency.value = dist < 4 ? 220 : 160;
      amp.gain.setValueAtTime(dist < 4 ? 0.18 : 0.1, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      node.connect(amp);
      if (width) {
        width.pan.value = Math.max(-1, Math.min(1, pan));
        amp.connect(width);
        width.connect(master);
      } else amp.connect(master);
      node.start();
      node.stop(ctx.currentTime + 0.3);
    },
    bubble() {
      ensure();
      if (!ctx || muted) return;
      const resume = ctx.state === "running" ? Promise.resolve() : ctx.resume();
      Promise.resolve(resume).then(() => {
        if (!ctx || muted || ctx.state !== "running") return;
        const now = ctx.currentTime;
        for (let i = 0; i < 16; i++) {
          const t = now + i * 0.12 + Math.random() * 0.04;
          const node = ctx.createOscillator();
          const amp = ctx.createGain();
          node.type = "sine";
          const freq = 80 + Math.random() * 90;
          node.frequency.setValueAtTime(freq, t);
          node.frequency.exponentialRampToValueAtTime(Math.max(42, freq * 0.42), t + 0.16);
          amp.gain.setValueAtTime(0.0001, t);
          amp.gain.exponentialRampToValueAtTime(0.18, t + 0.025);
          amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          node.connect(amp);
          amp.connect(master);
          node.start(t);
          node.stop(t + 0.22);
        }
        shaped(noise, "lowpass", 260, 0.5, 1.7, 0.22);
      }).catch(() => {});
    },
    update(dt, world) {
      if (!ctx || !world) return;
      const dist = world.dist;
      const near = Math.max(0, 1 - dist / 8);
      if (sentGain) {
        const target = muted ? 0 : near * near * (world.role === "runner" ? 0.08 : 0.035);
        sentGain.gain.value += (target - sentGain.gain.value) * 0.08;
      }
      if (sentinel) {
        const hunt = world.state === "hunt" ? 8 : 0;
        sentinel.frequency.value = 55 + near * 18 + hunt;
      }
      if (!world.moving || muted) return;
      stepAt -= dt;
      if (stepAt <= 0) {
        stepAt = world.sprint ? 0.28 : 0.46;
        stepFlip = !stepFlip;
        const loud = world.role === "runner";
        shaped(cloth, "lowpass", world.sprint ? 680 : 420, 0.7, 0.08, loud ? 0.26 : 0.1);
        if (stepFlip) shaped(cloth, "bandpass", 720, 0.6, 0.14, loud ? 0.1 : 0.04);
      }
    },
  };
}
