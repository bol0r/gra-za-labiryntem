import assert from "node:assert/strict";
import { generateMaze } from "./maze.js";
import {
  canStand,
  departAngle,
  distanceMap,
  gridPath,
  hasLos,
  moveBody,
  raycast,
  stepExplorer,
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

for (const size of [15, 19, 21]) {
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
  console.log(`maze ${size} path ${path.length} seals ${maze.seals.length} walk ${seconds}s`);
}

console.log("selfcheck ok");
