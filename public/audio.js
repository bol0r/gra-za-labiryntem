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
    droneA = osc(46, "sine", 0.045);
    droneB = osc(69.2, "sine", 0.02);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(droneA.frequency);
    lfo.start();
    sentinel = ctx.createOscillator();
    sentinel.type = "sawtooth";
    sentinel.frequency.value = 80;
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
      if (name === "ping") tone(660, 0.18, "sine", 0.08);
      if (name === "seal") tone(196, 0.4, "triangle", 0.1);
      if (name === "veil") tone(520, 0.25, "sine", 0.06);
      if (name === "alert") tone(480, 0.12, "square", 0.04);
      if (name === "hunt") tone(128, 0.3, "sawtooth", 0.06);
      if (name === "win") {
        tone(220, 0.4, "sine", 0.08);
        setTimeout(() => tone(330, 0.5, "sine", 0.08), 140);
        setTimeout(() => tone(440, 0.7, "sine", 0.07), 280);
      }
      if (name === "lose") tone(70, 0.8, "sawtooth", 0.1);
      if (name === "start") tone(174, 0.5, "triangle", 0.06);
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
        const hunt = world.state === "hunt" ? 40 : 0;
        sentinel.frequency.value = 74 + near * 160 + hunt;
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
