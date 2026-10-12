import {
  CATCH,
  hasLos,
  moveBody,
  nextStep,
  normalizeAngle,
  senses,
  sentSpeed,
} from "../shared/sim.js";

function detect(room) {
  if (room.immunity > 0 || room.veil > 0) return null;
  const ex = room.explorer;
  const sn = room.sentinel;
  const dx = ex.x - sn.x;
  const dy = ex.y - sn.y;
  const dist = Math.hypot(dx, dy);
  const sense = senses(ex.quiet, ex.sprint, room.wake);
  const ang = Math.abs(normalizeAngle(Math.atan2(dy, dx) - sn.a));
  if (ang < sense.fov * 0.5 && dist < sense.sight && hasLos(room.maze, sn.x, sn.y, ex.x, ex.y)) return "sight";
  if (dist < sense.hear) return "hear";
  return null;
}

function setState(room, next) {
  if (room.sentinel.state === next) return;
  const prev = room.sentinel.state;
  room.sentinel.state = next;
  room.fx.push(next);
  if (prev === "hunt" && next !== "hunt" && room.phase === "play") {
    room.points = (room.points || 0) + 15;
    room.fx.push("escape");
  }
}

function moveToward(maze, sn, tx, ty, speed, dt) {
  const dx = tx - sn.x;
  const dy = ty - sn.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return;
  const step = Math.min(d, speed * dt);
  const pos = moveBody(maze, sn.x, sn.y, (dx / d) * step, (dy / d) * step, 0.18);
  if (Math.hypot(pos.x - sn.x, pos.y - sn.y) > 0.0001) sn.a = Math.atan2(pos.y - sn.y, pos.x - sn.x);
  sn.x = pos.x;
  sn.y = pos.y;
}

function chasePoint(maze, sn, tx, ty, speed, dt) {
  if (Math.hypot(tx - sn.x, ty - sn.y) < 0.18) return true;
  const same = Math.floor(sn.x) === Math.floor(tx) && Math.floor(sn.y) === Math.floor(ty);
  const step = same ? { x: tx, y: ty } : nextStep(maze, sn.x, sn.y, tx, ty) || { x: tx, y: ty };
  moveToward(maze, sn, step.x, step.y, speed, dt);
  return Math.hypot(tx - sn.x, ty - sn.y) < 0.18;
}

export function createSentinel(maze) {
  const patrol = maze.patrol;
  const first = patrol[0];
  const second = patrol[1] || first;
  return {
    x: first.x + 0.5,
    y: first.y + 0.5,
    a: Math.atan2(second.y - first.y, second.x - first.x),
    state: "patrol",
    timer: 0,
    lost: 0,
    tx: second.x + 0.5,
    ty: second.y + 0.5,
    pi: patrol[1] ? 1 : 0,
  };
}

export function stepSentinel(room, dt) {
  const sn = room.sentinel;
  const maze = room.maze;
  const ex = room.explorer;
  const how = detect(room);
  const speed = sentSpeed(sn.state, room.wake);

  if (room.veil > 0) {
    if (sn.state === "hunt" || sn.state === "alert") {
      setState(room, "search");
      sn.tx = ex.x + (sn.x - ex.x) * 0.2;
      sn.ty = ex.y + (sn.y - ex.y) * 0.2;
      sn.timer = 0;
      sn.lost = 0;
    }
  } else if (sn.state === "patrol") {
    if (how === "sight") {
      setState(room, "alert");
      sn.timer = 0.48;
    } else if (how === "hear") {
      setState(room, "search");
      sn.tx = ex.x;
      sn.ty = ex.y;
      sn.timer = 0;
    }
  } else if (sn.state === "alert") {
    sn.a = Math.atan2(ex.y - sn.y, ex.x - sn.x);
    sn.timer -= dt;
    if (sn.timer <= 0) {
      const still = detect(room);
      setState(room, still === "sight" ? "hunt" : "search");
      sn.tx = ex.x;
      sn.ty = ex.y;
      sn.lost = 0;
      sn.timer = 0;
    }
  } else if (sn.state === "hunt") {
    if (how === "sight") {
      sn.tx = ex.x;
      sn.ty = ex.y;
      sn.lost = 0;
    } else sn.lost += dt;
    if (sn.lost > 1.15) {
      setState(room, "search");
      sn.timer = 0;
    }
  } else if (sn.state === "search") {
    if (how === "sight") {
      setState(room, "alert");
      sn.timer = 0.32;
    } else if (how === "hear") {
      sn.tx = ex.x;
      sn.ty = ex.y;
      sn.timer = 0;
    }
  }

  if (sn.state === "alert") return;

  if (sn.state === "hunt") {
    chasePoint(maze, sn, sn.tx, sn.ty, speed, dt);
    return;
  }

  if (sn.state === "search") {
    const arrived = chasePoint(maze, sn, sn.tx, sn.ty, speed, dt);
    if (arrived) {
      sn.timer += dt;
      sn.a += dt * 0.85;
      if (sn.timer > 1.35) setState(room, "patrol");
    }
    return;
  }

  const arrived = chasePoint(maze, sn, sn.tx, sn.ty, speed, dt);
  if (!arrived) return;
  const patrol = maze.patrol;
  if (!patrol.length) return;
  sn.pi = (sn.pi + 1) % patrol.length;
  sn.tx = patrol[sn.pi].x + 0.5;
  sn.ty = patrol[sn.pi].y + 0.5;
}

export function roundOutcome(room) {
  const ex = room.explorer;
  const sn = room.sentinel;
  if (room.immunity <= 0 && Math.hypot(ex.x - sn.x, ex.y - sn.y) < CATCH) return "lose";
  if (Math.floor(ex.x) === room.maze.relic.x && Math.floor(ex.y) === room.maze.relic.y) return "win";
  return null;
}
