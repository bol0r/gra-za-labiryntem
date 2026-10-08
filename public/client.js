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
const deck = document.getElementById("deck");
const listenBtn = document.getElementById("listen");
const knockBtn = document.getElementById("knock");
const quitBtn = document.getElementById("quit");
const intro = document.getElementById("intro");
const introLines = document.getElementById("intro-lines");
const introGo = document.getElementById("intro-go");
const smoke = document.getElementById("smoke");
const hint = document.getElementById("hint");
const toast = document.getElementById("toast");
const muteBtn = document.getElementById("mute");
const fullBtn = document.getElementById("full");
const padNote = document.getElementById("pad-note");
const padHelp = document.getElementById("pad-help");
const waitbanner = document.getElementById("waitbanner");
const waitText = document.getElementById("wait-text");
const result = document.getElementById("result");
const scoreForm = document.getElementById("score-form");
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
  scores: null,
};

const SHELL = new Set(["boot", "intro", "menu", "story", "credits", "scores", "home", "lobby"]);

const narrow = window.matchMedia("(max-width: 800px)").matches;
const queryCode = (new URLSearchParams(location.search).get("pokoj") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
let hostLine = "";

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
  const menu = SHELL.has(phase);
  screen.classList.toggle("is-menu", menu);
  screen.classList.toggle("is-game", !menu);
  screen.dataset.phase = phase;
  screen.dataset.role = state.role || "";
  lobby.classList.toggle("is-off", !menu || phase === "intro");
  intro.hidden = phase !== "intro";
  const playing = phase === "play" && state.role === "runner";
  touch.hidden = !playing;
  deck.hidden = !playing;
  quitBtn.hidden = phase !== "play";
  if (!playing) {
    stick.hidden = true;
    state.input.forward = 0;
    state.input.strafe = 0;
  }
  if (menu) hint.hidden = true;
  result.classList.toggle("is-off", phase !== "result");
  waitbanner.classList.toggle("is-off", phase !== "wait");
  syncPadUi();
  resize();
}

function fillPlate(key, html) {
  if (plate.dataset.paint !== key) {
    plate.dataset.paint = key;
    plate.classList.add("is-swap");
    plate.innerHTML = html;
    requestAnimationFrame(() => requestAnimationFrame(() => plate.classList.remove("is-swap")));
    return;
  }
  plate.innerHTML = html;
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

function paintMenu() {
  fillPlate("menu", `
    <p class="kicker">Planeta bez nazwy</p>
    <h1>Za labiryntem</h1>
    <div class="menu-list">
      <button type="button" data-act="play">Graj</button>
      <button type="button" data-act="story">Fabuła</button>
      <button type="button" data-act="scores">Tablica</button>
      <button type="button" data-act="credits">Twórcy</button>
    </div>
    <p class="host">${hostLine ? `Drugi ekran: ${hostLine}` : "Zostańcie na tym komputerze."}</p>
  `);
  paintPadFocus();
}

function paintStory() {
  fillPlate("story", `
    <p class="kicker">Fabuła</p>
    <h1>Ruina</h1>
    <p class="lead">Ruina nie ma nazwy. Stoi na planecie, której nikt nie ochrzcił.</p>
    <p>Jedno z was zostaje przy mapie i widzi strażnika. Drugie schodzi w ciemność z latarnią.</p>
    <p>Na końcu komory bije serce. Dotknijcie go, a ruina puści was dalej.</p>
    <p>Strażnik obchodzi korytarze. Bieg słyszy przez ściany. Stanie w miejscu czyni was cichymi.</p>
    <p>Głos zostawcie sobie. Mapa mówi krótkimi znakami.</p>
    <div class="menu-list"><button type="button" data-act="back">Wróć</button></div>
  `);
  paintPadFocus();
}

function paintCredits() {
  fillPlate("credits", `
    <p class="kicker">Twórcy</p>
    <h1>Za labiryntem</h1>
    <ul class="credits">
      <li>Dead Net</li>
      <li>Aleksander Bielecki</li>
      <li>Claude</li>
      <li>Grok</li>
    </ul>
    <p class="powered">powered by Cursor</p>
    <p class="kicker">Testerzy</p>
    <ul class="credits">
      <li>Mariusz B.</li>
      <li>Bartek M.</li>
    </ul>
    <div class="menu-list"><button type="button" data-act="back">Wróć</button></div>
  `);
  paintPadFocus();
}

function clock(total) {
  const safe = Math.max(0, total || 0);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function paintScores() {
  const rows = state.scores
    ? state.scores.map((row) => `<li>${row.name} · ${clock(row.time)} · komora ${row.chambers}</li>`).join("") || "<li>Pusto.</li>"
    : "<li>Ładuję.</li>";
  fillPlate("scores", `
    <p class="kicker">Tablica</p>
    <h1>Przeszli</h1>
    <ul class="board">${rows}</ul>
    <div class="menu-list"><button type="button" data-act="back">Wróć</button></div>
  `);
  paintPadFocus();
}

async function loadScores() {
  try {
    const res = await fetch("/tablica");
    const data = await res.json();
    state.scores = data.scores || [];
  } catch {
    state.scores = [];
  }
  if (state.phase === "scores") paintScores();
}

function paintHome() {
  const where = narrow ? "Tu naturalnie schodzi się z latarnią." : "Tu naturalnie zostaje się przy mapie.";
  fillPlate("home", `
    <p class="kicker">Graj</p>
    <h1>Komora</h1>
    <p class="lead">Jedno przy mapie. Drugie z latarnią.</p>
    <div class="roles">
      <button type="button" data-act="create" data-role="guide">Przy mapie<small>Widzi całość.</small></button>
      <button type="button" data-act="create" data-role="runner">Z latarnią<small>Ma tylko światło.</small></button>
    </div>
    <form class="join" data-act="join">
      <input name="code" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="KOD" value="${queryCode && !state.code ? queryCode : ""}" aria-label="Kod komory">
      <button class="solid" type="submit">Wejdź</button>
    </form>
    <p class="err" id="err">${state.err || ""}</p>
    <p class="host">${hostLine ? `Drugi ekran: ${hostLine}` : "Zostańcie na tym komputerze."}</p>
    <p class="fine">${where} Ten sam Wi-Fi.</p>
    <div class="menu-list"><button type="button" data-act="back">Menu</button></div>
  `);
  paintPadFocus();
}

function paintLobby() {
  const roleName = state.role === "runner" ? "Latarnik" : "Kartograf";
  const code = (state.code || "").split("").join(" ");
  const urls = (state.urls || []).map((url) => `<div class="urls">${url}</div>`).join("");
  const waiting = !state.both;
  fillPlate(waiting ? "lobby-wait" : "lobby-ready", `
    <p class="kicker">${roleName}</p>
    <h1 class="code" aria-label="Kod ${state.code || ""}">${code}</h1>
    <p class="dictate">Czytaj po jednej literze.</p>
    ${state.qr ? `<img class="qr" alt="Kod QR komory ${state.code}" src="${state.qr}">` : ""}
    <p class="wait ${waiting ? "is-waiting" : "is-ready"}">${waiting ? "Czekam na drugą osobę." : "Można schodzić."}</p>
    ${urls}
    <p class="fine">Ten sam Wi-Fi.</p>
    <div class="roles">
      <button class="solid" type="button" data-act="start" ${state.both ? "" : "disabled"}>Zejdźcie</button>
      <button class="ghost" type="button" data-act="leave">Opuść</button>
    </div>
    <p class="err" id="err">${state.err || ""}</p>
  `);
  paintPadFocus();
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
    <div class="unit">
      <p class="kicker">Ruina ${state.round}</p>
      <h2 id="sent-state" data-state="patrol">Obchód</h2>
      <p id="wake-state" class="fine">Cisza</p>
      <p id="seal-count">Pieczęcie 2</p>
    </div>
    <div class="call-row">
      ${plate("stop", "Stój", "1")}
      ${plate("quiet", "Cicho", "2")}
      ${plate("run", "Biegnij", "3")}
      ${plate("left", "Lewo", "4")}
      ${plate("right", "Prawo", "5")}
      <button id="veil-btn" type="button" data-act="veil" style="--veil-p: 1"><span id="veil-fill"></span><span id="veil-label">Zasłona</span></button>
    </div>
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
      else label.textContent = "Zasłona";
    }
    veil.disabled = snap.veilCd > 0;
  }
  const seals = panel.querySelector("#seal-count");
  if (seals) seals.textContent = `Pieczęcie ${snap.sealCharges}`;
}

function showCall(id) {
  const words = { stop: "Stój", quiet: "Cicho", run: "Biegnij", left: "Lewo", right: "Prawo", knock: "Stuk" };
  toast.textContent = words[id] || "";
  toast.classList.add("show");
  clearTimeout(showCall.timer);
  showCall.timer = setTimeout(() => toast.classList.remove("show"), 1500);
  if (state.role === "runner" && navigator.vibrate) navigator.vibrate(18);
}

function showResult(snap) {
  const on = snap.phase === "result";
  result.classList.toggle("is-off", !on);
  if (!on) {
    screen.classList.remove("flash-win", "flash-lose");
    return;
  }
  const win = snap.result === "win";
  resultKicker.textContent = win ? "Serce" : "Strażnik";
  resultTitle.textContent = win ? "Ruina was puszcza." : "Strażnik was ma.";
  resultTime.textContent = `${clock(snap.roundT)} w ruinie`;
  scoreForm.hidden = !win;
  nextBtn.textContent = snap.nextIn > 0.2 ? `Dalej · ${Math.ceil(snap.nextIn)}` : "Dalej";
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
      if (hint.textContent.startsWith("Lewa strona")) hint.hidden = true;
    }, 14000);
    settleHint();
  }
}

function onSnap(msg) {
  if (msg.seals && state.maze) applySeals(state.maze, msg.seals);
  state.sealCharges = msg.sealCharges;
  state.snaps.push({ ...msg, at: performance.now() });
  if (state.snaps.length > 14) state.snaps.shift();
  if (msg.fx) {
    for (const name of msg.fx) {
      audio.play(name);
      if (name === "knock" && state.role === "guide") showCall("knock");
    }
  }
  if (msg.call && (!state.lastCall || msg.call.id !== state.lastCall.id || msg.call.ttl > state.lastCall.ttl + 0.2)) {
    if (state.role === "runner") showCall(msg.call.id);
  }
  state.lastCall = msg.call;
  if (msg.phase && msg.phase !== state.phase && (msg.phase === "play" || msg.phase === "result" || msg.phase === "wait")) {
    setPhase(msg.phase);
  }
  if (msg.phase === "result") {
    showResult(msg);
    if (msg.result === "lose" && feltResult !== "lose" && state.role === "runner") {
      if (navigator.vibrate) navigator.vibrate(180);
      rumble(220, 0.9, 0.5);
    }
    feltResult = msg.result || "";
  } else if (msg.phase) {
    result.classList.add("is-off");
    screen.classList.remove("flash-win", "flash-lose");
    feltResult = "";
  }
  if (msg.phase === "wait") {
    waitbanner.classList.remove("is-off");
    waitText.textContent = msg.note || "Ktoś zniknął.";
  } else if (msg.phase) waitbanner.classList.add("is-off");
  if (state.role === "runner" && state.phase === "play") {
    if (msg.immunity > 0.2) {
      hint.hidden = false;
      hint.textContent = "Cisza.";
    } else if (hint.textContent.startsWith("Strażnik")) hint.textContent = controlHint();
    settleHint();
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
  return fine ? "WASD, strzałki, Shift. N: nasłuch. K: stuk." : "Lewa strona: krok. Prawa: wzrok.";
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

const PAD_DEAD = 0.2;
let padOn = false;
let turnRate = 0;
let focusI = 0;
let feltResult = "";
let rumbleAt = 0;
const padDown = [];
const dirHold = { up: 0, down: 0, left: 0, right: 0 };

function axis1(v) {
  const a = Math.abs(v);
  if (a < PAD_DEAD) return 0;
  return Math.sign(v) * Math.min(1, (a - PAD_DEAD) / (1 - PAD_DEAD));
}

function stick2(x, y) {
  const mag = Math.hypot(x, y);
  if (mag < PAD_DEAD) return { x: 0, y: 0 };
  const scaled = Math.min(1, (mag - PAD_DEAD) / (1 - PAD_DEAD));
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

function activePad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of list) if (pad && pad.connected) return pad;
  return null;
}

function buttonOn(pad, i) {
  const button = pad.buttons && pad.buttons[i];
  return !!(button && (button.pressed || button.value > 0.45));
}

function buttonEdge(pad, i) {
  const on = buttonOn(pad, i);
  const was = !!padDown[i];
  padDown[i] = on;
  return on && !was;
}

function rumble(ms, strong, weak) {
  const pad = activePad();
  const act = pad && (pad.vibrationActuator || (pad.hapticActuators && pad.hapticActuators[0]));
  if (!act || !act.playEffect) return;
  try {
    const done = act.playEffect("dual-rumble", {
      startDelay: 0,
      duration: ms,
      strongMagnitude: strong,
      weakMagnitude: weak,
    });
    if (done && done.catch) done.catch(() => {});
  } catch {
    // pad bez wibracji
  }
}

function toggleFull() {
  const el = document.documentElement;
  const on = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (on) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    } else {
      const ask = el.requestFullscreen || el.webkitRequestFullscreen;
      if (ask) Promise.resolve(ask.call(el)).catch(() => {});
    }
  } catch {
    // pełny ekran bywa zablokowany poza gestem
  }
}

function syncFullLabel() {
  const on = document.fullscreenElement || document.webkitFullscreenElement;
  fullBtn.textContent = on ? "Okno" : "Pełny ekran";
}

function focusables() {
  if (state.phase === "intro") return [introGo, document.getElementById("intro-skip")].filter((el) => el && !el.hidden);
  if (state.phase === "result") return [...result.querySelectorAll("button, input"), fullBtn, muteBtn].filter((el) => el && !el.disabled && !el.hidden);
  if (!SHELL.has(state.phase) || state.phase === "boot" || state.phase === "intro") return [];
  return [...plate.querySelectorAll("button, input"), fullBtn, muteBtn].filter((el) => el && !el.disabled);
}

function paintPadFocus() {
  document.querySelectorAll(".is-pad").forEach((el) => el.classList.remove("is-pad"));
  if (!padOn) return;
  const list = focusables();
  if (!list.length) return;
  focusI = ((focusI % list.length) + list.length) % list.length;
  list[focusI].classList.add("is-pad");
}

function moveFocus(step) {
  const list = focusables();
  if (!list.length) return;
  focusI = (focusI + step + list.length) % list.length;
  paintPadFocus();
}

function activateFocus() {
  const list = focusables();
  if (!list.length) return;
  const el = list[((focusI % list.length) + list.length) % list.length];
  audio.unlock();
  if (el instanceof HTMLInputElement) {
    el.focus();
    return;
  }
  el.click();
}

function padSheetOn() {
  return padOn && state.role === "runner" && (state.phase === "play" || state.phase === "result");
}

function settleHint() {
  const keyboard = hint.textContent.startsWith("WASD") || hint.textContent.startsWith("Lewa strona");
  if (!keyboard) return;
  hint.hidden = padSheetOn();
}

function syncPadUi() {
  padNote.hidden = !padOn;
  const showHelp = padSheetOn();
  padHelp.hidden = !showHelp;
  if (showHelp) {
    padHelp.textContent = state.phase === "result"
      ? "Lewa gałka: krok. Prawa: wzrok. RT lub A: bieg. X: wyciszenie. Y: pełny ekran. Menu: następna komora."
      : "Lewa gałka: krok. Prawa: wzrok. RT lub A: bieg. X: wyciszenie. Y: pełny ekran.";
  }
  settleHint();
}

function dirPulse(name, down, dt) {
  if (!down) {
    dirHold[name] = 0;
    return false;
  }
  if (dirHold[name] === 0) {
    dirHold[name] = 0.01;
    return true;
  }
  dirHold[name] += dt;
  if (dirHold[name] >= 0.42) {
    dirHold[name] = 0.24;
    return true;
  }
  return false;
}

function readPad(dt) {
  const pad = activePad();
  const nextOn = !!pad;
  if (nextOn !== padOn) {
    padOn = nextOn;
    turnRate = 0;
    if (pad) for (let i = 0; i < 16; i++) padDown[i] = buttonOn(pad, i);
    else padDown.length = 0;
    syncPadUi();
    if (padOn) paintPadFocus();
    else document.querySelectorAll(".is-pad").forEach((el) => el.classList.remove("is-pad"));
  }
  if (!pad) return;
  const menu = SHELL.has(state.phase) || state.phase === "result";
  if (menu) {
    if (dirPulse("up", buttonOn(pad, 12), dt) || dirPulse("left", buttonOn(pad, 14), dt)) moveFocus(-1);
    if (dirPulse("down", buttonOn(pad, 13), dt) || dirPulse("right", buttonOn(pad, 15), dt)) moveFocus(1);
    if (buttonEdge(pad, 0)) activateFocus();
  } else {
    for (const name of Object.keys(dirHold)) dirHold[name] = 0;
    buttonEdge(pad, 0);
  }
  if (buttonEdge(pad, 2)) muteBtn.click();
  if (buttonEdge(pad, 3)) toggleFull();
  if (buttonEdge(pad, 9) && state.phase === "result") nextBtn.click();
  if (!(state.role === "runner" && state.phase === "play")) {
    turnRate = 0;
    return;
  }
  const axes = pad.axes || [];
  const move = stick2(axes[0] || 0, axes[1] || 0);
  if (move.x || move.y) {
    state.input.forward = -move.y;
    state.input.strafe = move.x;
  }
  const rx = axis1(axes[2] || 0);
  const target = Math.sign(rx) * rx * rx * 2.4;
  turnRate += (target - turnRate) * (1 - Math.exp(-dt / 0.09));
  if (Math.abs(turnRate) > 0.0001) state.look = normalizeAngle(state.look + turnRate * dt);
  const sprint = buttonOn(pad, 7) || buttonOn(pad, 0);
  if (sprint) state.input.sprint = true;
  sprintBtn.classList.toggle("on", state.sprintLatch || sprint || keys.has("shift"));
}

function feelGuardian(dt, dist) {
  if (!(state.role === "runner" && state.phase === "play")) return;
  if (dist >= 3.4) {
    rumbleAt = 0;
    return;
  }
  rumbleAt -= dt;
  if (rumbleAt > 0) return;
  rumbleAt = dist < 1.6 ? 0.32 : 0.6;
  const mag = clamp((3.4 - dist) / 3.4, 0.25, 0.75);
  rumble(80, mag, mag * 0.55);
}

const PIXEL_STEPS = [1, 0.8, 0.64, 0.5];
let pixelStep = 0;
const frameSamples = [];
let scaleHold = 0;

function pixelBudget() {
  if (state.role === "runner" && (state.phase === "play" || state.phase === "result")) return PIXEL_STEPS[pixelStep];
  return 1;
}

function resize() {
  const rect = map.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const budget = pixelBudget();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const nextW = Math.max(1, Math.round(cssW * dpr * budget));
  const nextH = Math.max(1, Math.round(cssH * dpr * budget));
  if (stage.width !== nextW || stage.height !== nextH) {
    stage.width = nextW;
    stage.height = nextH;
  }
  stage._cssW = cssW;
  stage._cssH = cssH;
  stage._dpr = dpr;
  stage._px = nextW / cssW;
  stage._budget = budget;
}

function watchFrames(dt) {
  const runner = state.role === "runner" && (state.phase === "play" || state.phase === "result");
  if (!runner) {
    frameSamples.length = 0;
    if (pixelStep !== 0) {
      pixelStep = 0;
      resize();
    }
    return;
  }
  if (state.phase !== "play" || document.hidden) return;
  if (dt < 0.0004) return;
  scaleHold = Math.max(0, scaleHold - 1 / 60);
  frameSamples.push(dt);
  if (frameSamples.length > 40) frameSamples.shift();
  if (frameSamples.length < 24 || scaleHold > 0) return;
  let sum = 0;
  for (const sample of frameSamples) sum += sample;
  const avg = sum / frameSamples.length;
  if (avg > 0.012 && pixelStep < PIXEL_STEPS.length - 1) {
    pixelStep += 1;
    frameSamples.length = 0;
    scaleHold = 1.8;
    resize();
  } else if (avg < 0.006 && pixelStep > 0) {
    pixelStep -= 1;
    frameSamples.length = 0;
    scaleHold = 2.6;
    resize();
  }
}

function draw(time) {
  const ctx = stage.getContext("2d");
  const cssW = stage._cssW || 1;
  const cssH = stage._cssH || 1;
  const dpr = stage._dpr || 1;
  if (SHELL.has(state.phase)) {
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
    ctx.setTransform(stage._px || dpr, 0, 0, stage._px || dpr, 0, 0);
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
    else if (state.phase === "boot") startIntro();
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === "joined") onJoined(msg);
    else if (msg.t === "lobby") {
      state.both = !!msg.both;
      state.qr = msg.qr || state.qr;
      state.urls = msg.urls || state.urls;
      if (msg.role) state.role = msg.role;
      if (state.phase === "menu" || state.phase === "intro" || state.phase === "story" || state.phase === "credits" || state.phase === "scores") return;
      setPhase("lobby");
      paintLobby();
    } else if (msg.t === "scores") {
      state.scores = msg.scores || [];
      const submit = scoreForm.querySelector("button");
      if (submit) submit.textContent = "Jest";
      if (state.phase === "scores") paintScores();
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
        state.role = "";
        state.code = "";
        setPhase("menu");
        paintMenu();
      }
      setErr(msg.text);
    }
  };
  ws.onclose = () => {
    if (!SHELL.has(state.phase)) setErr("Łączę znowu.");
    setTimeout(connect, 900);
  };
}

lobby.addEventListener("click", (event) => {
  if (event.target.closest("h1") || event.target.closest("li")?.textContent === "Dead Net") noteTap();
  const btn = event.target.closest("[data-act]");
  if (!btn || btn.dataset.act === "join") return;
  audio.unlock();
  if (btn.dataset.act === "play") {
    setPhase("home");
    paintHome();
  }
  if (btn.dataset.act === "story") {
    setPhase("story");
    paintStory();
  }
  if (btn.dataset.act === "credits") {
    setPhase("credits");
    paintCredits();
  }
  if (btn.dataset.act === "scores") {
    setPhase("scores");
    paintScores();
    loadScores();
  }
  if (btn.dataset.act === "back") {
    setPhase("menu");
    paintMenu();
  }
  if (btn.dataset.act === "create") send({ t: "create", role: btn.dataset.role });
  if (btn.dataset.act === "start") send({ t: "start" });
  if (btn.dataset.act === "leave") goMenu();
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
  if (event.key === "Escape") {
    if (state.phase === "play" || state.phase === "wait" || state.phase === "result") goMenu();
    else if (state.phase !== "menu" && state.phase !== "intro" && state.phase !== "boot") {
      setPhase("menu");
      paintMenu();
    }
    return;
  }
  if (state.role === "runner" && state.phase === "play" && !event.repeat) {
    if (event.key.toLowerCase() === "n") doListen();
    if (event.key.toLowerCase() === "k") doKnock();
  }
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
  muteBtn.textContent = muted ? "Dźwięk" : "Wycisz";
});
fullBtn.addEventListener("click", () => {
  audio.unlock();
  toggleFull();
});
document.addEventListener("fullscreenchange", syncFullLabel);
document.addEventListener("webkitfullscreenchange", syncFullLabel);
history.pushState({ za: 1 }, "", location.href);
window.addEventListener("popstate", () => history.pushState({ za: 1 }, "", location.href));
window.addEventListener("keydown", (event) => {
  if (event.key === "GamepadB" || event.keyCode === 196) event.preventDefault();
}, true);
window.addEventListener("pointerdown", () => audio.unlock(), { once: false });
window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(map);

let last = performance.now();
function frame(now) {
  const t0 = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const playing = state.role === "runner" && state.phase === "play" && state.maze;
  if (playing) {
    try {
      readKeys(dt);
    } catch (error) {
      console.error(error);
    }
  }
  try {
    readPad(dt);
  } catch (error) {
    console.error(error);
  }
  if (playing) {
    try {
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
    if (state.role === "runner" && state.phase === "play") feelGuardian(dt, Math.hypot(sn.x - body.x, sn.y - body.y));
  }
  watchFrames((performance.now() - t0) / 1000);
  requestAnimationFrame(frame);
}

async function loadHost() {
  try {
    const res = await fetch("/siec");
    const data = await res.json();
    const url = data.urls && data.urls[0];
    hostLine = url ? url.replace(/^https?:\/\//, "") : "";
  } catch {
    hostLine = "";
  }
  if (state.phase === "home") paintHome();
  if (state.phase === "menu") paintMenu();
}

const STORY_LINES = [
  "Ruina nie ma nazwy.",
  "Jedno z was trzyma mapę.",
  "Drugie schodzi z latarnią.",
  "Na końcu bije serce.",
  "W korytarzach chodzi strażnik.",
];
let introTimers = [];
let titleTaps = 0;

function clearIntro() {
  introTimers.forEach((id) => clearTimeout(id));
  introTimers = [];
}

function finishIntro() {
  clearIntro();
  setPhase("menu");
  paintMenu();
}

function startIntro() {
  clearIntro();
  setPhase("intro");
  introLines.replaceChildren();
  introGo.hidden = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  STORY_LINES.forEach((line, index) => {
    const add = () => {
      const row = document.createElement("p");
      row.className = "intro-line";
      row.textContent = line;
      introLines.appendChild(row);
    };
    if (reduced) add();
    else introTimers.push(setTimeout(add, 700 + index * 1000));
  });
  const showGo = () => {
    introGo.hidden = false;
    paintPadFocus();
  };
  if (reduced) showGo();
  else introTimers.push(setTimeout(showGo, 700 + STORY_LINES.length * 1000));
}

function goMenu() {
  sessionStorage.removeItem(STORAGE);
  send({ t: "leave" });
  state.role = "";
  state.code = "";
  state.token = "";
  state.maze = null;
  state.both = false;
  state.err = "";
  screen.dataset.role = "";
  setPhase("menu");
  paintMenu();
}

function flash(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => toast.classList.remove("show"), 1200);
}

function doListen() {
  if (listenBtn.disabled || state.role !== "runner" || state.phase !== "play") return;
  audio.unlock();
  const snap = state.snaps[state.snaps.length - 1];
  const sn = snap && snap.sn;
  if (!sn) {
    flash("Cicho");
    return;
  }
  const dx = sn.x - state.body.x;
  const dy = sn.y - state.body.y;
  const dist = Math.hypot(dx, dy);
  const rel = normalizeAngle(Math.atan2(dy, dx) - state.body.a);
  const side = Math.abs(rel) < 0.45 ? "Przed wami" : Math.abs(rel) > 2.3 ? "Za wami" : rel > 0 ? "Z prawej" : "Z lewej";
  const near = dist < 2.4 ? "Tuż obok" : dist < 5.5 ? "Blisko" : "Daleko";
  flash(`${near}. ${side}`);
  audio.hear(Math.max(-1, Math.min(1, rel / 1.4)), dist);
  listenBtn.disabled = true;
  setTimeout(() => {
    listenBtn.disabled = false;
  }, 4000);
}

function doKnock() {
  if (knockBtn.disabled || state.role !== "runner" || state.phase !== "play") return;
  audio.unlock();
  send({ t: "knock" });
  knockBtn.disabled = true;
  setTimeout(() => {
    knockBtn.disabled = false;
  }, 4500);
}

function noteTap() {
  if (!["menu", "story", "credits"].includes(state.phase)) return;
  titleTaps += 1;
  clearTimeout(noteTap.timer);
  noteTap.timer = setTimeout(() => {
    titleTaps = 0;
  }, 1600);
  if (titleTaps < 5) return;
  titleTaps = 0;
  audio.unlock();
  audio.bubble();
  smoke.hidden = false;
  smoke.classList.remove("is-on");
  void smoke.offsetWidth;
  smoke.classList.add("is-on");
  clearTimeout(noteTap.smoke);
  noteTap.smoke = setTimeout(() => {
    smoke.hidden = true;
    smoke.classList.remove("is-on");
  }, 2600);
}

intro.addEventListener("click", () => audio.unlock());
introGo.addEventListener("click", () => finishIntro());
document.getElementById("intro-skip").addEventListener("click", () => finishIntro());
quitBtn.addEventListener("click", () => goMenu());
document.getElementById("wait-menu").addEventListener("click", () => goMenu());
document.getElementById("quit-result").addEventListener("click", () => goMenu());
listenBtn.addEventListener("click", () => doListen());
knockBtn.addEventListener("click", () => doKnock());
scoreForm.addEventListener("submit", (event) => {
  event.preventDefault();
  audio.unlock();
  const name = scoreName().trim();
  if (!name) return;
  send({ t: "score", name });
});

function scoreName() {
  return document.getElementById("score-name").value || "";
}

resize();
requestAnimationFrame(frame);
loadHost();
connect();
