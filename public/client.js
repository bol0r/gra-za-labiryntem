import { createAudio } from "/audio.js";
import { INTRO_ENTER_MS, paintIntroFrame } from "/intro.js";
import { drawBeacon, drawExplorer, drawGuide, drawLobby, drawVignette, hdActive, setHdEnabled } from "/render.js";
import { applySeals, clamp, lerpAngle, normalizeAngle, stepExplorer } from "/shared/sim.js";

const STORAGE = "za-labiryntem";
const STEP = 1 / 20;
const screen = document.getElementById("screen");
const lobby = document.getElementById("lobby");
const plate = document.getElementById("plate");
const panel = document.getElementById("panel");
const mapChrome = document.getElementById("map-chrome");
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
const help = document.getElementById("help");
const helpCard = document.getElementById("help-card");
const helpOpen = document.getElementById("help-open");
const intro = document.getElementById("intro");
const introStage = document.getElementById("intro-stage");
const introGo = document.getElementById("intro-go");
const smoke = document.getElementById("smoke");
const hint = document.getElementById("hint");
const toast = document.getElementById("toast");
const optLayer = document.getElementById("opt-layer");
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
function prefBool(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value == null) return fallback;
    return value === "1";
  } catch {
    return fallback;
  }
}

function prefNum(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value == null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
  } catch {
    return fallback;
  }
}

function storePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // prywatna przeglądarka
  }
}

const audio = createAudio({ volume: prefNum("zl-vol", 80), muted: prefBool("zl-mute", false) });
setHdEnabled(prefBool("zl-hd", true));
let optionsOverPlay = false;
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

const SHELL = new Set(["boot", "intro", "menu", "options", "story", "credits", "scores", "home", "lobby"]);

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
  if (optionsOverPlay && phase !== "play") {
    optionsOverPlay = false;
    optLayer.hidden = true;
    optLayer.innerHTML = "";
  }
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
  const runnerHud = document.getElementById("runner-hud");
  if (runnerHud) runnerHud.hidden = !playing;
  if (!playing) screen.classList.remove("is-near", "is-warn");
  quitBtn.hidden = phase !== "play" || state.role === "guide";
  const shellChrome = phase === "boot" || phase === "intro" || phase === "menu" || phase === "home" || phase === "options" || phase === "story" || phase === "credits" || phase === "scores";
  fullBtn.hidden = shellChrome || playing;
  syncMenuBg();
  if (mapChrome) mapChrome.hidden = !(state.role === "guide" && !menu);
  if (!playing) {
    stick.hidden = true;
    state.input.forward = 0;
    state.input.strafe = 0;
  }
  if (menu) hint.hidden = true;
  result.classList.toggle("is-off", phase !== "result");
  waitbanner.classList.toggle("is-off", phase !== "wait");
  syncPadUi();
  if (help && phase !== "play" && phase !== "wait" && phase !== "result") {
    help.classList.add("is-off");
    help.hidden = true;
  }
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

const MENU_ITEMS = [
  ["play", "Graj", "Dwoje agentów, jedno zejście"],
  ["options", "Opcje", "Obraz i dźwięk"],
  ["story", "Teczka", "Co wiemy o ruinie"],
  ["scores", "Zejścia", "Dwanaście najgłębszych"],
  ["credits", "Twórcy", "Dead Net Lab"],
];

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function hostFoot() {
  const host = hostLine ? `Drugi ekran: <b>${esc(hostLine)}</b>` : "Zostańcie przy tym komputerze.";
  return `
    <div class="menu-foot">
      <div class="pad-hints"><span><i class="pad-a">A</i>Wybierz</span><span><i class="pad-b">B</i>Wróć</span></div>
      <p class="host">${host}</p>
    </div>`;
}

function recordHtml() {
  const row = state.scores && state.scores[0];
  const body = !state.scores
    ? `<h3>Czytam teczkę.</h3>`
    : !row
      ? `<h3>Nikt jeszcze nie zszedł.</h3>`
      : `<h3>${esc(row.name)}</h3>
        <dl>
          <div><dt>Komora</dt><dd>${esc(row.chambers)}</dd></div>
          <div><dt>Czas</dt><dd>${esc(clock(row.time))}</dd></div>
          <div><dt>Punkty</dt><dd>${esc(row.points || 0)}</dd></div>
        </dl>`;
  return `<aside class="record" id="best-record"><p class="kicker">Najgłębiej</p>${body}</aside>`;
}

function paintRecord() {
  const box = plate.querySelector("#best-record");
  if (!box) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = recordHtml();
  box.replaceWith(wrap.firstElementChild);
}

function syncMenuBg() {
  screen.classList.toggle("is-hd", hdActive());
  const bg = document.getElementById("menu-bg");
  if (!bg) return;
  const show = hdActive() && SHELL.has(state.phase) && state.phase !== "intro" && state.phase !== "boot";
  bg.hidden = !show;
}

function paintMenu() {
  if (plate.dataset.paint === "menu" && plate.querySelector(".menu-title")) {
    paintRecord();
    const host = plate.querySelector(".menu-foot .host");
    if (host) host.innerHTML = hostLine ? `Drugi ekran: <b>${esc(hostLine)}</b>` : "Zostańcie przy tym komputerze.";
    paintPadFocus();
    if (!state.scores) loadScores();
    return;
  }
  focusI = 0;
  const items = MENU_ITEMS.map(([act, name, sub]) => `
    <button type="button" class="menu-item" data-act="${act}"><i></i><span>${name}</span><small>${sub}</small></button>
  `).join("");
  fillPlate("menu", `
    <div class="main-menu">
      <div class="menu-col">
        <p class="kicker">Sprawa 110 · Planeta bez nazwy</p>
        <h1 class="menu-title">Za labiryntem</h1>
        <div class="menu-items">${items}</div>
      </div>
      ${recordHtml()}
      ${hostFoot()}
    </div>
  `);
  paintPadFocus();
  if (!state.scores) loadScores();
}

function optionsMarkup(leave) {
  const hd = prefBool("zl-hd", true);
  const vol = audio.volumePercent();
  const sound = !audio.muted;
  return `
    <div class="opt-plate" role="dialog" aria-label="Opcje">
      <p class="kicker">Opcje</p>
      <h2>Obraz i dźwięk</h2>
      <div class="opt-row">
        <div><b>Tekstury HD</b><p>Kamień, niebo i planeta w wysokiej rozdzielczości. Na słabszym telefonie wyłącz.</p></div>
        <button class="opt-toggle" type="button" role="switch" aria-checked="${hd ? "true" : "false"}" aria-label="Tekstury HD" data-act="opt-hd"></button>
      </div>
      <div class="opt-row">
        <div><b>Głośność</b><p>Dron, kroki, zawołania i strażnik.</p></div>
        <div class="opt-slider">
          <input data-act="opt-vol" type="range" min="0" max="100" value="${vol}" aria-label="Głośność">
          <output data-out="vol">${vol}</output>
        </div>
      </div>
      <div class="opt-row">
        <div><b>Dźwięk</b><p>Wyłączony zachowuje ustawioną głośność. Skrót: M albo X na padzie.</p></div>
        <button class="opt-toggle" type="button" role="switch" aria-checked="${sound ? "true" : "false"}" aria-label="Dźwięk" data-act="opt-sound"></button>
      </div>
      <div class="opt-back">
        <div class="opt-pad"><span><i class="pad-a">A</i>Zmień</span><span><i class="pad-b">B</i>Wróć</span></div>
        <div class="opt-actions">
          ${leave ? `<button class="opt-leave" type="button" data-act="opt-leave">Na górę</button>` : ""}
          <button class="stone-btn" type="button" data-act="opt-back">Wróć</button>
        </div>
      </div>
    </div>
  `;
}

function syncVolUi(input) {
  input.style.setProperty("--v", `${input.value}%`);
  const out = input.parentElement && input.parentElement.querySelector("[data-out=vol]");
  if (out) out.textContent = input.value;
}

function paintOptions(root, leave) {
  const html = optionsMarkup(leave);
  if (root === plate) fillPlate("options", html);
  else root.innerHTML = html;
  const vol = root.querySelector("[data-act=opt-vol]");
  if (vol) {
    syncVolUi(vol);
    vol.addEventListener("focus", () => {
      const list = focusables();
      const index = list.indexOf(vol);
      if (index < 0) return;
      focusI = index;
      paintPadFocus();
    });
  }
  root.querySelectorAll(".opt-row").forEach((row) => {
    row.addEventListener("pointerenter", () => {
      const control = row.querySelector("button, input");
      const list = focusables();
      const index = list.indexOf(control);
      if (index < 0) return;
      focusI = index;
      paintPadFocus();
    });
  });
}

function openOptions() {
  const during = state.phase === "play" || state.phase === "wait" || state.phase === "result";
  if (during) {
    optionsOverPlay = true;
    state.input.forward = 0;
    state.input.strafe = 0;
    state.input.sprint = false;
    sprintBtn.classList.remove("on");
    optLayer.hidden = false;
    paintOptions(optLayer, true);
  } else {
    optionsOverPlay = false;
    optLayer.hidden = true;
    setPhase("options");
    paintOptions(plate, false);
  }
  focusI = 0;
  paintPadFocus();
}

function closeOptions() {
  if (optionsOverPlay) {
    optionsOverPlay = false;
    optLayer.hidden = true;
    optLayer.innerHTML = "";
    focusI = 0;
    paintPadFocus();
    return;
  }
  if (state.phase === "options") {
    setPhase("menu");
    paintMenu();
  }
}

function onVolumeInput(input) {
  audio.setVolume(Number(input.value));
  storePref("zl-vol", String(audio.volumePercent()));
  audio.unlock();
  syncVolUi(input);
}

function adjustVolume(delta) {
  const next = Math.max(0, Math.min(100, audio.volumePercent() + delta));
  audio.setVolume(next);
  storePref("zl-vol", String(audio.volumePercent()));
  audio.unlock();
  const input = (optionsRoot() || document).querySelector("[data-act=opt-vol]");
  if (!input) return;
  input.value = String(audio.volumePercent());
  syncVolUi(input);
}

function syncSoundSwitch() {
  const btn = document.querySelector("[data-act=opt-sound]");
  if (btn) btn.setAttribute("aria-checked", audio.muted ? "false" : "true");
}

function toggleMute() {
  audio.unlock();
  audio.toggle();
  storePref("zl-mute", audio.muted ? "1" : "0");
  syncSoundSwitch();
  syncGuideMute();
}

function toggleHd(btn) {
  const on = btn.getAttribute("aria-checked") !== "true";
  btn.setAttribute("aria-checked", on ? "true" : "false");
  storePref("zl-hd", on ? "1" : "0");
  setHdEnabled(on);
  resize();
}

function paintStory() {
  fillPlate("story", `
    <p class="kicker">Teczka</p>
    <h1>Sprawa 110</h1>
    <svg class="chart" viewBox="0 0 420 230" role="img" aria-label="Stary szkic ruiny">
      <rect width="420" height="230" fill="#efe4cf"/>
      <path d="M18 28h384v174H18z" fill="none" stroke="#8f6a52" stroke-width="1.4"/>
      <path d="M28 48c40-18 70 16 110-4 36-18 70 22 112 2 28-14 48 8 78-6" fill="none" stroke="#a07850" stroke-width="0.8" stroke-dasharray="3 3"/>
      <g fill="none" stroke="#3a2a1c" stroke-width="3" stroke-linecap="square">
        <path d="M70 70h70v40H70zM140 70h50M140 110h40v36h-40zM180 110h46M110 110v40M70 150h40"/>
        <path d="M250 78h80v34h-40v28h40M290 112v28M250 140h40"/>
      </g>
      <circle cx="92" cy="92" r="5" fill="#8a3e12"/>
      <circle cx="318" cy="156" r="6" fill="none" stroke="#c4893a" stroke-width="2"/>
      <circle cx="318" cy="156" r="2" fill="#c4893a"/>
      <path d="M200 36l6 14h-12z" fill="#8f6a52"/>
      <text x="208" y="34" fill="#6a5344" font-size="11" font-family="Palatino, Georgia, serif">góra</text>
      <text x="78" y="196" fill="#6a5344" font-size="13" font-family="Palatino, Georgia, serif">kadr 110 · sonda</text>
    </svg>
    <p class="lead">Sonda na Marsie sfotografowała w pyle korytarze, które schodzą pod powierzchnię. Potem zamilkła. Od tamtej nocy co sto dziesięć sekund wraca ten sam sygnał.</p>
    <p>Nad korytarzami wisiała planeta z pierścieniami. Mars nie ma takiego nieba. Teczkę podpisano: planeta bez nazwy.</p>
    <p>Schody znalazł dozorca, w archiwum, za regałem z rocznikiem 1998. W planach budynku ich nie ma. Na dole jest pył i zimne światło.</p>
    <p>Schodzi się we dwoje. Kartograf zostaje przy mapie i dyktuje. Latarnik idzie w dół z latarnią i widzi tyle, ile oświetli.</p>
    <p>W korytarzach chodzi strażnik. Słyszy bieg przez ściany. Kto stoi, jest cichy. Na końcu każdej komory bije serce. Dotknięte, puszcza głębiej.</p>
    <p>Dozorca mówi jedno: „Ruina nie liczy czasu. Liczy kroki.”</p>
    <p>Głos zostawcie sobie. Mapa mówi krótkimi znakami.</p>
    <div class="menu-list"><button type="button" data-act="back">Wróć</button></div>
  `);
  paintPadFocus();
}

function paintCredits() {
  fillPlate("credits", `
    <p class="kicker">Twórcy</p>
    <h1>Za labiryntem</h1>
    <p class="studio">Dead Net Lab</p>
    <p class="kicker">Schodzili przed wami</p>
    <ul class="credits">
      <li>Mariusz B.</li>
      <li>Pawełek</li>
      <li>Bartek M.</li>
    </ul>
    <p class="fine">Mariuszowi za drugi test.</p>
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
    ? state.scores.map((row) => `<li>${row.name} · ${clock(row.time)} · komora ${row.chambers} · ${row.points || 0} pkt</li>`).join("") || "<li>Nikt jeszcze nie zszedł.</li>"
    : "<li>Czytam teczkę.</li>";
  fillPlate("scores", `
    <p class="kicker">Zejścia</p>
    <h1>Najgłębiej</h1>
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
  if (state.phase === "menu") paintRecord();
}

function paintCodeCells(input) {
  if (!input) return;
  const cells = input.parentElement.querySelectorAll("span");
  const value = input.value || "";
  cells.forEach((cell, i) => {
    cell.textContent = value[i] || "";
    cell.classList.toggle("caret", i === value.length && value.length < 4);
  });
}

function paintHome() {
  focusI = 0;
  const preset = queryCode && !state.code ? queryCode : "";
  fillPlate("home", `
    <div class="play-screen">
      <header class="play-head">
        <p class="kicker">Graj</p>
        <h1>Kto patrzy, kto idzie?</h1>
        <p class="role-hint">Tu weź latarnię, mapę otwórz na telefonie.</p>
      </header>
      <div class="play-roles">
        <button type="button" class="role-card" data-act="create" data-role="guide">
          <svg class="art" viewBox="0 0 300 180" aria-hidden="true">
            <defs><radialGradient id="role-map" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#d39340" stop-opacity=".35"/><stop offset="1" stop-color="#d39340" stop-opacity="0"/></radialGradient></defs>
            <rect width="300" height="180" fill="url(#role-map)"/>
            <g fill="none" stroke="#c4a48a" stroke-width="3" stroke-linecap="square" opacity=".8">
              <path d="M90 40h120v100H90zM90 70h40v30M170 40v40h-20M130 100h50v40M210 110h-30"/>
            </g>
            <path d="M110 125 L130 100 L150 100 L150 70 L190 70" fill="none" stroke="#d39340" stroke-width="3" stroke-dasharray="7 6"/>
            <circle cx="190" cy="70" r="6" fill="#d39340"/>
            <circle cx="110" cy="125" r="5" fill="#e7e1d6"/>
          </svg>
          <small>Telefon · widzi całość</small>
          <h3>Przy mapie</h3>
          <p>Kartograf. Trzyma nić: widzi strażnika, dyktuje znaki, otwiera pieczęcie.</p>
        </button>
        <button type="button" class="role-card" data-act="create" data-role="runner">
          <svg class="art" viewBox="0 0 300 180" aria-hidden="true">
            <defs><radialGradient id="role-lamp" cx=".5" cy=".9" r=".75"><stop offset="0" stop-color="#ffe2aa" stop-opacity=".45"/><stop offset="1" stop-color="#ffe2aa" stop-opacity="0"/></radialGradient></defs>
            <path d="M150 170 L60 20 L240 20 Z" fill="url(#role-lamp)"/>
            <g fill="none" stroke="#c4a48a" stroke-width="2.4" opacity=".75">
              <path d="M40 160 L110 70 L110 30 M260 160 L190 70 L190 30 M110 70 H190"/>
            </g>
            <circle cx="150" cy="58" r="3" fill="#a3b56a"/><circle cx="160" cy="58" r="3" fill="#a3b56a"/>
          </svg>
          <small>Komputer · ma tylko światło</small>
          <h3>Z latarnią</h3>
          <p>Latarnik. Idzie po omacku, słucha ścian, dotyka serca.</p>
        </button>
        <form class="join-card" data-act="join">
          <p class="kicker">Masz kod?</p>
          <h3>Wejdź do komory</h3>
          <label class="code-cells">
            <input name="code" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" inputmode="text" aria-label="Kod komory" value="${esc(preset)}">
            <span></span><span></span><span></span><span></span>
          </label>
          <button class="stone-btn" type="submit">Wejdź</button>
          <p class="err" id="err">${esc(state.err || "")}</p>
        </form>
      </div>
      <div class="menu-foot">
        <div class="pad-hints">
          <span><i class="pad-a">A</i>Wybierz</span>
          <span><i class="pad-b">B</i>Wróć</span>
          <button type="button" class="text-back" data-act="back">Wróć</button>
        </div>
        <p class="host">${hostLine ? `Drugi ekran: <b>${esc(hostLine)}</b>` : "Zostańcie przy tym komputerze."}</p>
      </div>
    </div>
  `);
  paintCodeCells(plate.querySelector("input[name=code]"));
  paintPadFocus();
}

function paintLobby() {
  const roleName = state.role === "runner" ? "Latarnik" : "Kartograf";
  const code = (state.code || "").split("").join(" ");
  const urls = (state.urls || []).map((url) => `<div class="urls">${url}</div>`).join("");
  const waiting = !state.both;
  const waitLine = waiting ? "Czekam na drugie z was. Nić leży na stole." : "Można schodzić.";
  fillPlate(waiting ? "lobby-wait" : "lobby-ready", `
    <p class="kicker">${roleName}</p>
    <h1 class="code" aria-label="Kod ${state.code || ""}">${code}</h1>
    <p class="dictate">Czytaj po jednej literze.</p>
    ${state.qr ? `<img class="qr" alt="Kod QR komory ${state.code}" src="${state.qr}">` : ""}
    <p class="wait ${waiting ? "is-waiting" : "is-ready"}">${waitLine}</p>
    ${urls}
    <p class="fine">Ten sam Wi-Fi, ta sama piwnica.</p>
    <div class="roles">
      <button class="solid" type="button" data-act="start" ${state.both ? "" : "disabled"}>Zejdźcie</button>
      <button class="ghost" type="button" data-act="leave">Zostaw sprawę</button>
    </div>
    <p class="err" id="err">${state.err || ""}</p>
  `);
  paintPadFocus();
}

const soundIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 10h3l4-3v10l-4-3H5z"/><path d="M16 9c1.3 1.6 1.3 4.4 0 6M18.5 7c2.4 2.8 2.4 7.2 0 10"/></svg>`;
const mutedIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 10h3l4-3v10l-4-3H5z"/><path d="M16 10l4 4M20 10l-4 4"/></svg>`;
const sealMark = `<svg viewBox="0 0 22 25" aria-hidden="true"><path d="M11 1.5l8.7 5v10.5L11 23.5 2.3 17V6.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="core" d="M7 10l4 3.5 4-3.5M7 14l4 3.5 4-3.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const callWords = { stop: "Stój", quiet: "Cicho", run: "Biegnij", left: "W lewo", right: "W prawo", back: "Wstecz", heart: "Do serca" };

function stonePlate() {
  if (document.documentElement.style.getPropertyValue("--stone-tex")) return;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const im = g.createImageData(256, 256);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < im.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 70;
    im.data[i] = v;
    im.data[i + 1] = v;
    im.data[i + 2] = v;
    im.data[i + 3] = 22;
  }
  g.putImageData(im, 0, 0);
  document.documentElement.style.setProperty("--stone-tex", `url(${canvas.toDataURL()})`);
}

function syncGuideMute() {
  const btn = panel.querySelector("[data-act=mute]");
  if (!btn) return;
  btn.setAttribute("aria-label", audio.muted ? "Dźwięk" : "Wycisz");
  btn.innerHTML = audio.muted ? mutedIcon : soundIcon;
}

function renderPanel() {
  stonePlate();
  const letters = (state.code || "").split("").join(" ");
  const wakes = Array.from({ length: 14 }, () => "<i></i>").join("");
  const seals = [0, 1].map(() => `<span class="seal">${sealMark}</span>`).join("");
  const key = (id, label, hotkey, cls, icon) => `<button class="key ${cls}" type="button" data-act="call" data-id="${id}"><small>${hotkey}</small>${icon}<span>${label}</span></button>`;
  panel.innerHTML = `
    <div class="guide-top">
      <button class="ico" type="button" data-act="mute" aria-label="Wycisz">${soundIcon}</button>
      <div class="room">KOMORA <b>${letters}</b></div>
      <button class="ico" type="button" data-act="help" aria-label="Pomoc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9.5 9a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg></button>
      <button class="ico" type="button" data-act="menu" aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg></button>
    </div>
    <section class="board" data-sn="patrol" aria-label="Tablica kartografa">
      <div class="threat">
        <div class="eye" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20c4.5-7 9.5-10 16-10s11.5 3 16 10c-4.5 7-9.5 10-16 10S8.5 27 4 20z"/><circle cx="20" cy="20" r="5.5" fill="currentColor" stroke="none"/><path d="M20 4v3M8 8l2 2M32 8l-2 2"/></svg></div>
        <div class="sn">
          <p class="sn-sub">Strażnik</p>
          <h2 class="sn-name" id="sent-state">Obchód</h2>
          <div class="wake" id="wake-bars" aria-label="Przebudzenie ruiny">${wakes}</div>
          <div class="wake-l"><span>Śpi</span><span>Niepokój</span><span>Budzi się</span></div>
        </div>
        <div class="loot">
          <div class="seals" id="seal-count" aria-label="Pieczęcie">${seals}</div>
          <div class="pts"><svg class="keyic" id="keyic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17 12v3M20 12v2"/></svg><span id="score-now">0</span><small>PKT</small></div>
        </div>
      </div>
      <div class="door" id="door" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16"/><circle cx="12" cy="12" r="3"/><path d="M4 21h16"/></svg>
        <span>Latarnik stoi przy drzwiach. Dotknij klamry na mapie.</span>
      </div>
      <div class="keys">
        <p class="echo" id="echo">Wysłano</p>
        ${key("left", "W lewo", "4", "dir", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>`)}
        ${key("stop", "Stój", "1", "stop", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1"/></svg>`)}
        ${key("right", "W prawo", "5", "dir", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg>`)}
        ${key("quiet", "Cicho", "2", "", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 10h3l4-3v10l-4-3H5z"/><path d="M16 10l4 4M20 10l-4 4"/></svg>`)}
        ${key("run", "Biegnij", "3", "", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h10M10 7l5 5-5 5M17 7l5 5-5 5"/></svg>`)}
        <button class="veil" id="veil-btn" type="button" data-act="veil" aria-label="Zasłona" style="--p: 1"><i class="ring"></i><b id="veil-label">Zasłona</b><em id="veil-num"></em></button>
        ${key("back", "Wstecz", "6", "", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 14H5v-4"/><path d="M5 14c2.5-5 7-8 13-8"/></svg>`)}
        ${key("heart", "Do serca", "7", "long", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 19s-6.2-3.7-6.2-8.1A3.5 3.5 0 0 1 12 8.2a3.5 3.5 0 0 1 6.2 2.7C18.2 15.3 12 19 12 19z"/></svg>`)}
      </div>
    </section>
  `;
  const ruin = document.getElementById("ruin-label");
  if (ruin) ruin.textContent = `KOMORA ${state.round}`;
  syncGuideMute();
}

function updatePanel(snap) {
  if (state.role !== "guide") return;
  if (panel.dataset.round !== String(state.round)) {
    panel.dataset.round = String(state.round);
    renderPanel();
  }
  const names = { patrol: "Obchód", alert: "Czuwa", hunt: "Pościg", search: "Szuka" };
  const board = panel.querySelector(".board");
  const snState = (snap.sn && snap.sn.state) || "patrol";
  if (board) board.dataset.sn = snState;
  const sent = panel.querySelector("#sent-state");
  if (sent) sent.textContent = names[snState] || "Obchód";
  const bars = panel.querySelector("#wake-bars");
  if (bars) {
    const wake = snap.wake || 0;
    const n = Math.round(wake * 14);
    [...bars.children].forEach((el, i) => {
      if (i >= n) el.className = "";
      else if (i / 14 >= 0.55) el.className = "on wild";
      else if (i / 14 >= 0.12) el.className = "on hot";
      else el.className = "on";
    });
  }
  const veil = panel.querySelector("#veil-btn");
  if (veil) {
    const label = veil.querySelector("#veil-label");
    const num = veil.querySelector("#veil-num");
    const cooling = snap.veilCd > 0 && !(snap.veil > 0);
    const p = snap.veil > 0 || !cooling ? 1 : 1 - snap.veilCd / 26;
    veil.style.setProperty("--p", p.toFixed(3));
    veil.classList.toggle("on", snap.veil > 0);
    veil.classList.toggle("cool", cooling);
    if (label) label.textContent = snap.veil > 0 ? "Trwa" : cooling ? "Odnowa" : "Zasłona";
    if (num) num.textContent = snap.veil > 0 ? String(Math.ceil(snap.veil)) : cooling ? String(Math.ceil(snap.veilCd)) : "";
    veil.disabled = snap.veilCd > 0;
  }
  const seals = panel.querySelector("#seal-count");
  if (seals) {
    const charges = snap.sealCharges ?? 0;
    [...seals.children].forEach((el, i) => el.classList.toggle("spent", i >= charges));
  }
  const door = panel.querySelector("#door");
  if (door) {
    const ex = snap.ex;
    const ready = ex && state.maze && (state.maze.seals || []).some((seal) => {
      if (seal.open) return false;
      const mx = seal.axis === "v" ? seal.x : seal.x + 0.5;
      const my = seal.axis === "v" ? seal.y + 0.5 : seal.y;
      return Math.hypot(ex.x - mx, ex.y - my) < 1.2;
    });
    door.hidden = !ready;
  }
  const scoreNow = panel.querySelector("#score-now");
  if (scoreNow) scoreNow.textContent = String(snap.points || 0);
  const keyic = panel.querySelector("#keyic");
  if (keyic) {
    const hasKey = !!(state.maze && (state.maze.loot || []).some((item) => item.kind === "key" && item.taken));
    keyic.classList.toggle("has", hasKey);
  }
  const ruin = document.getElementById("ruin-label");
  if (ruin) ruin.textContent = `KOMORA ${state.round}`;
  const roundClock = document.getElementById("round-clock");
  if (roundClock) roundClock.textContent = clock(snap.roundT);
}

const CALL_WORD = { stop: "Stój", quiet: "Cicho", run: "Biegnij", left: "W lewo", right: "W prawo", back: "Wstecz", heart: "Do serca", knock: "Stuk" };
const CALL_ICON = {
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6.5" y="6.5" width="11" height="11" rx="1"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 6l-6 6 6 6"/></svg>',
  quiet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 10h3l4-3v10l-4-3H5z"/><path d="M16 10l4 4M20 10l-4 4"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h10M10 7l5 5-5 5M17 7l5 5-5 5"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 14H5v-4"/><path d="M5 14c2.5-5 7-8 13-8"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 19s-6.2-3.7-6.2-8.1A3.5 3.5 0 0 1 12 8.2a3.5 3.5 0 0 1 6.2 2.7C18.2 15.3 12 19 12 19z"/></svg>',
};

function showRunnerCall(id) {
  const banner = document.getElementById("call-banner");
  const word = document.getElementById("call-word");
  if (!banner || !word) return;
  word.innerHTML = `${CALL_ICON[id] || ""}${esc(CALL_WORD[id] || "")}`;
  banner.classList.add("show");
  clearTimeout(showRunnerCall.timer);
  showRunnerCall.timer = setTimeout(() => banner.classList.remove("show"), 1800);
  if (navigator.vibrate) navigator.vibrate(18);
}

function updateRunnerHud(snap) {
  if (state.role !== "runner" || !snap) return;
  const round = document.getElementById("hud-round");
  if (round) round.textContent = String(state.round || 1);
  const clockEl = document.getElementById("hud-clock");
  if (clockEl) clockEl.textContent = clock(snap.roundT);
  const pts = document.getElementById("hud-pts");
  if (pts) pts.textContent = String(snap.points || 0);
  const key = document.getElementById("hud-key");
  const loot = (state.maze && state.maze.loot) || [];
  if (key) {
    const hasKey = loot.some((item) => item.kind === "key" && item.taken);
    key.classList.toggle("has", hasKey);
    key.classList.toggle("not", !hasKey);
  }
  const taken = loot.filter((item) => item.kind === "shard" && item.taken).length;
  document.querySelectorAll("#runner-hud .shard").forEach((el, i) => {
    el.classList.toggle("has", i < taken);
    el.classList.toggle("not", i >= taken);
  });
}

function showLoot(text) {
  const el = document.getElementById("loot-float");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(showLoot.timer);
  showLoot.timer = setTimeout(() => el.classList.remove("show"), 1400);
}

function showCall(id) {
  if (state.role === "runner" && id !== "knock") {
    showRunnerCall(id);
    return;
  }
  toast.textContent = CALL_WORD[id] || "";
  toast.classList.add("show");
  clearTimeout(showCall.timer);
  showCall.timer = setTimeout(() => toast.classList.remove("show"), 1500);
}

const WIN_NOTES = [
  "Serce odpowiedziało na trzeci krok. Nie na pierwszy.",
  "Pył na butach jest czerwony. Na dole nie ma nic czerwonego.",
  "Latarnia zgasła na sekundę i wtedy było najjaśniej.",
  "Komora niżej ma te same znaki na ścianach. Inaczej ustawione.",
  "Zegar na górze stanął na 1:10. Na dole szedł dalej.",
  "Nikt z nas nie pamięta, kto rysował serwetkę.",
];
const LOSE_NOTES = [
  "Strażnik zatrzymał się, kiedy my. Jakby czekał na to samo.",
  "Ktoś na dole liczył kroki na głos. Mylił się zawsze o jeden.",
  "Na mapie było dwoje. W głośniku trzy pary kroków.",
  "Pan Walenty pytał, czy biegliśmy. Nie powiedzieliśmy mu.",
  "Zielone światło nie jest z naszej latarni.",
  "Ta sama komora. Te same korytarze. Inne echo.",
];
let resultNoteKey = "";

function showResult(snap) {
  const on = snap.phase === "result";
  result.classList.toggle("is-off", !on);
  if (!on) {
    screen.classList.remove("flash-win", "flash-lose");
    return;
  }
  const win = snap.result === "win";
  resultKicker.textContent = win ? "Serce" : "Strażnik";
  resultTitle.textContent = win ? "Serce odpowiedziało. Schodzicie głębiej." : "Strażnik was dogonił. Ruina liczy kroki od nowa.";
  resultTime.textContent = `${clock(snap.roundT)} · ${snap.points || 0} pkt`;
  const note = document.getElementById("result-note");
  const key = `${state.round}:${snap.result}`;
  if (note && resultNoteKey !== key) {
    const list = win ? WIN_NOTES : LOSE_NOTES;
    note.textContent = list[Math.floor(Math.random() * list.length)];
    resultNoteKey = key;
  }
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
    const text = controlHint();
    hint.hidden = !text;
    hint.textContent = text;
    clearTimeout(onRound.hint);
    if (text) {
      onRound.hint = setTimeout(() => {
        if (hint.textContent.startsWith("Lewa strona")) hint.hidden = true;
      }, 14000);
    }
    settleHint();
  }
}

function onSnap(msg) {
  if (msg.seals && state.maze) applySeals(state.maze, msg.seals);
  if (msg.loot && state.maze) state.maze.loot = msg.loot;
  state.sealCharges = msg.sealCharges;
  state.points = msg.points || 0;
  state.snaps.push({ ...msg, at: performance.now() });
  if (state.snaps.length > 14) state.snaps.shift();
  if (msg.fx) {
    for (const name of msg.fx) {
      audio.play(name);
      if (name === "knock" && state.role === "guide") showCall("knock");
      if (state.role === "runner" && name === "shard") showLoot("+10 · Odłamek");
      if (state.role === "runner" && name === "key") showLoot("+25 · Klucz");
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
    waitText.textContent = msg.note || "Nić się zerwała.";
  } else if (msg.phase) waitbanner.classList.add("is-off");
  if (state.role === "runner" && state.phase === "play") {
    if (msg.immunity > 0.2) {
      hint.hidden = false;
      hint.textContent = "Jeszcze was nie słyszy.";
    } else if (hint.textContent === "Jeszcze was nie słyszy." || hint.textContent.startsWith("Strażnik")) {
      const text = controlHint();
      hint.hidden = !text;
      hint.textContent = text;
    }
    settleHint();
  }
  updatePanel(msg);
  updateRunnerHud(msg);
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
        beasts: lerpList(a.beasts, b.beasts, u),
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

function lerpList(a, b, u) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return b || a || [];
  return b.map((item, i) => lerpEnt(a[i], item, u));
}

function controlHint() {
  const fine = window.matchMedia("(pointer:fine)").matches;
  if (fine) return "";
  return "Lewa strona: krok. Prawa: wzrok. Pomoc w rogu.";
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

function optionsRoot() {
  if (optionsOverPlay) return optLayer;
  if (state.phase === "options") return plate;
  return null;
}

function focusables() {
  const root = optionsRoot();
  if (root) return [...root.querySelectorAll("button, input")].filter((el) => el && !el.disabled && !el.hidden);
  if (state.phase === "intro") return [introGo, document.getElementById("intro-skip")].filter((el) => el && !el.hidden);
  if (state.phase === "result") return [...result.querySelectorAll("button, input"), fullBtn].filter((el) => el && !el.disabled && !el.hidden);
  if (!SHELL.has(state.phase) || state.phase === "boot" || state.phase === "intro") return [];
  return [...plate.querySelectorAll("button, input"), fullBtn].filter((el) => el && !el.disabled);
}

function focusedEl() {
  const list = focusables();
  if (!list.length) return null;
  focusI = ((focusI % list.length) + list.length) % list.length;
  return list[focusI];
}

function paintPadFocus() {
  document.querySelectorAll(".is-pad").forEach((el) => el.classList.remove("is-pad"));
  document.querySelectorAll(".opt-row.on, .menu-item.on, .role-card.on, .join-card.on").forEach((el) => el.classList.remove("on"));
  const el = focusedEl();
  if (!el) return;
  const row = el.closest(".opt-row");
  if (row) row.classList.add("on");
  if (el.classList.contains("menu-item") || el.classList.contains("role-card")) el.classList.add("on");
  const join = el.closest(".join-card");
  if (join) join.classList.add("on");
  if (padOn) el.classList.add("is-pad");
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
      : "Lewa gałka: krok. Prawa: wzrok. RT lub A: bieg. LB: nasłuch. RB: stuk. X: wyciszenie. Y: pełny ekran.";
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
  if (state.phase === "intro") {
    if (buttonEdge(pad, 0)) finishIntro();
    buttonEdge(pad, 2);
    buttonEdge(pad, 3);
    buttonEdge(pad, 4);
    buttonEdge(pad, 5);
    buttonEdge(pad, 9);
    return;
  }
  const inOptions = state.phase === "options" || optionsOverPlay;
  const menu = SHELL.has(state.phase) || state.phase === "result" || inOptions;
  if (menu) {
    const left = dirPulse("left", buttonOn(pad, 14), dt);
    const right = dirPulse("right", buttonOn(pad, 15), dt);
    const up = dirPulse("up", buttonOn(pad, 12), dt);
    const down = dirPulse("down", buttonOn(pad, 13), dt);
    const onVol = inOptions && focusedEl() && focusedEl().dataset.act === "opt-vol";
    if (onVol && (left || right)) adjustVolume((right ? 10 : 0) - (left ? 10 : 0));
    else {
      if (up || left) moveFocus(-1);
      if (down || right) moveFocus(1);
    }
    if (buttonEdge(pad, 0)) activateFocus();
    if (buttonEdge(pad, 1)) {
      if (inOptions) closeOptions();
      else if (state.phase === "home" || state.phase === "story" || state.phase === "credits" || state.phase === "scores") {
        setPhase("menu");
        paintMenu();
      }
    }
  } else {
    for (const name of Object.keys(dirHold)) dirHold[name] = 0;
    buttonEdge(pad, 0);
    buttonEdge(pad, 1);
  }
  if (buttonEdge(pad, 2)) toggleMute();
  if (buttonEdge(pad, 3)) toggleFull();
  const listenEdge = buttonEdge(pad, 4);
  const knockEdge = buttonEdge(pad, 5);
  if (buttonEdge(pad, 9) && state.phase === "result" && !inOptions) nextBtn.click();
  if (inOptions || !(state.role === "runner" && state.phase === "play")) {
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
  if (listenEdge && actCd.listen <= 0) {
    doListen();
    flashAct(listenBtn);
  }
  if (knockEdge && actCd.knock <= 0) {
    doKnock();
    flashAct(knockBtn);
  }
}

let warnHeld = false;

function feelGuardian(dt, dist, snState) {
  const playing = state.role === "runner" && state.phase === "play";
  const coming = snState === "hunt" || snState === "alert" || snState === "search";
  if (!playing) {
    warnHeld = false;
    screen.classList.remove("is-near", "is-warn");
    rumbleAt = 0;
    return;
  }
  const near = dist < 3.4;
  if (coming && dist < 7.2) warnHeld = true;
  else if (!coming || dist > 8) warnHeld = false;
  screen.classList.toggle("is-near", near);
  screen.classList.toggle("is-warn", warnHeld && !near);
  if (!near) {
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
const PIXEL_STEPS_HD = [1, 0.72, 0.5, 0.38, 0.28];
const HD_MAX_PIXELS = 800000;
let pixelStep = 0;
const frameSamples = [];
let scaleHold = 0;
let slowStreak = 0;

function pixelSteps() {
  return hdActive() ? PIXEL_STEPS_HD : PIXEL_STEPS;
}

function hdPixelCap() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = map.getBoundingClientRect();
  const full = Math.max(1, rect.width) * Math.max(1, rect.height) * dpr * dpr;
  if (full <= HD_MAX_PIXELS) return 1;
  return Math.sqrt(HD_MAX_PIXELS / full);
}

function clampHdStep() {
  if (!hdActive()) return;
  if (!(state.role === "runner" && (state.phase === "play" || state.phase === "result"))) return;
  const cap = hdPixelCap();
  const steps = PIXEL_STEPS_HD;
  let need = steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] <= cap + 0.001) {
      need = i;
      break;
    }
  }
  if (pixelStep < need) pixelStep = need;
}

function pixelBudget() {
  if (state.role === "runner" && (state.phase === "play" || state.phase === "result")) {
    const steps = pixelSteps();
    let budget = steps[Math.min(pixelStep, steps.length - 1)];
    if (hdActive()) budget = Math.min(budget, hdPixelCap());
    return budget;
  }
  return 1;
}

function resize() {
  clampHdStep();
  let rect = stage.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) rect = map.getBoundingClientRect();
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
  if (hdActive() && dt > 0.02) slowStreak += 1;
  else slowStreak = 0;
  if (slowStreak >= 2 && scaleHold <= 0) {
    const steps = pixelSteps();
    if (pixelStep < steps.length - 1) {
      pixelStep += dt > 0.04 ? 2 : 1;
      if (pixelStep > steps.length - 1) pixelStep = steps.length - 1;
      slowStreak = 0;
      frameSamples.length = 0;
      scaleHold = 0.5;
      resize();
      return;
    }
  }
  frameSamples.push(dt);
  if (frameSamples.length > 40) frameSamples.shift();
  if (frameSamples.length < 24 || scaleHold > 0) return;
  let sum = 0;
  for (const sample of frameSamples) sum += sample;
  const avg = sum / frameSamples.length;
  const steps = pixelSteps();
  if (pixelStep > steps.length - 1) pixelStep = steps.length - 1;
  if (avg > 0.012 && pixelStep < steps.length - 1) {
    const hurry = hdActive() && avg > 0.02;
    pixelStep += hurry ? 2 : 1;
    if (pixelStep > steps.length - 1) pixelStep = steps.length - 1;
    frameSamples.length = 0;
    scaleHold = hurry ? 0.4 : 1.8;
    resize();
  } else if (avg < 0.006 && pixelStep > 0 && !(hdActive() && pixelSteps()[pixelStep - 1] > hdPixelCap() + 0.001)) {
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
      beasts: snap.beasts,
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
    beasts: snap.beasts,
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
      if (state.phase === "menu" || state.phase === "intro" || state.phase === "options" || state.phase === "story" || state.phase === "credits" || state.phase === "scores") return;
      setPhase("lobby");
      paintLobby();
    } else if (msg.t === "scores") {
      state.scores = msg.scores || [];
      const submit = scoreForm.querySelector("button");
      if (submit) submit.textContent = "Zapisane";
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
      if (msg.text && (msg.text.includes("zgasła") || msg.text.includes("nie ma w teczce"))) {
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
    if (!SHELL.has(state.phase)) setErr("Nić. Łączę znowu.");
    setTimeout(connect, 900);
  };
}

lobby.addEventListener("click", (event) => {
  if (event.target.closest("h1") || event.target.closest(".studio")) noteTap();
  const btn = event.target.closest("[data-act]");
  if (!btn || btn.dataset.act === "join") return;
  audio.unlock();
  if (btn.dataset.act === "play") {
    setPhase("home");
    paintHome();
  }
  if (btn.dataset.act === "options") openOptions();
  if (btn.dataset.act === "opt-hd") toggleHd(btn);
  if (btn.dataset.act === "opt-sound") toggleMute();
  if (btn.dataset.act === "opt-back") closeOptions();
  if (btn.dataset.act === "opt-leave") goMenu();
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

lobby.addEventListener("input", (event) => {
  if (event.target.dataset && event.target.dataset.act === "opt-vol") onVolumeInput(event.target);
  if (event.target.name === "code") {
    const input = event.target;
    const next = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (input.value !== next) input.value = next;
    paintCodeCells(input);
  }
});
function aimFocus(el) {
  const list = focusables();
  const index = list.indexOf(el);
  if (index < 0) return;
  focusI = index;
  paintPadFocus();
}
lobby.addEventListener("pointerover", (event) => {
  const btn = event.target.closest("button.menu-item, button.role-card");
  if (!btn || !lobby.contains(btn)) return;
  aimFocus(btn);
});
lobby.addEventListener("focusin", (event) => {
  const el = event.target.closest("button, input");
  if (!el || !lobby.contains(el)) return;
  aimFocus(el);
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
  const echo = panel.querySelector("#echo");
  if (btn) {
    btn.classList.remove("sent");
    void btn.offsetWidth;
    btn.classList.add("sent");
    clearTimeout(glowCall.timer);
    glowCall.timer = setTimeout(() => btn.classList.remove("sent"), 700);
  }
  if (echo) {
    echo.textContent = `Wysłano · ${callWords[id] || ""}`;
    echo.classList.add("show");
    clearTimeout(glowCall.echo);
    glowCall.echo = setTimeout(() => echo.classList.remove("show"), 1300);
  }
  if (state.role === "guide" && navigator.vibrate) navigator.vibrate(18);
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
  if (btn.dataset.act === "mute") toggleMute();
  if (btn.dataset.act === "help") toggleHelp();
  if (btn.dataset.act === "menu") openOptions();
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
  if (state.phase === "intro") {
    if (event.repeat || event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") return;
    event.preventDefault();
    finishIntro();
    return;
  }
  const typing = event.target instanceof HTMLInputElement && event.target.type !== "range";
  if (typing) return;
  if (event.key.toLowerCase() === "m" && !event.repeat) {
    event.preventDefault();
    toggleMute();
    return;
  }
  if (state.phase === "options" || optionsOverPlay) {
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      if (focusedEl() && focusedEl().dataset.act === "opt-vol") adjustVolume(key === "ArrowRight" ? 10 : -10);
      else moveFocus(key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      moveFocus(key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      activateFocus();
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      closeOptions();
      return;
    }
    return;
  }
  if (SHELL.has(state.phase) && state.phase !== "boot" && state.phase !== "intro" && state.phase !== "lobby") {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activateFocus();
      return;
    }
  }
  if (event.key === "F1" || event.key.toLowerCase() === "p") {
    event.preventDefault();
    toggleHelp();
    return;
  }
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(event.key.toLowerCase())) event.preventDefault();
  keys.add(event.key.toLowerCase());
  if (event.key === "Shift") state.input.sprint = true;
  if (event.key === "Escape") {
    if (help && !help.classList.contains("is-off")) {
      help.classList.add("is-off");
      help.hidden = true;
      return;
    }
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
  const calls = { "1": "stop", "2": "quiet", "3": "run", "4": "left", "5": "right", "6": "back", "7": "heart" };
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
  sprintBtn.classList.add("is-down");
});
sprintBtn.addEventListener("pointerup", () => sprintBtn.classList.remove("is-down"));
sprintBtn.addEventListener("pointercancel", () => sprintBtn.classList.remove("is-down"));
sprintBtn.addEventListener("pointerleave", () => sprintBtn.classList.remove("is-down"));
for (const btn of [listenBtn, knockBtn]) {
  btn.addEventListener("pointerdown", () => btn.classList.add("is-down"));
  btn.addEventListener("pointerup", () => btn.classList.remove("is-down"));
  btn.addEventListener("pointercancel", () => btn.classList.remove("is-down"));
  btn.addEventListener("pointerleave", () => btn.classList.remove("is-down"));
}

nextBtn.addEventListener("click", () => send({ t: "skip" }));
optLayer.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-act]");
  if (!btn) return;
  audio.unlock();
  if (btn.dataset.act === "opt-hd") toggleHd(btn);
  if (btn.dataset.act === "opt-sound") toggleMute();
  if (btn.dataset.act === "opt-back") closeOptions();
  if (btn.dataset.act === "opt-leave") goMenu();
});
optLayer.addEventListener("input", (event) => {
  if (event.target.dataset.act === "opt-vol") onVolumeInput(event.target);
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
      if (optionsOverPlay) {
        state.input.forward = 0;
        state.input.strafe = 0;
        state.input.sprint = false;
      } else readKeys(dt);
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
    if (state.role === "runner" && state.phase === "play") {
      feelGuardian(dt, Math.hypot(sn.x - body.x, sn.y - body.y), sn.state);
    }
  }
  watchFrames((performance.now() - t0) / 1000);
  try {
    syncMenuBg();
    paintDust(now / 1000);
    tickActs(dt);
  } catch (error) {
    console.error(error);
  }
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

let introTimers = [];
let introRaf = 0;
let titleTaps = 0;

function clearIntro() {
  introTimers.forEach((id) => clearTimeout(id));
  introTimers = [];
  cancelAnimationFrame(introRaf);
  introRaf = 0;
  intro.classList.remove("is-title");
}

function finishIntro() {
  if (state.phase !== "intro") return;
  clearIntro();
  setPhase("menu");
  paintMenu();
}

function startIntro() {
  clearIntro();
  setPhase("intro");
  introGo.hidden = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const showGo = () => {
    introGo.hidden = false;
    paintPadFocus();
  };
  if (reduced) showGo();
  else introTimers.push(setTimeout(showGo, INTRO_ENTER_MS));
  const t0 = performance.now();
  const tick = (now) => {
    if (state.phase !== "intro") return;
    const cssW = Math.max(1, intro.clientWidth);
    const cssH = Math.max(1, intro.clientHeight);
    if (cssW < 2 || cssH < 2) {
      introRaf = requestAnimationFrame(tick);
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const nextW = Math.round(cssW * dpr);
    const nextH = Math.round(cssH * dpr);
    if (introStage.width !== nextW || introStage.height !== nextH) {
      introStage.width = nextW;
      introStage.height = nextH;
    }
    const ctx = introStage.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintIntroFrame(ctx, cssW, cssH, reduced ? 0 : (now - t0) / 1000, reduced);
    introRaf = requestAnimationFrame(tick);
  };
  introRaf = requestAnimationFrame(tick);
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

const actCd = { listen: 0, knock: 0 };
const dustMotes = Array.from({ length: 70 }, () => ({
  x: Math.random(),
  y: Math.random(),
  z: 0.3 + Math.random() * 0.7,
  s: 0.004 + Math.random() * 0.01,
}));

function tickActs(dt) {
  actCd.listen = Math.max(0, actCd.listen - dt);
  actCd.knock = Math.max(0, actCd.knock - dt);
  listenBtn.style.setProperty("--p", (1 - actCd.listen / 4).toFixed(3));
  listenBtn.classList.toggle("busy", actCd.listen > 0);
  knockBtn.style.setProperty("--p", (1 - actCd.knock / 4.5).toFixed(3));
  knockBtn.classList.toggle("busy", actCd.knock > 0);
}

function paintDust(t) {
  const cv = document.getElementById("menu-dust");
  const bg = document.getElementById("menu-bg");
  if (!cv || !bg || bg.hidden) return;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cv.clientWidth * dpr));
  const h = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const mote of dustMotes) {
    const x = ((mote.x + t * mote.s * 0.3) % 1) * w;
    const y = ((mote.y - t * mote.s * 0.15 + 1) % 1) * h;
    ctx.globalAlpha = 0.15 + mote.z * 0.35;
    ctx.fillStyle = "#e7d6ba";
    const size = 1.2 * mote.z * dpr;
    ctx.fillRect(x, y, size, size);
  }
}

function showEar(rel, near, side) {
  const ear = document.getElementById("ear");
  const wedge = document.getElementById("ear-wedge");
  const text = document.getElementById("ear-text");
  if (!ear) return;
  const deg = Math.max(-80, Math.min(80, (rel * 180) / Math.PI));
  if (wedge) wedge.style.transform = `rotate(${deg}deg)`;
  if (text) text.textContent = `${near} · ${side}`;
  ear.classList.add("live");
  clearTimeout(showEar.timer);
  showEar.timer = setTimeout(() => ear.classList.remove("live"), 2600);
}

function flashAct(btn) {
  btn.classList.add("is-down");
  clearTimeout(flashAct.timer && flashAct.timer.get(btn));
  if (!flashAct.timer) flashAct.timer = new Map();
  flashAct.timer.set(btn, setTimeout(() => btn.classList.remove("is-down"), 140));
}

function doListen() {
  if (actCd.listen > 0 || state.role !== "runner" || state.phase !== "play") return;
  audio.unlock();
  const snap = state.snaps[state.snaps.length - 1];
  const sn = snap && snap.sn;
  if (!sn) {
    flash("Nie słychać.");
    return;
  }
  const dx = sn.x - state.body.x;
  const dy = sn.y - state.body.y;
  const dist = Math.hypot(dx, dy);
  const rel = normalizeAngle(Math.atan2(dy, dx) - state.body.a);
  const side = Math.abs(rel) < 0.45 ? "Przed wami" : Math.abs(rel) > 2.3 ? "Za wami" : rel > 0 ? "Z prawej" : "Z lewej";
  const near = dist < 2.4 ? "Tuż obok" : dist < 5.5 ? "Blisko" : "Daleko";
  showEar(rel, near, side);
  audio.hear(Math.max(-1, Math.min(1, rel / 1.4)), dist);
  actCd.listen = 4;
}

function doKnock() {
  if (actCd.knock > 0 || state.role !== "runner" || state.phase !== "play") return;
  audio.unlock();
  send({ t: "knock" });
  actCd.knock = 4.5;
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

function toggleHelp() {
  if (!help) return;
  if (!help.classList.contains("is-off")) {
    help.classList.add("is-off");
    help.hidden = true;
    return;
  }
  const runner = state.role === "runner";
  const guide = state.role === "guide";
  const body = runner
    ? `<p class="kicker">Latarnik</p><h2>W korytarzu</h2>
      <p>WASD: krok. Strzałki: wzrok. Shift: bieg. Na telefonie lewa strona to krok, prawa wzrok.</p>
      <p>N: nasłuch, skąd strażnik. K: stuk, znak dla mapy.</p>
      <p>Odłamki i klucz to dowody. Dają punkty. Do serca nie są potrzebne.</p>
      <p>Stań przy bursztynowych drzwiach. Kartograf może je wtedy otworzyć.</p>
      <p>Kto stoi, jest cichy. Bieg słychać przez ściany. Ucieczka z pościgu daje punkty.</p>`
    : guide
      ? `<p class="kicker">Kartograf</p><h2>Przy mapie</h2>
      <p>Mapa jest na telefonie. Latarnik jest na dole.</p>
      <p>Dotknij korytarza, żeby postawić znak. Dotknij drzwi, gdy Latarnik przy nich stoi.</p>
      <p>Zawołania: Stój, Cicho, Biegnij, W lewo, W prawo, Wstecz, Do serca. Zasłona na chwilę myli strażnika.</p>
      <p>Punkty: odłamki, klucz, ucieczka z pościgu i przejście komory.</p>`
      : `<p class="kicker">Pomoc</p><h2>Dwie role</h2>
      <p>Mapa na telefonie, latarnia na komputerze. Ten sam Wi-Fi.</p>
      <p>W grze P albo F1 otwiera tę tablicę. Latarnik i Kartograf dostają inny tekst.</p>`;
  helpCard.innerHTML = `${body}<div class="menu-list"><button type="button" id="help-close">Zamknij</button></div><p class="fine">P albo F1 · Ruina nie liczy czasu. Liczy kroki.</p>`;
  help.hidden = false;
  help.classList.remove("is-off");
  document.getElementById("help-close").addEventListener("click", toggleHelp);
}

helpOpen.addEventListener("click", () => {
  audio.unlock();
  toggleHelp();
});
intro.addEventListener("click", () => finishIntro());
quitBtn.addEventListener("click", () => openOptions());
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
if (queryCode || readSession()) lobby.classList.remove("is-off");
else startIntro();
connect();
