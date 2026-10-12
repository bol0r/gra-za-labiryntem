import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { gridPath } from "../shared/sim.js";

const port = process.argv[2] || 8787;
const url = `ws://127.0.0.1:${port}`;

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
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
      send(obj) { ws.send(JSON.stringify(obj)); },
    }));
  });
}

const guide = await connect();
const runner = await connect();
guide.send({ t: "create", role: "guide" });
const created = await guide.wait((m) => m.t === "joined", "joined");
assert.equal(created.role, "guide");
assert.equal(created.code.length, 4);
runner.send({ t: "join", code: created.code });
const joined = await runner.wait((m) => m.t === "joined", "runner joined");
assert.equal(joined.role, "runner");
const ready = await guide.wait((m) => m.t === "lobby" && m.both, "both");
assert.equal(ready.both, true);
guide.send({ t: "start" });
const round = await runner.wait((m) => m.t === "round", "round");
assert.ok(round.maze.w >= 15);
assert.ok(round.spawn);
const snap = await guide.wait((m) => m.t === "snap" && m.phase === "play", "snap");
assert.equal(snap.sealCharges, 2);
assert.ok(snap.sn);
guide.send({ t: "call", id: "stop" });
guide.send({ t: "ping", x: round.maze.relic.x + 0.5, y: round.maze.relic.y + 0.5 });
if (round.maze.seals.length) {
  const seal = round.maze.seals[0];
  const spot = seal.axis === "v" ? { x: seal.x - 1, y: seal.y } : { x: seal.x, y: seal.y - 1 };
  const path = gridPath(round.maze, round.maze.start.x, round.maze.start.y, spot.x, spot.y) || [spot];
  for (const cell of path) {
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
