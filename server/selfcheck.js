import assert from "node:assert/strict";
import { createBeasts, stepBeasts } from "./creatures.js";
import { generateMaze } from "./maze.js";
import { createSentinel, roundOutcome, stepSentinel } from "./sentinel.js";
import {
  canStand,
  departAngle,
  distanceMap,
  gridPath,
  hasLos,
  moveBody,
  openingSilence,
  raycast,
  senses,
  stepExplorer,
  wakeLevel,
} from "../shared/sim.js";

const corridor = {
  w: 3,
  h: 1,
  vWalls: [[true, false, false, true]],
  hWalls: [
    [true, true, true],
    [true, true, true],
  ],
  seals: [],
};

const east = raycast(corridor, 0.5, 0.5, 0);
assert.ok(Math.abs(east.dist - 2.5) < 0.08, `east dist ${east.dist}`);
const north = raycast(corridor, 0.5, 0.5, -Math.PI / 2);
assert.ok(Math.abs(north.dist - 0.5) < 0.08, `north dist ${north.dist}`);
assert.equal(hasLos(corridor, 0.5, 0.5, 2.5, 0.5), true);
assert.equal(hasLos(corridor, 0.5, 0.5, 0.5, 1.4), false);

const blocked = moveBody(corridor, 0.5, 0.5, 0, -0.4, 0.17);
assert.ok(blocked.y > 0.2, "should not cross the north wall");

assert.equal(wakeLevel(0, 0), 0);
assert.equal(wakeLevel(109, 0.4), 0);
assert.equal(wakeLevel(0, 0.5), 0);
assert.equal(wakeLevel(0, 0.75), 0.5);
assert.equal(wakeLevel(0, 1), 1);
assert.ok(Math.abs(wakeLevel(170, 0) - 0.5) < 0.001);
assert.equal(wakeLevel(40, 0.75), 0.5);
assert.equal(wakeLevel(230, 0.2), 1);
assert.equal(openingSilence(0), 10);
assert.equal(openingSilence(1), 0);
assert.equal(openingSilence(2), 0);
const sprintHear = senses(false, true, 0, 1).hear;
assert.ok(Math.abs(senses(false, true, 0, 0).hear - sprintHear * 0.6) < 1e-9);
assert.equal(senses(false, true, 0, 2).hear, sprintHear);
assert.equal(senses(false, false, 0, 0).hear, senses(false, false, 0, 1).hear);
assert.equal(senses(true, true, 0, 0).hear, 0);

function silenceBlocksSightButNotTouch() {
  const maze = {
    w: 5,
    h: 1,
    vWalls: [[true, false, false, false, false, true]],
    hWalls: [
      [true, true, true, true, true],
      [true, true, true, true, true],
    ],
    patrol: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ],
  };
  const room = {
    maze,
    explorer: { x: 3.2, y: 0.5, quiet: false, sprint: false },
    sentinel: createSentinel(maze),
    immunity: 0,
    silence: 10,
    veil: 0,
    wake: 0,
    heat: 0,
    phase: "play",
    roundT: 1,
    chaseAt: null,
    fx: [],
    points: 0,
  };
  stepSentinel(room, 1 / 20);
  assert.equal(room.sentinel.state, "patrol", "silence hides the lantern");
  room.silence = 0;
  stepSentinel(room, 1 / 20);
  assert.equal(room.sentinel.state, "alert", "without silence the hunter sees");
  room.explorer.x = room.sentinel.x + 0.2;
  room.explorer.y = room.sentinel.y;
  room.silence = 5;
  room.immunity = 0;
  assert.equal(roundOutcome(room), "lose", "silence does not block a touch");
}
silenceBlocksSightButNotTouch();

function patrolCrosses(maze) {
  const spine = gridPath(maze, maze.start.x, maze.start.y, maze.relic.x, maze.relic.y);
  assert.ok(spine && spine.length > 2);
  const on = new Set(spine.map((cell) => cell.y * maze.w + cell.x));
  const route = new Set();
  const patrol = maze.patrol || [];
  assert.ok(patrol.length >= 2, "patrol needs a crossing");
  for (let i = 0; i < patrol.length; i++) {
    const a = patrol[i];
    const b = patrol[(i + 1) % patrol.length];
    const leg = gridPath(maze, a.x, a.y, b.x, b.y) || [];
    for (const cell of leg) route.add(cell.y * maze.w + cell.x);
  }
  let onRoute = 0;
  let offRoute = 0;
  for (const key of route) {
    if (on.has(key)) onRoute += 1;
    else offRoute += 1;
  }
  assert.ok(onRoute > 0 && offRoute > 0, "patrol should cross the path to the heart");
  const trails = maze.trails || [];
  assert.ok(trails.length === 2 || trails.length === 3, `expected 2 or 3 trails, got ${trails.length}`);
  const used = new Set();
  for (const trail of trails) {
    assert.ok(trail.length >= 3, "trail too short");
    for (let i = 0; i < trail.length; i++) {
      const cell = trail[i];
      const key = cell.y * maze.w + cell.x;
      assert.equal(used.has(key), false, "trails overlap");
      used.add(key);
      assert.ok(!(cell.x === maze.start.x && cell.y === maze.start.y));
      assert.ok(!(cell.x === maze.relic.x && cell.y === maze.relic.y));
      if (i === 0) continue;
      const prev = trail[i - 1];
      assert.equal(Math.abs(cell.x - prev.x) + Math.abs(cell.y - prev.y), 1, "trail skips a cell");
    }
  }
}

function beastDropsTrail(maze) {
  const room = {
    maze,
    beasts: createBeasts(maze),
    explorer: { x: maze.start.x + 0.5, y: maze.start.y + 0.5, quiet: false },
    veil: 0,
    immunity: 0,
  };
  assert.equal(room.beasts.length, maze.trails.length);
  const beast = room.beasts[0];
  let seen = null;
  for (let y = 0; y < maze.h && !seen; y++) {
    for (let x = 0; x < maze.w && !seen; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dist = Math.hypot(px - beast.x, py - beast.y);
      if (dist < 1.4 || dist > 3.2) continue;
      if (!hasLos(maze, beast.x, beast.y, px, py)) continue;
      seen = { x: px, y: py, dist };
    }
  }
  assert.ok(seen, "a weaker creature can see an open cell");
  room.explorer.x = seen.x;
  room.explorer.y = seen.y;
  const before = Math.hypot(beast.x - seen.x, beast.y - seen.y);
  for (let i = 0; i < 50; i++) stepBeasts(room, 1 / 20);
  const after = Math.hypot(beast.x - seen.x, beast.y - seen.y);
  assert.ok(after < before - 0.25, `should follow while seen and moving (${before} -> ${after})`);
  assert.equal(beast.follow, true);
  room.explorer.quiet = true;
  for (let i = 0; i < 8; i++) stepBeasts(room, 1 / 20);
  assert.equal(beast.follow, false, "standing drops the trail");
  const hidden = { x: maze.relic.x + 0.5, y: maze.relic.y + 0.5 };
  room.explorer.quiet = false;
  room.explorer.x = hidden.x;
  room.explorer.y = hidden.y;
  if (hasLos(maze, beast.x, beast.y, hidden.x, hidden.y) && Math.hypot(hidden.x - beast.x, hidden.y - beast.y) < 3.4) {
    room.explorer.x = maze.start.x + 0.5;
    room.explorer.y = maze.start.y + 0.5;
  }
  for (let i = 0; i < 5; i++) stepBeasts(room, 1 / 20);
  const far = Math.hypot(room.explorer.x - beast.x, room.explorer.y - beast.y);
  const looks = far < 3.4 && hasLos(maze, beast.x, beast.y, room.explorer.x, room.explorer.y);
  if (!looks) assert.equal(beast.follow, false, "losing sight drops the trail");
}

for (const size of [15, 19, 21]) {
  for (let seed = 1; seed <= 40; seed++) patrolCrosses(generateMaze(size, seed * 17 + size));
  const maze = generateMaze(size, 1000 + size);
  const dist = distanceMap(maze, maze.start.x, maze.start.y);
  for (let y = 0; y < maze.h; y++) {
    for (let x = 0; x < maze.w; x++) assert.ok(dist[y][x] >= 0, "disconnected cell");
  }
  const path = gridPath(maze, maze.start.x, maze.start.y, maze.relic.x, maze.relic.y);
  assert.ok(path && path.length > size, `path too short for ${size}: ${path && path.length}`);
  assert.ok(maze.seals.length >= 1, "expected a seal");
  for (const seal of maze.seals) {
    if (seal.axis === "v") assert.equal(maze.vWalls[seal.y][seal.x], true);
    else assert.equal(maze.hWalls[seal.y][seal.x], true);
  }
  assert.ok(!(maze.start.x === maze.relic.x && maze.start.y === maze.relic.y));
  assert.ok(canStand(maze, maze.start.x + 0.5, maze.start.y + 0.5));

  let body = {
    x: maze.start.x + 0.5,
    y: maze.start.y + 0.5,
    a: departAngle(maze, maze.start.x, maze.start.y),
  };
  let steps = 0;
  for (let i = 1; i < path.length; i++) {
    const tx = path[i].x + 0.5;
    const ty = path[i].y + 0.5;
    let guard = 0;
    while (Math.hypot(tx - body.x, ty - body.y) > 0.2) {
      const angle = Math.atan2(ty - body.y, tx - body.x);
      const before = Math.hypot(tx - body.x, ty - body.y);
      stepExplorer(maze, body, { forward: 1, strafe: 0, angle, sprint: false }, 1 / 20);
      const after = Math.hypot(tx - body.x, ty - body.y);
      assert.ok(after < before + 0.02, `no progress toward ${tx},${ty} from ${body.x},${body.y}`);
      if (++guard > 240) throw new Error(`stuck going to ${tx},${ty} from ${body.x},${body.y}`);
    }
    steps += guard;
  }
  assert.equal(Math.floor(body.x), maze.relic.x);
  assert.equal(Math.floor(body.y), maze.relic.y);
  const seconds = (steps / 20).toFixed(1);
  console.log(`maze ${size} path ${path.length} seals ${maze.seals.length} trails ${maze.trails.length} walk ${seconds}s`);
}

beastDropsTrail(generateMaze(15, 12345));

console.log("selfcheck ok");
