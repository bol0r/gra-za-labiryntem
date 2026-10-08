import { createAudio } from "/audio.js";
import { drawBeacon, drawExplorer, drawGuide, drawLobby, drawVignette } from "/render.js";
import { applySeals, clamp, lerpAngle, normalizeAngle, stepExplorer } from "/shared/sim.js";

const STORAGE = "za-labiryntem";
const STEP = 1 / 20;
const screen = document.getElementById("screen");
const lobby = document.getElementById("lobby");
const plate = document.getElementById("plate");
const panel = document.getElementById("panel");
const stage = document.getElementById("stage");
const map = document.getElementById("map");
const touch = document.getElementById("touch");
const stickZone = document.getElementById("stick-zone");
const lookZone = document.getElementById("look-zone");
const stick = document.getElementById("stick");
const stickKnob = stick.querySelector("i");
const sprintBtn = document.getElementById("sprint");
const hint = document.getElementById("hint");
const toast = document.getElementById("toast");
const muteBtn = document.getElementById("mute");
const waitbanner = document.getElementById("waitbanner");
const result = document.getElementById("result");
const resultKicker = document.getElementById("result-kicker");
const resultTitle = document.getElementById("result-title");
const resultTime = document.getElementById("result-time");
const nextBtn = document.getElementById("next");
const audio = createAudio();
const keys = new Set();
const looks = new Map();
const sticks = new Map();

const state = {
  ws: null,
  phase: "boot",
  role: "",
  code: "",
  token: "",
  maze: null,
  round: 0,
  look: 0,
  body: { x: 1.5, y: 1.5, a: 0, moving: false, sprint: false, quiet: true },
  input: { forward: 0, strafe: 0, angle: 0, sprint: false },
  snaps: [],
  acc: 0,
  poseAcc: 0,
  sprintLatch: false,
  map: null,
  lastCall: null,
  sealCharges: 2,
  urls: [],
  joinUrl: "",
  qr: "",
  both: false,
  err: "",
};

const narrow = window.matchMedia("(max-width: 800px)").matches;
const queryCode = (new URLSearchParams(location.search).get("pokoj") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

function send(obj) {
  if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(obj));
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE) || "null");
  } catch {
    return null;
  }
}

function saveSession() {
  sessionStorage.setItem(STORAGE, JSON.stringify({ code: state.code, token: state.token, role: state.role }));
}

function setPhase(phase) {
  state.phase = phase;
  const menu = phase === "boot" || phase === "home" || phase === "lobby";
  screen.classList.toggle("is-menu", menu);
  screen.classList.toggle("is-game", !menu);
  screen.dataset.phase = phase;
  screen.dataset.role = state.role || "";
  lobby.hidden = !menu;
  const playing = phase === "play" && state.role === "runner";
  touch.hidden = !playing;
  sprintBtn.hidden = !playing;
  if (!playing) {
    stick.hidden = true;
    state.input.forward = 0;
    state.input.strafe = 0;
  }
  if (menu) hint.hidden = true;
  result.hidden = phase !== "result";
  waitbanner.hidden = phase !== "wait";
  resize();
}

function setErr(text) {
  state.err = text || "";
  const node = document.getElementById("err");
  if (node) node.textContent = state.err;
  else if (text && (state.phase === "play" || state.phase === "result" || state.phase === "wait")) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(setErr.timer);
    setErr.timer = setTimeout(() => toast.classList.remove("show"), 1600);
  }
}

function paintHome() {
  const suggested = narrow ? "runner" : "guide";
  plate.innerHTML = `
    <p class="kicker">Planeta bez nazwy</p>
    <h1>Za labiryntem</h1>
    <p class="lead">Jedna osoba zostaje przy mapie. Druga schodzi z latarnią. Na końcu jest serce ruiny. W korytarzach chodzi strażnik.</p>
    <div class="roles">
      <button type="button" data-act="create" data-role="guide">Przy mapie<small>Kartograf. Widzi ruinę i strażnika.</small></button>
      <button type="button" data-act="create" data-role="runner">W korytarzu<small>Latarnik. Ma tylko światło.</small></button>
    </div>
    <form class="join" data-act="join">
      <input name="code" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="KOD" value="${queryCode && !state.code ? queryCode : ""}" aria-label="Kod komory">
      <button class="solid" type="submit">Wejdź</button>
    </form>
    <p class="err" id="err">${state.err || ""}</p>
    <p class="fine">Dźwięk głosu zostawcie sobie. Bez rozmowy kartograf i tak wyśle znak. Oba ekrany muszą być w tym samym Wi-Fi. ${suggested === "runner" ? "Na tym ekranie naturalnie schodzi się w dół." : "Na tym ekranie naturalnie zostaje się przy mapie."}</p>
  `;
}

function paintLobby() {
  const roleName = state.role === "runner" ? "Latarnik" : "Kartograf";
  const code = (state.code || "").split("").join(" ");
  const urls = (state.urls || []).map((url) => `<div class="urls">${url}</div>`).join("");
  plate.innerHTML = `
    <p class="kicker">${roleName}</p>
    <h1 class="code">${code}</h1>
    ${state.qr ? `<img class="qr" alt="Kod QR komory ${state.code}" src="${state.qr}">` : ""}
    <p class="fine">${state.both ? "Oboje jesteście w komorze." : "Druga osoba skanuje kod albo wpisuje go na stronie."}</p>
    ${urls}
    <p class="fine">Telefon i komputer w tym samym Wi-Fi. Jeśli telefon nie wchodzi, komputer może zapytać, czy pozwolić na połączenia w sieci lokalnej.</p>
    <div class="roles">
      <button class="solid" type="button" data-act="start" ${state.both ? "" : "disabled"}>Zejdźcie</button>
      <button class="ghost" type="button" data-act="leave">Opuść</button>
    </div>
    <p class="err" id="err">${state.err || ""}</p>
  `;
}

const callIcon = {
  stop: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>`,
  quiet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 9h3l4-3v12l-4-3H5z"/><path d="M16 9.5l4.5 5M20.5 9.5l-4.5 5" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>`,
  run: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 12h11l-3.2-3.2 1.4-1.4L19.6 12l-7.4 4.6-1.4-1.4L14 12H3z"/></svg>`,
  left: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14.5 5.5 8 12l6.5 6.5 1.4-1.4L10.8 12l5.1-5.1z"/></svg>`,
  right: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.5 5.5 16 12l-6.5 6.5-1.4-1.4L13.2 12 8.1 6.9z"/></svg>`,
};

function renderPanel() {
  const plate = (id, label, key) => `<button type="button" data-act="call" data-id="${id}">${callIcon[id]}<span>${label}</span><small>${key}</small></button>`;
  panel.innerHTML = `
    <p class="kicker">Ruina · runda ${state.round}</p>
    <h2 id="sent-state" data-state="patrol">Obchód</h2>
    <p id="wake-state" class="fine">Cisza</p>
    <div class="call-row">
      ${plate("stop", "Stój", "1")}
      ${plate("quiet", "Cicho", "2")}
      ${plate("run", "Biegnij", "3")}
      ${plate("left", "W lewo", "4")}
      ${plate("right", "W prawo", "5")}
    </div>
    <button id="veil-btn" type="button" data-act="veil" style="--veil-p: 1"><span id="veil-fill"></span><span id="veil-label">Zasłona (Z)</span></button>
    <p id="seal-count">Pieczęcie · 2</p>
    <p class="fine">Kliknij korytarz, żeby dać znak. Kliknij bursztynową klamrę, żeby otworzyć skrót. Bieg słychać przez ściany. Stanie w miejscu czyni latarnika cichym.</p>
    <p class="code" id="side-code">${(state.code || "").split("").join(" ")}</p>
  `;
}

function updatePanel(snap) {
  if (state.role !== "guide") return;
  if (panel.dataset.round !== String(state.round)) {
    panel.dataset.round = String(state.round);
    renderPanel();
  }
  const names = { patrol: "Obchód", alert: "Czuwa", hunt: "Pościg", search: "Szuka" };
  const sent = panel.querySelector("#sent-state");
  if (sent && snap.sn) {
    sent.textContent = names[snap.sn.state] || "Obchód";
    sent.dataset.state = snap.sn.state || "patrol";
  }
  const wake = panel.querySelector("#wake-state");
  if (wake) {
    wake.textContent = snap.wake > 0.55 ? "Ruina się budzi" : snap.wake > 0.12 ? "Niepokój" : "Cisza";
  }
  const veil = panel.querySelector("#veil-btn");
  if (veil) {
    const label = veil.querySelector("#veil-label");
    const cooling = snap.veilCd > 0 && !(snap.veil > 0);
    const p = snap.veil > 0 || !cooling ? 1 : 1 - snap.veilCd / 26;
    veil.style.setProperty("--veil-p", p.toFixed(3));
    if (label) {
      if (snap.veil > 0) label.textContent = "Zasłona trwa";
      else if (cooling) label.textContent = `Zasłona ${Math.ceil(snap.veilCd)}`;
      else label.textContent = "Zasłona (Z)";
    }
    veil.disabled = snap.veilCd > 0;
  }
  const seals = panel.querySelector("#seal-count");
  if (seals) seals.textContent = `Pieczęcie · ${snap.sealCharges}`;
}

function showCall(id) {
  const words = { stop: "Stój", quiet: "Cicho", run: "Biegnij", left: "W lewo", right: "W prawo" };
  toast.textContent = words[id] || "";
  toast.classList.add("show");
  clearTimeout(showCall.timer);
  showCall.timer = setTimeout(() => toast.classList.remove("show"), 1500);
  if (state.role === "runner" && navigator.vibrate) navigator.vibrate(18);
}

function showResult(snap) {
  result.hidden = snap.phase !== "result";
  if (snap.phase !== "result") return;
  const win = snap.result === "win";
  resultKicker.textContent = win ? "Komora" : "Strażnik";
  resultTitle.textContent = win ? "Serce ruiny odpowiada." : "Strażnik zamyka przejście.";
  const total = Math.max(0, snap.roundT || 0);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  resultTime.textContent = `${m}:${String(s).padStart(2, "0")} w ruinie`;
  nextBtn.textContent = snap.nextIn > 0.2 ? `Następna komora · ${Math.ceil(snap.nextIn)}` : "Następna komora";
  screen.classList.toggle("flash-win", win);
  screen.classList.toggle("flash-lose", !win);
}

function onRound(msg) {
  state.maze = msg.maze;
  state.round = msg.round;
  applySeals(state.maze);
  state.body.x = msg.spawn.x;
  state.body.y = msg.spawn.y;
  state.body.a = msg.spawn.a;
  state.look = msg.spawn.a;
  state.input.angle = msg.spawn.a;
  state.input.forward = 0;
  state.input.strafe = 0;
  state.acc = 0;
  state.snaps = [];
  state.lastCall = null;
  panel.dataset.round = "";
  setPhase("play");
  if (state.role === "runner") {
    hint.hidden = false;
    hint.textContent = controlHint();
    clearTimeout(onRound.hint);
    onRound.hint = setTimeout(() => {
      if (hint.textContent.startsWith("Lewa")) hint.hidden = true;
    }, 14000);
  }
}

function onSnap(msg) {
  if (msg.seals && state.maze) applySeals(state.maze, msg.seals);
  state.sealCharges = msg.sealCharges;
  state.snaps.push({ ...msg, at: performance.now() });
  if (state.snaps.length > 14) state.snaps.shift();
  if (msg.fx) for (const name of msg.fx) audio.play(name);
  if (msg.call && (!state.lastCall || msg.call.id !== state.lastCall.id || msg.call.ttl > state.lastCall.ttl + 0.2)) {
    if (state.role === "runner") showCall(msg.call.id);
  }
  state.lastCall = msg.call;
  if (msg.phase && msg.phase !== state.phase && (msg.phase === "play" || msg.phase === "result" || msg.phase === "wait")) {
    setPhase(msg.phase);
  }
  if (msg.phase === "result") {
    showResult(msg);
    if (msg.result === "lose" && navigator.vibrate && state.role === "runner") navigator.vibrate(180);
  } else {
    result.hidden = true;
    screen.classList.remove("flash-win", "flash-lose");
  }
  if (msg.phase === "wait") {
    waitbanner.hidden = false;
    waitbanner.textContent = msg.note || "Gra stoi.";
  } else waitbanner.hidden = true;
  if (state.role === "runner" && state.phase === "play") {
    if (msg.immunity > 0.2) {
      hint.hidden = false;
      hint.textContent = "Strażnik jeszcze was nie słyszy.";
    } else if (hint.textContent.startsWith("Strażnik")) hint.textContent = controlHint();
  }
  updatePanel(msg);
  if (msg.phase === "result") showResult(msg);
}

function onJoined(msg) {
  state.code = msg.code;
  state.token = msg.token;
  state.role = msg.role;
  state.urls = msg.urls || [];
  state.joinUrl = msg.joinUrl || "";
  state.qr = msg.qr || "";
  state.err = "";
  saveSession();
  screen.dataset.role = state.role;
  setPhase("lobby");
  paintLobby();
}

function viewSnap() {
  if (!state.snaps.length) return null;
  if (state.role === "runner") return state.snaps[state.snaps.length - 1];
  const target = performance.now() - 80;
  let chosen = state.snaps[state.snaps.length - 1];
  for (let i = 0; i < state.snaps.length - 1; i++) {
    const a = state.snaps[i];
    const b = state.snaps[i + 1];
    if (a.at <= target && b.at >= target) {
      const u = (target - a.at) / (b.at - a.at || 1);
      chosen = {
        ...b,
        ex: lerpEnt(a.ex, b.ex, u),
        sn: lerpEnt(a.sn, b.sn, u),
      };
      break;
    }
  }
  return chosen;
}

function lerpEnt(a, b, u) {
  if (!a || !b) return b || a;
  return { ...b, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, a: lerpAngle(a.a, b.a, u) };
}

function controlHint() {
  const fine = window.matchMedia("(pointer:fine)").matches;
  return fine
    ? "WASD: krok. Strzałki w bok: wzrok. Shift: bieg. Puść klawisze, żeby zamilknąć."
    : "Lewa połowa: krok. Prawa: wzrok. Puść palec, żeby zamilknąć. Przycisk Bieg jest słyszalny.";
}

function readKeys(dt) {
  if (state.role !== "runner") return;
  if (keys.has("arrowleft")) state.look = normalizeAngle(state.look - 1.8 * dt);
  if (keys.has("arrowright")) state.look = normalizeAngle(state.look + 1.8 * dt);
  if (sticks.size) return;
  const forward = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  const strafe = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
  state.input.forward = forward;
  state.input.strafe = strafe;
  state.input.sprint = keys.has("shift") || state.sprintLatch;
}

function resize() {
  const rect = map.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const nextW = Math.max(1, Math.round(rect.width * dpr));
  const nextH = Math.max(1, Math.round(rect.height * dpr));
  if (stage.width !== nextW || stage.height !== nextH) {
    stage.width = nextW;
    stage.height = nextH;
  }
  stage._cssW = Math.max(1, rect.width);
  stage._cssH = Math.max(1, rect.height);
  stage._dpr = dpr;
}

function draw(time) {
  const ctx = stage.getContext("2d");
  const cssW = stage._cssW || 1;
  const cssH = stage._cssH || 1;
  const dpr = stage._dpr || 1;
  if (state.phase === "boot" || state.phase === "home" || state.phase === "lobby") {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLobby(ctx, cssW, cssH, time);
    return;
  }
  const snap = viewSnap();
  if (!state.maze || !snap) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLobby(ctx, cssW, cssH, time);
    return;
  }
  if (state.role === "runner") {
    const body = state.body;
    body.moving = Math.hypot(state.input.forward, state.input.strafe) > 0.08;
    body.sprint = !!state.input.sprint && body.moving;
    drawExplorer(stage, {
      maze: state.maze,
      body,
      sentinel: snap.sn,
      ping: snap.ping,
      time,
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const threat = threatOf(body, snap.sn);
    drawVignette(ctx, stage.width, stage.height, threat, snap.veil || 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBeacon(ctx, cssW, cssH, body, snap.ping);
    return;
  }
  const explorer = snap.ex || state.body;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.map = drawGuide(ctx, cssW, cssH, {
    maze: state.maze,
    explorer,
    sentinel: snap.sn,
    ping: snap.ping,
    time,
    wake: snap.wake || 0,
  });
}

function threatOf(body, sn) {
  if (!sn) return 0;
  const dist = Math.hypot(sn.x - body.x, sn.y - body.y);
  if (sn.state === "hunt") return clamp(1 - dist / 7, 0, 1);
  return clamp((3.2 - dist) / 3.2, 0, 1) * 0.35;
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}`);
  state.ws = ws;
  ws.onopen = () => {
    const saved = readSession();
    if (queryCode && (!saved || saved.code !== queryCode)) send({ t: "join", code: queryCode });
    else if (saved) send({ t: "resume", code: saved.code, token: saved.token });
    else {
      state.phase = "home";
      paintHome();
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === "joined") onJoined(msg);
    else if (msg.t === "lobby") {
      state.both = !!msg.both;
      state.qr = msg.qr || state.qr;
      state.urls = msg.urls || state.urls;
      if (msg.role) state.role = msg.role;
      if (state.phase === "boot" || state.phase === "home" || state.phase === "lobby") {
        setPhase("lobby");
        paintLobby();
      }
    } else if (msg.t === "round") onRound(msg);
    else if (msg.t === "snap") onSnap(msg);
    else if (msg.t === "correct" && state.role === "runner") {
      state.body.x = msg.x;
      state.body.y = msg.y;
      state.body.a = msg.a;
      state.look = msg.a;
      state.input.angle = msg.a;
    } else if (msg.t === "err") {
      if (msg.text && (msg.text.includes("zgasła") || msg.text.includes("Nie ma"))) {
        sessionStorage.removeItem(STORAGE);
        state.phase = "home";
        state.role = "";
        setPhase("home");
        paintHome();
      }
      setErr(msg.text);
    }
  };
  ws.onclose = () => {
    if (state.phase !== "home") setErr("Sygnał urwany. Łączę znowu…");
    setTimeout(connect, 900);
  };
}

lobby.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-act]");
  if (!btn || btn.dataset.act === "join") return;
  audio.unlock();
  if (btn.dataset.act === "create") send({ t: "create", role: btn.dataset.role });
  if (btn.dataset.act === "start") send({ t: "start" });
  if (btn.dataset.act === "leave") {
    sessionStorage.removeItem(STORAGE);
    send({ t: "leave" });
    state.role = "";
    state.code = "";
    state.maze = null;
    setPhase("home");
    paintHome();
  }
});

lobby.addEventListener("submit", (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  audio.unlock();
  const code = new FormData(form).get("code");
  send({ t: "join", code });
});

function glowCall(id) {
  const btn = panel.querySelector(`[data-act="call"][data-id="${id}"]`);
  if (!btn) return;
  panel.querySelectorAll(".is-hot").forEach((node) => node.classList.remove("is-hot"));
  void btn.offsetWidth;
  btn.classList.add("is-hot");
  clearTimeout(glowCall.timer);
  glowCall.timer = setTimeout(() => btn.classList.remove("is-hot"), 1500);
}

panel.addEventListener("pointerdown", (event) => {
  const btn = event.target.closest("button");
  if (!btn || btn.disabled) return;
  btn.classList.add("is-down");
});
panel.addEventListener("pointerup", (event) => {
  const btn = event.target.closest("button");
  if (btn) btn.classList.remove("is-down");
});
panel.addEventListener("pointercancel", () => {
  panel.querySelectorAll(".is-down").forEach((node) => node.classList.remove("is-down"));
});

panel.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-act]");
  if (!btn || state.role !== "guide") return;
  audio.unlock();
  if (btn.dataset.act === "veil") send({ t: "veil" });
  if (btn.dataset.act === "call") {
    send({ t: "call", id: btn.dataset.id });
    glowCall(btn.dataset.id);
  }
});

stage.addEventListener("click", (event) => {
  if (state.role === "runner" && window.matchMedia("(pointer:fine)").matches && state.phase === "play") {
    stage.requestPointerLock();
    return;
  }
  if (state.role !== "guide" || state.phase !== "play" || !state.map || !state.maze) return;
  const rect = stage.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const wx = (x - state.map.ox) / state.map.size;
  const wy = (y - state.map.oy) / state.map.size;
  let best = -1;
  let bestD = 0.42;
  state.maze.seals.forEach((seal, index) => {
    if (seal.open) return;
    const mx = seal.axis === "v" ? seal.x : seal.x + 0.5;
    const my = seal.axis === "v" ? seal.y + 0.5 : seal.y;
    const dist = Math.hypot(wx - mx, wy - my);
    if (dist < bestD) {
      bestD = dist;
      best = index;
    }
  });
  if (best >= 0 && state.sealCharges > 0) send({ t: "seal", i: best });
  else send({ t: "ping", x: wx, y: wy });
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== stage || state.role !== "runner") return;
  state.look = normalizeAngle(state.look + event.movementX * 0.0032);
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(event.key.toLowerCase())) event.preventDefault();
  keys.add(event.key.toLowerCase());
  if (event.key === "Shift") state.input.sprint = true;
  if (state.role !== "guide" || state.phase !== "play") return;
  const calls = { "1": "stop", "2": "quiet", "3": "run", "4": "left", "5": "right" };
  if (calls[event.key]) {
    send({ t: "call", id: calls[event.key] });
    glowCall(calls[event.key]);
  }
  if (event.key.toLowerCase() === "z") send({ t: "veil" });
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
  if (event.key === "Shift") state.input.sprint = state.sprintLatch;
});

function bindPointer(zone, kind) {
  zone.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    audio.unlock();
    zone.setPointerCapture(event.pointerId);
    if (kind === "look") looks.set(event.pointerId, event.clientX);
    else {
      sticks.set(event.pointerId, { ox: event.clientX, oy: event.clientY });
      placeStick(event.clientX, event.clientY, 0, 0);
    }
  }, { passive: false });
  zone.addEventListener("pointermove", (event) => {
    if (kind === "look") {
      if (!looks.has(event.pointerId)) return;
      const prev = looks.get(event.pointerId);
      state.look = normalizeAngle(state.look + (event.clientX - prev) * 0.0072);
      looks.set(event.pointerId, event.clientX);
      return;
    }
    const origin = sticks.get(event.pointerId);
    if (!origin) return;
    let dx = event.clientX - origin.ox;
    let dy = event.clientY - origin.oy;
    const mag = Math.hypot(dx, dy);
    const max = 64;
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    if (mag < 10) {
      state.input.forward = 0;
      state.input.strafe = 0;
    } else {
      state.input.strafe = clamp(dx / max, -1, 1);
      state.input.forward = clamp(-dy / max, -1, 1);
    }
    state.input.sprint = state.sprintLatch;
    placeStick(origin.ox, origin.oy, dx, dy);
  });
  const end = (event) => {
    looks.delete(event.pointerId);
    if (sticks.delete(event.pointerId) && sticks.size === 0) {
      state.input.forward = 0;
      state.input.strafe = 0;
      stick.hidden = true;
    }
  };
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
}

function placeStick(x, y, dx, dy) {
  stick.hidden = false;
  stick.style.left = `${x}px`;
  stick.style.top = `${y}px`;
  stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

bindPointer(stickZone, "stick");
bindPointer(lookZone, "look");

sprintBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  audio.unlock();
  state.sprintLatch = !state.sprintLatch;
  state.input.sprint = state.sprintLatch || keys.has("shift");
  sprintBtn.classList.toggle("on", state.sprintLatch);
});

nextBtn.addEventListener("click", () => send({ t: "skip" }));
muteBtn.addEventListener("click", () => {
  audio.unlock();
  const muted = audio.toggle();
  muteBtn.textContent = muted ? "Cisza" : "Dźwięk";
});
window.addEventListener("pointerdown", () => audio.unlock(), { once: false });
window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(map);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.role === "runner" && state.phase === "play" && state.maze) {
    try {
      readKeys(dt);
      const turn = normalizeAngle(state.look - state.body.a);
      const glide = 1 - Math.exp(-dt / 0.034);
      state.body.a = normalizeAngle(state.body.a + turn * (Math.abs(turn) < 0.0004 ? 1 : glide));
      state.input.angle = state.body.a;
      state.acc += dt;
      let steps = 0;
      while (state.acc >= STEP && steps++ < 5) {
        stepExplorer(state.maze, state.body, state.input, STEP);
        state.acc -= STEP;
      }
      if (steps >= 5) state.acc = 0;
      state.poseAcc += dt;
      if (state.poseAcc >= STEP) {
        state.poseAcc = 0;
        send({ t: "pose", x: state.body.x, y: state.body.y, a: state.body.a, sprint: !!state.input.sprint });
      }
    } catch (error) {
      console.error(error);
    }
  }
  try {
    draw(now / 1000);
  } catch (error) {
    console.error(error);
  }
  const snap = state.snaps[state.snaps.length - 1];
  const body = state.role === "runner" ? state.body : snap && snap.ex;
  const sn = snap && snap.sn;
  if (body && sn && (state.phase === "play" || state.phase === "result")) {
    audio.update(dt, {
      dist: Math.hypot(sn.x - body.x, sn.y - body.y),
      state: sn.state,
      moving: state.role === "runner" ? !!state.body.moving : false,
      sprint: state.role === "runner" ? !!state.body.sprint : false,
      role: state.role,
    });
  }
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
connect();
