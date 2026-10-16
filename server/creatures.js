import { hasLos, moveBody, nextStep } from "../shared/sim.js";

const ROUTE_SPEED = 0.62;
const FOLLOW_SPEED = 0.78;
const SIGHT = 3.4;

function toward(maze, body, tx, ty, speed, dt) {
  const dx = tx - body.x;
  const dy = ty - body.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return true;
  const same = Math.floor(body.x) === Math.floor(tx) && Math.floor(body.y) === Math.floor(ty);
  const step = same ? { x: tx, y: ty } : nextStep(maze, body.x, body.y, tx, ty) || { x: tx, y: ty };
  const sx = step.x - body.x;
  const sy = step.y - body.y;
  const sd = Math.hypot(sx, sy);
  if (sd < 0.001) return d < 0.2;
  const move = Math.min(sd, speed * dt);
  const pos = moveBody(maze, body.x, body.y, (sx / sd) * move, (sy / sd) * move, 0.16);
  if (Math.hypot(pos.x - body.x, pos.y - body.y) > 0.0001) body.a = Math.atan2(pos.y - body.y, pos.x - body.x);
  body.x = pos.x;
  body.y = pos.y;
  return Math.hypot(tx - body.x, ty - body.y) < 0.2;
}

function walkRoute(maze, beast, dt) {
  const trail = beast.trail;
  if (!trail.length) return;
  const cell = trail[beast.i] || trail[0];
  const arrived = toward(maze, beast, cell.x + 0.5, cell.y + 0.5, ROUTE_SPEED, dt);
  if (!arrived || trail.length < 2) return;
  let next = beast.i + beast.dir;
  if (next < 0 || next >= trail.length) {
    beast.dir *= -1;
    next = beast.i + beast.dir;
  }
  if (next >= 0 && next < trail.length) beast.i = next;
}

export function createBeasts(maze) {
  return (maze.trails || []).map((trail) => {
    const first = trail[0];
    const second = trail[1] || first;
    return {
      x: first.x + 0.5,
      y: first.y + 0.5,
      a: Math.atan2(second.y - first.y, second.x - first.x),
      trail,
      i: trail[1] ? 1 : 0,
      dir: 1,
      follow: false,
    };
  });
}

export function stepBeasts(room, dt) {
  const ex = room.explorer;
  const maze = room.maze;
  if (!ex || !maze || !room.beasts) return;
  for (const beast of room.beasts) {
    const dist = Math.hypot(ex.x - beast.x, ex.y - beast.y);
    const sees = dist < SIGHT && hasLos(maze, beast.x, beast.y, ex.x, ex.y);
    const moving = !ex.quiet;
    if (sees && moving) {
      beast.follow = true;
      toward(maze, beast, ex.x, ex.y, FOLLOW_SPEED, dt);
    } else {
      beast.follow = false;
      walkRoute(maze, beast, dt);
    }
  }
}
