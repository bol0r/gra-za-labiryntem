export const FOV = 1.15;
export const WALK = 1.72;
export const SPRINT = 2.95;
export const RADIUS = 0.17;
export const CATCH = 0.4;
export const SENT_FOV = 1.7;
export const PATROL_SPEED = 1.22;
export const HUNT_SPEED = 2.18;

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function normalizeAngle(a) {
  const t = Math.PI * 2;
  a %= t;
  if (a <= -Math.PI) a += t;
  else if (a > Math.PI) a -= t;
  return a;
}

export function lerpAngle(a, b, t) {
  return a + normalizeAngle(b - a) * t;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function wakeLevel(roundT, along = 0) {
  const byTime = clamp((roundT - 110) / 120, 0, 1);
  const byPath = clamp(((along || 0) - 0.5) / 0.5, 0, 1);
  return Math.max(byTime, byPath);
}

export function openingSilence(heat) {
  return heat <= 0 ? 10 : 0;
}

export function senses(quiet, sprint, wake, heat = 1) {
  const hearSprint = heat <= 0 ? 5.8 * 0.6 : 5.8;
  return {
    sight: (quiet ? 2.4 : sprint ? 8.2 : 5.1) * (1 + wake * 0.22),
    fov: SENT_FOV,
    hear: (quiet ? 0 : sprint ? hearSprint : 1.5) * (1 + wake * 0.28),
  };
}

export function sentSpeed(state, wake) {
  const base = state === "hunt" ? HUNT_SPEED : state === "search" ? 1.7 : PATROL_SPEED;
  return base * (1 + wake * 0.45);
}

export function neighborOpen(maze, x, y, nx, ny) {
  if (nx < 0 || ny < 0 || nx >= maze.w || ny >= maze.h) return false;
  if (nx === x + 1 && ny === y) return !maze.vWalls[y][x + 1];
  if (nx === x - 1 && ny === y) return !maze.vWalls[y][x];
  if (ny === y + 1 && nx === x) return !maze.hWalls[y + 1][x];
  if (ny === y - 1 && nx === x) return !maze.hWalls[y][x];
  return false;
}

export function neighbors(maze, x, y) {
  const out = [];
  for (const [nx, ny] of [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ]) {
    if (neighborOpen(maze, x, y, nx, ny)) out.push([nx, ny]);
  }
  return out;
}

function cellsOpen(maze, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) + Math.abs(dy) === 1) return neighborOpen(maze, x0, y0, x1, y1);
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    return neighborOpen(maze, x0, y0, x1, y0) && neighborOpen(maze, x0, y0, x0, y1);
  }
  return false;
}

export function canStand(maze, x, y, radius = RADIUS) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= maze.w || cy >= maze.h) return false;
  const pts = [
    [x, y],
    [x - radius, y],
    [x + radius, y],
    [x, y - radius],
    [x, y + radius],
    [x - radius * 0.7, y - radius * 0.7],
    [x + radius * 0.7, y - radius * 0.7],
    [x - radius * 0.7, y + radius * 0.7],
    [x + radius * 0.7, y + radius * 0.7],
  ];
  for (const [px, py] of pts) {
    const qx = Math.floor(px);
    const qy = Math.floor(py);
    if (qx < 0 || qy < 0 || qx >= maze.w || qy >= maze.h) return false;
    if (qx === cx && qy === cy) continue;
    if (!cellsOpen(maze, cx, cy, qx, qy)) return false;
  }
  return true;
}

export function moveBody(maze, x, y, dx, dy, radius = RADIUS) {
  if (canStand(maze, x + dx, y, radius)) x += dx;
  if (canStand(maze, x, y + dy, radius)) y += dy;
  return { x, y };
}

export function stepExplorer(maze, body, input, dt) {
  body.a = input.angle;
  const forward = clamp(input.forward || 0, -1, 1);
  const strafe = clamp(input.strafe || 0, -1, 1);
  const mag = Math.hypot(forward, strafe);
  if (mag > 0.08) {
    const speed = (input.sprint ? SPRINT : WALK) * Math.min(1, mag);
    const f = forward / mag;
    const s = strafe / mag;
    const cos = Math.cos(body.a);
    const sin = Math.sin(body.a);
    const pos = moveBody(
      maze,
      body.x,
      body.y,
      (cos * f - sin * s) * speed * dt,
      (sin * f + cos * s) * speed * dt,
      RADIUS
    );
    body.x = pos.x;
    body.y = pos.y;
    body.moving = true;
    body.sprint = !!input.sprint;
    body.quiet = false;
  } else {
    body.moving = false;
    body.sprint = false;
    body.quiet = true;
  }
  return body;
}

export function raycast(maze, px, py, angle) {
  let dirX = Math.cos(angle);
  let dirY = Math.sin(angle);
  if (Math.abs(dirX) < 1e-8) dirX = dirX < 0 ? -1e-8 : 1e-8;
  if (Math.abs(dirY) < 1e-8) dirY = dirY < 0 ? -1e-8 : 1e-8;
  let mapX = Math.floor(px);
  let mapY = Math.floor(py);
  const deltaX = Math.abs(1 / dirX);
  const deltaY = Math.abs(1 / dirY);
  const stepX = dirX < 0 ? -1 : 1;
  const stepY = dirY < 0 ? -1 : 1;
  let sideDistX = dirX < 0 ? (px - mapX) * deltaX : (mapX + 1 - px) * deltaX;
  let sideDistY = dirY < 0 ? (py - mapY) * deltaY : (mapY + 1 - py) * deltaY;
  let side = 0;
  for (let i = 0; i < 80; i++) {
    const prevX = mapX;
    const prevY = mapY;
    if (sideDistX < sideDistY) {
      sideDistX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaY;
      mapY += stepY;
      side = 1;
    }
    const dist = side === 0 ? sideDistX - deltaX : sideDistY - deltaY;
    const oob = mapX < 0 || mapY < 0 || mapX >= maze.w || mapY >= maze.h;
    const blocked = oob || !neighborOpen(maze, prevX, prevY, mapX, mapY);
    if (!blocked) continue;
    let axis;
    let wx;
    let wy;
    if (side === 0) {
      axis = "v";
      wx = stepX > 0 ? mapX : prevX;
      wy = prevY;
    } else {
      axis = "h";
      wx = prevX;
      wy = stepY > 0 ? mapY : prevY;
    }
    let wallX = side === 0 ? py + dist * dirY : px + dist * dirX;
    wallX -= Math.floor(wallX);
    const seal = (maze.seals || []).findIndex(
      (s) => s.axis === axis && s.x === wx && s.y === wy && !s.open
    );
    return {
      dist: Math.max(0.02, dist),
      side,
      wallX,
      mapX: prevX,
      mapY: prevY,
      axis,
      wx,
      wy,
      seal,
    };
  }
  return { dist: 32, side: 0, wallX: 0, mapX, mapY, axis: "v", wx: 0, wy: 0, seal: -1 };
}

export function hasLos(maze, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return true;
  const hit = raycast(maze, x0, y0, Math.atan2(dy, dx));
  return hit.dist >= dist - 0.08;
}

export function distanceMap(maze, sx, sy) {
  const dist = Array.from({ length: maze.h }, () => Array(maze.w).fill(-1));
  const q = [[sx, sy]];
  dist[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [nx, ny] of neighbors(maze, x, y)) {
      if (dist[ny][nx] !== -1) continue;
      dist[ny][nx] = dist[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return dist;
}

export function gridPath(maze, x0, y0, x1, y1) {
  if (x0 === x1 && y0 === y1) return [{ x: x0, y: y0 }];
  const w = maze.w;
  const prev = new Map();
  const q = [[x0, y0]];
  prev.set(y0 * w + x0, null);
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [nx, ny] of neighbors(maze, x, y)) {
      const k = ny * w + nx;
      if (prev.has(k)) continue;
      prev.set(k, [x, y]);
      if (nx === x1 && ny === y1) {
        const path = [];
        let cx = x1;
        let cy = y1;
        while (true) {
          path.push({ x: cx, y: cy });
          const p = prev.get(cy * w + cx);
          if (!p) break;
          cx = p[0];
          cy = p[1];
        }
        path.reverse();
        return path;
      }
      q.push([nx, ny]);
    }
  }
  return null;
}

export function nextStep(maze, x, y, tx, ty) {
  const path = gridPath(maze, Math.floor(x), Math.floor(y), Math.floor(tx), Math.floor(ty));
  if (!path || path.length < 2) return null;
  return { x: path[1].x + 0.5, y: path[1].y + 0.5 };
}

export function departAngle(maze, x, y) {
  const opts = neighbors(maze, x, y);
  if (!opts.length) return 0;
  return Math.atan2(opts[0][1] - y, opts[0][0] - x);
}

export function applySeals(maze, states) {
  maze.seals.forEach((seal, i) => {
    const open = !!(states ? states[i] : seal.open);
    seal.open = open;
    if (seal.axis === "v") maze.vWalls[seal.y][seal.x] = !open;
    else maze.hWalls[seal.y][seal.x] = !open;
  });
}
