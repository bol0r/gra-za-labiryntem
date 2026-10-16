import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { gridPath } from "../shared/sim.js";

const port = process.argv[2] || 8787;
const url = `ws://127.0.0.1:${port}`;

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    let cursor = 0;
    ws.on("message", (buf) => inbox.push(JSON.parse(buf.toString())));
    ws.on("error", reject);
    ws.once("open", () => resolve({
      ws,
      async wait(pred, label) {
        const start = Date.now();
        while (Date.now() - start < 4000) {
          const found = inbox.find(pred);
          if (found) return found;
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error(label || "timeout");
      },
      catchUp() { cursor = inbox.length; },
      async next(pred, label) {
        const start = Date.now();
        while (Date.now() - start < 4000) {
          while (cursor < inbox.length) {
            const msg = inbox[cursor];
            cursor += 1;
            if (pred(msg)) return msg;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error(label || "timeout");
      },
      quiet(ms) {
        const from = inbox.length;
        return new Promise((resolve) => setTimeout(() => resolve(inbox.slice(from)), ms));
      },
      send(obj) { ws.send(JSON.stringify(obj)); },
    }));
  });
}

async function checkSwap() {
  const solo = await connect();
  solo.send({ t: "create", role: "guide", device: "computer" });
  const alone = await solo.wait((m) => m.t === "joined", "solo joined");
  assert.equal(alone.role, "guide");
  const soloLobby = await solo.wait((m) => m.t === "lobby", "solo lobby");
  assert.equal(soloLobby.both, false);
  assert.equal(soloLobby.players[0].device, "computer");
  solo.catchUp();
  solo.send({ t: "swap" });
  const soloNoise = await solo.quiet(250);
  assert.equal(soloNoise.some((m) => m.t === "joined"), false, "swap przy jednej osobie");
  solo.ws.close();

  const lamp = await connect();
  const map = await connect();
  lamp.send({ t: "create", role: "runner", device: "phone" });
  const made = await lamp.wait((m) => m.t === "joined", "swap create");
  assert.equal(made.role, "runner");
  map.send({ t: "join", code: made.code, device: "computer" });
  const mapJoined = await map.wait((m) => m.t === "joined", "swap join");
  assert.equal(mapJoined.role, "guide");
  const both = await lamp.wait((m) => m.t === "lobby" && m.both && m.players && m.players.length === 2, "swap both");
  const devices = Object.fromEntries(both.players.map((p) => [p.role, p.device]));
  assert.equal(devices.runner, "phone");
  assert.equal(devices.guide, "computer");

  lamp.catchUp();
  map.catchUp();
  lamp.send({ t: "swap" });
  const lampGuide = await lamp.next((m) => m.t === "joined", "lamp joined swap");
  const lampLobby = await lamp.next((m) => m.t === "lobby", "lamp lobby swap");
  const mapRunner = await map.next((m) => m.t === "joined", "map joined swap");
  const mapLobby = await map.next((m) => m.t === "lobby", "map lobby swap");
  assert.equal(lampGuide.role, "guide");
  assert.equal(lampGuide.token, made.token);
  assert.equal(lampLobby.role, "guide");
  assert.equal(mapRunner.role, "runner");
  assert.equal(mapRunner.token, mapJoined.token);
  assert.equal(mapLobby.role, "runner");
  assert.equal(lampLobby.players.find((p) => p.role === "guide").device, "phone");
  assert.equal(mapLobby.players.find((p) => p.role === "runner").device, "computer");

  lamp.catchUp();
  map.catchUp();
  map.send({ t: "swap" });
  const lampBack = await lamp.next((m) => m.t === "joined", "lamp back");
  const mapBack = await map.next((m) => m.t === "joined", "map back");
  assert.equal(lampBack.role, "runner");
  assert.equal(mapBack.role, "guide");
  assert.equal((await lamp.next((m) => m.t === "lobby", "lamp lobby back")).role, "runner");
  assert.equal((await map.next((m) => m.t === "lobby", "map lobby back")).role, "guide");

  lamp.catchUp();
  map.catchUp();
  lamp.send({ t: "swap" });
  const lampAgain = await lamp.next((m) => m.t === "joined", "lamp guide again");
  assert.equal(lampAgain.role, "guide");
  await map.next((m) => m.t === "joined" && m.role === "runner", "map runner again");
  await new Promise((resolve) => {
    lamp.ws.once("close", resolve);
    lamp.ws.close();
  });
  const resumed = await connect();
  resumed.send({ t: "resume", code: made.code, token: lampAgain.token, device: "phone" });
  const back = await resumed.wait((m) => m.t === "joined" && m.resumed, "resume after swap");
  assert.equal(back.role, "guide");
  assert.equal(back.token, lampAgain.token);
  const backLobby = await resumed.wait((m) => m.t === "lobby" && m.role === "guide" && m.both, "resume lobby");
  assert.equal(backLobby.role, "guide");

  resumed.send({ t: "start" });
  await map.wait((m) => m.t === "round", "round before rejected swap");
  resumed.catchUp();
  map.catchUp();
  resumed.send({ t: "swap" });
  map.send({ t: "swap" });
  const [duringA, duringB] = await Promise.all([resumed.quiet(350), map.quiet(350)]);
  assert.equal(duringA.some((m) => m.t === "joined" || m.t === "lobby"), false, "swap w rundzie");
  assert.equal(duringB.some((m) => m.t === "joined" || m.t === "lobby"), false, "swap w rundzie u drugiego");
  resumed.send({ t: "call", id: "stop" });
  const heard = await map.wait((m) => m.t === "snap" && m.call && m.call.id === "stop", "call after ignored swap");
  assert.equal(heard.call.id, "stop");
  resumed.ws.close();
  map.ws.close();
}

await checkSwap();

let guide;
let runner;
let created;
let round;
let sealPath = [];
for (let attempt = 0; attempt < 20; attempt++) {
  if (guide) {
    guide.ws.close();
    runner.ws.close();
  }
  guide = await connect();
  runner = await connect();
  guide.send({ t: "create", role: "guide" });
  created = await guide.wait((m) => m.t === "joined", "joined");
  assert.equal(created.role, "guide");
  assert.equal(created.code.length, 4);
  runner.send({ t: "join", code: created.code });
  const joined = await runner.wait((m) => m.t === "joined", "runner joined");
  assert.equal(joined.role, "runner");
  const ready = await guide.wait((m) => m.t === "lobby" && m.both, "both");
  assert.equal(ready.both, true);
  guide.send({ t: "start" });
  round = await runner.wait((m) => m.t === "round", "round");
  const seal = round.maze.seals[0];
  if (!seal) continue;
  const spot = seal.axis === "v" ? { x: seal.x - 1, y: seal.y } : { x: seal.x, y: seal.y - 1 };
  sealPath = gridPath(round.maze, round.maze.start.x, round.maze.start.y, spot.x, spot.y) || [spot];
  if (sealPath.length <= 16) break;
}
assert.ok(sealPath.length > 0 && sealPath.length <= 16, `droga do pieczęci ${sealPath.length}`);
assert.ok(round.maze.w >= 15);
assert.ok(round.spawn);
const snap = await guide.wait((m) => m.t === "snap" && m.phase === "play", "snap");
assert.equal(snap.sealCharges, 2);
assert.equal(snap.heat, 0);
assert.ok(snap.silence > 8, `silence ${snap.silence}`);
assert.ok(snap.sn);
guide.send({ t: "call", id: "stop" });
guide.send({ t: "ping", x: round.maze.relic.x + 0.5, y: round.maze.relic.y + 0.5 });
if (round.maze.seals.length) {
  for (const cell of sealPath) {
    await new Promise((r) => setTimeout(r, 460));
    runner.send({ t: "pose", x: cell.x + 0.5, y: cell.y + 0.5, a: round.spawn.a });
    await runner.wait((m) => m.t === "snap" && m.ex && Math.hypot(m.ex.x - (cell.x + 0.5), m.ex.y - (cell.y + 0.5)) < 0.4, "krok");
  }
  guide.send({ t: "seal", i: 0 });
}
guide.send({ t: "veil" });
const called = await runner.wait((m) => m.t === "snap" && m.call && m.call.id === "stop", "call");
assert.equal(called.call.id, "stop");
const sealed = await runner.wait((m) => m.t === "snap" && m.seals && m.seals[0] === true, "seal");
assert.equal(sealed.seals[0], true);
assert.ok(sealed.veil > 0);
runner.send({ t: "pose", x: round.spawn.x, y: round.spawn.y, a: round.spawn.a });
const moved = await guide.wait((m) => m.t === "snap" && m.ex, "pose");
assert.ok(Math.hypot(moved.ex.x - round.spawn.x, moved.ex.y - round.spawn.y) < 0.2);
guide.ws.close();
runner.ws.close();
console.log("smoke ok", created.code);
