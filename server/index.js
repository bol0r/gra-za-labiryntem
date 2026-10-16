import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { generateMaze, mazeSize } from "./maze.js";
import { appendRun, pathPercent, runRecord } from "./runs.js";
import { createBeasts, stepBeasts } from "./creatures.js";
import { createSentinel, roundOutcome, stepSentinel } from "./sentinel.js";
import {
  SPRINT,
  applySeals,
  canStand,
  clamp,
  departAngle,
  hashString,
  wakeLevel,
} from "../shared/sim.js";

const PORT = Number(process.env.PORT) || 8787;
const DT = 1 / 20;
const REJOIN_MS = 120000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CALLS = new Set(["stop", "quiet", "run", "left", "right", "back", "heart"]);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let QRCode = null;
try {
  QRCode = (await import("qrcode")).default;
} catch {
  QRCode = null;
}

const rooms = new Map();
const tokens = new Map();
const scorePath = path.join(root, "data", "highscores.json");
const SCORE_SEED = [
  { name: "Olo", time: 84, chambers: 3 },
  { name: "Bartek", time: 126, chambers: 2 },
  { name: "Mariusz", time: 151, chambers: 2 },
];

function validScore(row) {
  return row && typeof row.name === "string" && Number.isFinite(Number(row.time)) && Number.isFinite(Number(row.chambers));
}

function loadScores() {
  try {
    const raw = JSON.parse(fs.readFileSync(scorePath, "utf8"));
    if (Array.isArray(raw) && raw.length) return raw.filter(validScore).slice(0, 24);
  } catch {
    // pierwsza tablica bierze się z nasion
  }
  return SCORE_SEED.map((row) => ({ ...row }));
}

let scores = loadScores();

function publicScores() {
  return [...scores].sort((a, b) => b.chambers - a.chambers || (b.points || 0) - (a.points || 0) || a.time - b.time).slice(0, 12);
}

function saveScores() {
  try {
    fs.mkdirSync(path.dirname(scorePath), { recursive: true });
    fs.writeFileSync(scorePath, JSON.stringify(scores));
  } catch (err) {
    console.error(err);
  }
}

function cleanName(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N} .'-]/gu, "")
    .trim()
    .slice(0, 16);
}

function lanUrls(port) {
  const found = [];
  let nets = {};
  try {
    nets = os.networkInterfaces() || {};
  } catch {
    return found.map((ip) => `http://${ip}:${port}`);
  }
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const v4 = net.family === "IPv4" || net.family === 4;
      if (v4 && !net.internal) found.push(net.address);
    }
  }
  found.sort((a, b) => rank(a) - rank(b));
  return found.map((ip) => `http://${ip}:${port}`);
}

function rank(ip) {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (ip.startsWith("172.")) return 2;
  return 3;
}

function makeCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return rooms.has(code) ? makeCode() : code;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function online(player) {
  return !!(player && player.ws && player.ws.readyState === 1);
}

function bothOnline(room) {
  return online(room.guide) && online(room.runner);
}

function otherRole(role) {
  return role === "guide" ? "runner" : "guide";
}

function publicPlayers(room) {
  return ["guide", "runner"]
    .filter((role) => room[role])
    .map((role) => ({ role, here: online(room[role]) }));
}

async function ensureQr(room) {
  if (room.qr || !QRCode || !room.joinUrl) return;
  room.qr = await QRCode.toDataURL(room.joinUrl, {
    margin: 1,
    width: 280,
    color: { dark: "#14221f", light: "#efe7da" },
  });
}

function sendLobby(room) {
  const msg = {
    t: "lobby",
    phase: "lobby",
    code: room.code,
    both: bothOnline(room),
    urls: room.urls,
    joinUrl: room.joinUrl,
    qr: room.qr,
    players: publicPlayers(room),
  };
  for (const role of ["guide", "runner"]) {
    const player = room[role];
    if (online(player)) send(player.ws, { ...msg, role });
  }
}

function sealStates(room) {
  return room.maze.seals.map((s) => !!s.open);
}

function snapshot(room) {
  const ex = room.explorer;
  const sn = room.sentinel;
  return {
    t: "snap",
    phase: room.phase,
    round: room.round,
    heat: room.heat,
    roundT: room.roundT,
    wake: room.wake,
    immunity: Math.max(0, room.immunity || 0),
    ex: ex ? { x: ex.x, y: ex.y, a: ex.a, sprint: !!ex.sprint, quiet: !!ex.quiet } : null,
    sn: sn ? { x: sn.x, y: sn.y, a: sn.a, state: sn.state } : null,
    beasts: (room.beasts || []).map((b) => ({ x: b.x, y: b.y, a: b.a, follow: !!b.follow })),
    seals: room.maze ? sealStates(room) : [],
    ping: room.ping ? { x: room.ping.x, y: room.ping.y, ttl: room.ping.ttl } : null,
    call: room.call ? { id: room.call.id, ttl: room.call.ttl } : null,
    veil: room.veil || 0,
    veilCd: room.veilCd || 0,
    sealCharges: room.sealCharges ?? 0,
    points: room.points || 0,
    loot: room.maze && room.maze.loot ? room.maze.loot.map((item) => ({ kind: item.kind, x: item.x, y: item.y, taken: !!item.taken })) : [],
    result: room.result,
    nextIn: room.nextIn ?? 0,
    note: room.note || "",
    fx: room.fx,
    both: bothOnline(room),
  };
}

function broadcastSnap(room) {
  const msg = snapshot(room);
  for (const role of ["guide", "runner"]) {
    if (online(room[role])) send(room[role].ws, msg);
  }
  room.fx = [];
}

function sendRound(room) {
  const maze = room.maze;
  const msg = {
    t: "round",
    round: room.round,
    heat: room.heat,
    maze: {
      w: maze.w,
      h: maze.h,
      vWalls: maze.vWalls,
      hWalls: maze.hWalls,
      seals: maze.seals.map((s) => ({ axis: s.axis, x: s.x, y: s.y, open: !!s.open })),
      start: maze.start,
      relic: maze.relic,
      patrol: maze.patrol,
      trails: maze.trails || [],
      loot: (maze.loot || []).map((item) => ({ kind: item.kind, x: item.x, y: item.y, taken: !!item.taken })),
    },
    spawn: { x: room.explorer.x, y: room.explorer.y, a: room.explorer.a },
  };
  for (const role of ["guide", "runner"]) {
    if (online(room[role])) send(room[role].ws, msg);
  }
}

function beginRound(room) {
  room.round += 1;
  const size = mazeSize(room.heat);
  room.maze = generateMaze(size, hashString(room.code) ^ Math.imul(room.round, 997));
  const start = room.maze.start;
  room.explorer = {
    x: start.x + 0.5,
    y: start.y + 0.5,
    a: departAngle(room.maze, start.x, start.y),
    quiet: true,
    sprint: false,
    last: Date.now(),
  };
  room.sentinel = createSentinel(room.maze);
  room.beasts = createBeasts(room.maze);
  room.phase = "play";
  room.roundT = 0;
  room.wake = 0;
  room.along = 0;
  room.immunity = 2.4;
  room.sealCharges = 2;
  room.veil = 0;
  room.veilCd = 0;
  room.chaseAt = null;
  room.chasePct = null;
  room.usedSeals = [];
  room.takenLoot = [];
  room.veilUsed = false;
  room.ping = null;
  room.call = null;
  room.result = null;
  room.nextIn = 0;
  room.note = "";
  room.fx = ["start"];
  sendRound(room);
  broadcastSnap(room);
}

function finishRound(room, result) {
  try {
    appendRun(runRecord(room, result));
  } catch (err) {
    console.error(err);
  }
  room.phase = "result";
  room.result = result;
  room.nextIn = result === "win" ? 12 : 8;
  room.fx.push(result);
  if (result === "win") {
    room.points = (room.points || 0) + 40;
    room.heat = Math.min(2, room.heat + 1);
  } else room.heat = Math.max(0, room.heat - 1);
}

function gather(room) {
  const loot = room.maze && room.maze.loot;
  if (!loot || !room.explorer) return;
  for (const item of loot) {
    if (item.taken) continue;
    if (Math.hypot(item.x - room.explorer.x, item.y - room.explorer.y) > 0.42) continue;
    item.taken = true;
    room.takenLoot = room.takenLoot || [];
    room.takenLoot.push(item.kind);
    room.points = (room.points || 0) + (item.kind === "key" ? 25 : 10);
    room.fx.push(item.kind === "key" ? "key" : "shard");
  }
}

function tick(room) {
  if (room.phase === "play") {
    if (!bothOnline(room)) {
      room.phase = "wait";
      room.note = !online(room.runner) ? "Latarnik zniknął z mapy." : "Kartograf zamilkł.";
    } else {
      room.note = "";
      room.roundT += DT;
      const pct = pathPercent(room.maze, room.explorer);
      if (pct != null) room.along = Math.max(room.along || 0, pct / 100);
      room.wake = wakeLevel(room.roundT, room.along || 0);
      room.immunity = Math.max(0, room.immunity - DT);
      room.veil = Math.max(0, room.veil - DT);
      room.veilCd = Math.max(0, room.veilCd - DT);
      if (room.ping) {
        room.ping.ttl -= DT;
        if (room.ping.ttl <= 0) room.ping = null;
      }
      if (room.call) {
        room.call.ttl -= DT;
        if (room.call.ttl <= 0) room.call = null;
      }
      gather(room);
      stepSentinel(room, DT);
      stepBeasts(room, DT);
      const outcome = roundOutcome(room);
      if (outcome) finishRound(room, outcome);
    }
    broadcastSnap(room);
    return;
  }
  if (room.phase === "wait") {
    if (bothOnline(room)) {
      room.phase = "play";
      room.note = "";
    }
    broadcastSnap(room);
    return;
  }
  if (room.phase === "result") {
    room.nextIn -= DT;
    if (room.ping) room.ping.ttl = Math.max(0, room.ping.ttl - DT);
    broadcastSnap(room);
    if (room.nextIn <= 0 && bothOnline(room)) beginRound(room);
  }
}

function dropPlayer(room, role) {
  const player = room[role];
  if (!player) return;
  tokens.delete(player.token);
  room[role] = null;
}

function forgetRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  for (const role of ["guide", "runner"]) {
    if (room[role]) tokens.delete(room[role].token);
  }
  rooms.delete(code);
}

function assign(ws, role) {
  const token = crypto.randomUUID();
  const player = { role, token, ws, goneAt: 0 };
  ws.player = player;
  return player;
}

async function createRoom(ws, role) {
  if (role !== "guide" && role !== "runner") role = "guide";
  const code = makeCode();
  const urls = lanUrls(PORT_LIVE);
  const joinUrl = urls[0] ? `${urls[0]}/?pokoj=${code}` : "";
  const room = {
    code,
    urls,
    joinUrl,
    qr: null,
    guide: null,
    runner: null,
    phase: "lobby",
    round: 0,
    heat: 0,
    maze: null,
    explorer: null,
    sentinel: null,
    fx: [],
    note: "",
    points: 0,
  };
  const player = assign(ws, role);
  room[role] = player;
  tokens.set(player.token, { code, role });
  rooms.set(code, room);
  ws.roomCode = code;
  await ensureQr(room);
  send(ws, {
    t: "joined",
    code,
    token: player.token,
    role,
    urls,
    joinUrl,
    qr: room.qr,
  });
  sendLobby(room);
}

function takeSeat(room, ws, role, token) {
  const player = room[role] && room[role].token === token ? room[role] : assign(ws, role);
  player.ws = ws;
  player.role = role;
  player.token = token || player.token;
  player.goneAt = 0;
  ws.player = player;
  ws.roomCode = room.code;
  room[role] = player;
  tokens.set(player.token, { code: room.code, role });
  return player;
}

async function joinRoom(ws, code) {
  code = String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  const room = rooms.get(code);
  if (!room) {
    send(ws, { t: "err", text: "Takiej komory nie ma w teczce." });
    return;
  }
  let role = null;
  if (!room.guide) role = "guide";
  else if (!room.runner) role = "runner";
  else {
    send(ws, { t: "err", text: "W tej komorze już jest dwoje." });
    return;
  }
  const player = takeSeat(room, ws, role);
  await ensureQr(room);
  send(ws, {
    t: "joined",
    code,
    token: player.token,
    role,
    urls: room.urls,
    joinUrl: room.joinUrl,
    qr: room.qr,
  });
  if (room.phase === "play" || room.phase === "result" || room.phase === "wait") {
    sendRound(room);
    broadcastSnap(room);
  } else sendLobby(room);
}

function resume(ws, code, token) {
  const known = tokens.get(token);
  const room = rooms.get(code) || (known && rooms.get(known.code));
  if (!room || !known || known.code !== room.code) {
    send(ws, { t: "err", text: "Ta komora już zgasła." });
    return;
  }
  const role = known.role;
  const player = takeSeat(room, ws, role, token);
  send(ws, {
    t: "joined",
    code: room.code,
    token: player.token,
    role,
    urls: room.urls,
    joinUrl: room.joinUrl,
    qr: room.qr,
    resumed: true,
  });
  if (room.maze && (room.phase === "play" || room.phase === "result" || room.phase === "wait")) {
    sendRound(room);
    broadcastSnap(room);
  } else {
    room.phase = "lobby";
    sendLobby(room);
  }
}

function onPose(room, msg) {
  if (room.phase !== "play") return;
  const ex = room.explorer;
  if (!ex) return;
  const x = Number(msg.x);
  const y = Number(msg.y);
  const a = Number(msg.a);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(a)) return;
  const now = Date.now();
  const elapsed = clamp((now - ex.last) / 1000, 0.02, 0.3);
  const dist = Math.hypot(x - ex.x, y - ex.y);
  const maxDist = SPRINT * elapsed + 0.45;
  if (!canStand(room.maze, x, y) || dist > maxDist) {
    ex.a = a;
    send(room.runner && room.runner.ws, { t: "correct", x: ex.x, y: ex.y, a: ex.a });
    return;
  }
  const speed = dist / elapsed;
  ex.x = x;
  ex.y = y;
  ex.a = a;
  ex.quiet = speed < 0.35;
  ex.sprint = speed > 2.25;
  ex.last = now;
}

function onGuide(room, msg) {
  if (room.phase !== "play" || !room.maze) return;
  if (msg.t === "ping") {
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    room.ping = {
      x: clamp(x, 0.15, room.maze.w - 0.15),
      y: clamp(y, 0.15, room.maze.h - 0.15),
      ttl: 12,
    };
    room.fx.push("ping");
    return;
  }
  if (msg.t === "seal") {
    const i = Number(msg.i);
    const seal = room.maze.seals[i];
    if (!seal || seal.open || room.sealCharges <= 0 || !room.explorer) return;
    const dist = Math.hypot(room.explorer.x - seal.mx, room.explorer.y - seal.my);
    if (dist > 1.2) {
      send(room.guide && room.guide.ws, { t: "err", text: "Latarnik musi stanąć przy drzwiach." });
      return;
    }
    room.sealCharges -= 1;
    seal.open = true;
    applySeals(room.maze);
    room.usedSeals = room.usedSeals || [];
    room.usedSeals.push({ t: room.roundT || 0, axis: seal.axis, x: seal.x, y: seal.y });
    room.fx.push("seal");
    return;
  }
  if (msg.t === "veil") {
    if (room.veilCd > 0) return;
    room.veil = 6;
    room.veilCd = 26;
    room.veilUsed = true;
    room.fx.push("veil");
    return;
  }
  if (msg.t === "call" && CALLS.has(msg.id)) {
    room.call = { id: msg.id, ttl: 1.7 };
  }
}

async function onMessage(ws, msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "create") return createRoom(ws, msg.role);
  if (msg.t === "join") return joinRoom(ws, msg.code);
  if (msg.t === "resume") return resume(ws, String(msg.code || "").toUpperCase(), String(msg.token || ""));
  const room = rooms.get(ws.roomCode);
  if (!room || !ws.player) return;
  if (msg.t === "start") {
    if (room.phase === "lobby" && bothOnline(room)) beginRound(room);
    else if (!bothOnline(room)) send(ws, { t: "err", text: "Czekam na drugą osobę." });
    return;
  }
  if (msg.t === "skip" && room.phase === "result") {
    room.nextIn = 0;
    return;
  }
  if (msg.t === "score" && room.phase === "result" && room.result === "win") {
    const name = cleanName(msg.name);
    if (!name || ws.player.scored === room.round) return;
    ws.player.scored = room.round;
    scores.push({
      name,
      time: Math.max(0, Math.round(room.roundT || 0)),
      chambers: room.round || 1,
      points: room.points || 0,
    });
    if (scores.length > 24) scores = publicScores();
    saveScores();
    const board = { t: "scores", scores: publicScores() };
    for (const role of ["guide", "runner"]) {
      if (online(room[role])) send(room[role].ws, board);
    }
    return;
  }
  if (msg.t === "knock" && ws.player.role === "runner" && room.phase === "play" && room.explorer) {
    const now = Date.now();
    if (now - (room.knockAt || 0) < 4500) return;
    room.knockAt = now;
    room.ping = { x: room.explorer.x, y: room.explorer.y, ttl: 8 };
    room.fx.push("knock");
    return;
  }
  if (msg.t === "pose" && ws.player.role === "runner") return onPose(room, msg);
  if (ws.player.role === "guide" && (msg.t === "ping" || msg.t === "seal" || msg.t === "veil" || msg.t === "call")) {
    return onGuide(room, msg);
  }
  if (msg.t === "leave") {
    dropPlayer(room, ws.player.role);
    ws.roomCode = null;
    ws.player = null;
    if (!room.guide && !room.runner) forgetRoom(room.code);
    else if (room.phase !== "lobby") {
      room.phase = "lobby";
      room.maze = null;
    }
    sendLobby(room);
  }
}

function onClose(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room || !ws.player) return;
  if (room[ws.player.role] === ws.player) {
    ws.player.ws = null;
    ws.player.goneAt = Date.now();
    if (room.phase === "play") {
      room.phase = "wait";
      room.note = ws.player.role === "runner" ? "Latarnik zniknął z mapy." : "Kartograf zamilkł.";
      broadcastSnap(room);
    } else sendLobby(room);
  }
}

const app = express();
app.use((req, res, next) => {
  // Tekstury HD mają wersję w adresie (?v= w render.js), więc mogą leżeć w cache przeglądarki.
  // Reszta zostaje bez cache, żeby zmiany w kodzie było widać od razu.
  if (req.path.startsWith("/tex/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  else res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/siec", (_req, res) => {
  res.json({ urls: lanUrls(PORT_LIVE) });
});
app.get("/tablica", (_req, res) => {
  res.json({ scores: publicScores() });
});
app.use("/shared", express.static(path.join(root, "shared")));
app.use(express.static(path.join(root, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
let PORT_LIVE = PORT;

wss.on("connection", (ws) => {
  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    onMessage(ws, msg).catch((err) => {
      console.error(err);
      send(ws, { t: "err", text: "Ruina nie odpowiada." });
    });
  });
  ws.on("close", () => onClose(ws));
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    tick(room);
    for (const role of ["guide", "runner"]) {
      const player = room[role];
      if (player && !online(player) && player.goneAt && now - player.goneAt > REJOIN_MS) {
        dropPlayer(room, role);
        if (!room.guide && !room.runner) forgetRoom(room.code);
        else {
          room.phase = "lobby";
          room.maze = null;
          sendLobby(room);
        }
      }
    }
  }
}, DT * 1000);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && PORT_LIVE < PORT + 15) {
    PORT_LIVE += 1;
    server.listen(PORT_LIVE, "0.0.0.0");
    return;
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", () => {
  PORT_LIVE = server.address().port;
  const urls = lanUrls(PORT_LIVE);
  console.log("\n  ZA LABIRYNTEM");
  console.log(`  komputer  http://localhost:${PORT_LIVE}`);
  if (urls.length) for (const url of urls) console.log(`  telefon   ${url}`);
  else console.log("  telefon   brak adresu w sieci — zostańcie na tym komputerze");
  console.log("");
});
