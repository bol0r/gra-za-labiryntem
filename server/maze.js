import { distanceMap, gridPath, mulberry32, neighbors } from "../shared/sim.js";

function openings(maze, x, y) {
  let n = 0;
  if (!maze.vWalls[y][x]) n++;
  if (!maze.vWalls[y][x + 1]) n++;
  if (!maze.hWalls[y][x]) n++;
  if (!maze.hWalls[y + 1][x]) n++;
  return n;
}

function farthestCell(dist) {
  let best = { x: 0, y: 0 };
  let score = -1;
  for (let y = 0; y < dist.length; y++) {
    for (let x = 0; x < dist[y].length; x++) {
      if (dist[y][x] > score) {
        score = dist[y][x];
        best = { x, y };
      }
    }
  }
  return best;
}

export function mazeSize(heat) {
  if (heat <= 0) return 15;
  if (heat === 1) return 19;
  return 21;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function carvePassages(size, rng) {
  const w = size;
  const h = size;
  const vWalls = Array.from({ length: h }, () => Array(w + 1).fill(true));
  const hWalls = Array.from({ length: h + 1 }, () => Array(w).fill(true));
  const seen = Array.from({ length: h }, () => Array(w).fill(false));
  const rib = Array.from({ length: h }, () => Array(w).fill(false));
  const minSpur = size >= 19 ? 5 : 4;
  const maxSpur = minSpur + 4;
  let filled = 0;

  function inside(x, y) {
    return x >= 0 && y >= 0 && x < w && y < h;
  }

  function knock(x, y, nx, ny) {
    if (nx === x + 1) vWalls[y][x + 1] = false;
    else if (nx === x - 1) vWalls[y][x] = false;
    else if (ny === y + 1) hWalls[y + 1][x] = false;
    else hWalls[y][x] = false;
  }

  function freeDirs(x, y) {
    const out = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (inside(nx, ny) && !seen[ny][nx]) out.push([dx, dy]);
    }
    return out;
  }

  function runLen(x, y, dx, dy) {
    let n = 0;
    let cx = x + dx;
    let cy = y + dy;
    while (inside(cx, cy) && !seen[cy][cx]) {
      n += 1;
      cx += dx;
      cy += dy;
    }
    return n;
  }

  function area(x, y) {
    if (!inside(x, y) || seen[y][x]) return 0;
    const stack = [[x, y]];
    const mark = new Set([y * w + x]);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = ny * w + nx;
        if (!inside(nx, ny) || seen[ny][nx] || mark.has(key)) continue;
        mark.add(key);
        stack.push([nx, ny]);
      }
    }
    return mark.size;
  }

  function degree(x, y) {
    let n = 0;
    if (!vWalls[y][x]) n += 1;
    if (!vWalls[y][x + 1]) n += 1;
    if (!hWalls[y][x]) n += 1;
    if (!hWalls[y + 1][x]) n += 1;
    return n;
  }

  function link(x, y, dx, dy, asRib) {
    const nx = x + dx;
    const ny = y + dy;
    knock(x, y, nx, ny);
    seen[ny][nx] = true;
    rib[ny][nx] = asRib || rib[y][x];
    filled += 1;
    return { x: nx, y: ny, dx, dy };
  }

  function pickWind(x, y, dx, dy, streak) {
    const options = freeDirs(x, y);
    if (!options.length) return null;
    const roomy = options.filter(([sx, sy]) => runLen(x, y, sx, sy) >= 2);
    const pool = roomy.length ? roomy : options;
    const straight = pool.find(([sx, sy]) => sx === dx && sy === dy);
    const turns = pool.filter(([sx, sy]) => sx !== dx || sy !== dy);
    if (straight && streak < 3 && rng() < 0.72) return straight;
    if (turns.length) return turns[Math.floor(rng() * turns.length)];
    return straight || pool[0];
  }

  function plant(from) {
    if (!from.dx && !from.dy) return null;
    const perps = [
      [-from.dy, from.dx],
      [from.dy, -from.dx],
    ].filter(([dx, dy]) => area(from.x + dx, from.y + dy) >= minSpur);
    if (!perps.length || rng() > 0.88) return null;
    const [dx, dy] = perps[Math.floor(rng() * perps.length)];
    const budget = minSpur + Math.floor(rng() * (maxSpur - minSpur + 1));
    const first = link(from.x, from.y, dx, dy, true);
    let tip = { x: first.x, y: first.y, dx, dy, streak: 1 };
    for (let i = 1; i < budget && filled < w * h; i++) {
      const step = pickWind(tip.x, tip.y, tip.dx, tip.dy, tip.streak);
      if (!step) break;
      const next = link(tip.x, tip.y, step[0], step[1], true);
      const same = step[0] === tip.dx && step[1] === tip.dy;
      tip = { x: next.x, y: next.y, dx: step[0], dy: step[1], streak: same ? tip.streak + 1 : 1 };
    }
    return tip;
  }

  function bestExtension() {
    let best = null;
    let bestScore = -Infinity;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!seen[y][x]) continue;
        const open = degree(x, y);
        for (const [dx, dy] of freeDirs(x, y)) {
          const pocket = area(x + dx, y + dy);
          const run = runLen(x, y, dx, dy);
          let score = pocket * 4 + Math.min(run, 4) * 2 + rng();
          if (open <= 1) score += 24;
          if (rib[y][x]) score += 12;
          else if (run < 2 && pocket < minSpur) score -= 30;
          if (score > bestScore) {
            bestScore = score;
            best = { x, y, dx, dy };
          }
        }
      }
    }
    return best;
  }

  seen[0][0] = true;
  filled = 1;
  let cursor = { x: 0, y: 0, dx: 0, dy: 0, streak: 0 };
  const tips = [];
  let since = 0;

  while (filled < w * h && cursor) {
    if (since >= 4) {
      const tip = plant(cursor);
      if (tip) {
        tips.push(tip);
        since = 0;
      } else since = 3;
    }
    const roomy = freeDirs(cursor.x, cursor.y).some(([dx, dy]) => runLen(cursor.x, cursor.y, dx, dy) >= 2);
    if (!roomy) break;
    const step = pickWind(cursor.x, cursor.y, cursor.dx, cursor.dy, cursor.streak);
    if (!step) break;
    const next = link(cursor.x, cursor.y, step[0], step[1], false);
    const same = step[0] === cursor.dx && step[1] === cursor.dy;
    cursor = { x: next.x, y: next.y, dx: step[0], dy: step[1], streak: same ? cursor.streak + 1 : 1 };
    since += 1;
  }

  let guard = w * h * 4;
  while (filled < w * h && guard-- > 0) {
    let moved = false;
    for (let i = tips.length - 1; i >= 0 && filled < w * h; i--) {
      const tip = tips[i];
      const roomy = freeDirs(tip.x, tip.y).filter(([dx, dy]) => runLen(tip.x, tip.y, dx, dy) >= 2);
      if (!roomy.length) {
        tips.splice(i, 1);
        continue;
      }
      const step = pickWind(tip.x, tip.y, tip.dx, tip.dy, tip.streak || 0);
      if (!step || runLen(tip.x, tip.y, step[0], step[1]) < 2) {
        tips.splice(i, 1);
        continue;
      }
      const next = link(tip.x, tip.y, step[0], step[1], true);
      const same = step[0] === tip.dx && step[1] === tip.dy;
      tips[i] = { x: next.x, y: next.y, dx: step[0], dy: step[1], streak: same ? (tip.streak || 0) + 1 : 1 };
      moved = true;
    }
    if (filled >= w * h) break;
    if (moved) continue;
    const jump = bestExtension();
    if (!jump) break;
    const next = link(jump.x, jump.y, jump.dx, jump.dy, true);
    tips.push({ x: next.x, y: next.y, dx: jump.dx, dy: jump.dy, streak: 1 });
  }

  while (filled < w * h) {
    const jump = bestExtension();
    if (!jump) break;
    link(jump.x, jump.y, jump.dx, jump.dy, true);
  }

  return { w, h, vWalls, hWalls };
}

export function generateMaze(size, seed) {
  const rng = mulberry32(seed);
  const { w, h, vWalls, hWalls } = carvePassages(size, rng);
  const maze = { w, h, vWalls, hWalls, seals: [] };
  const fromCorner = distanceMap(maze, 0, 0);
  const relic = farthestCell(fromCorner);
  const fromRelic = distanceMap(maze, relic.x, relic.y);
  const dead = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (openings(maze, x, y) === 1) dead.push({ x, y, d: fromRelic[y][x] });
    }
  }
  dead.sort((a, b) => b.d - a.d);
  let start = dead.find((c) => !(c.x === relic.x && c.y === relic.y)) || farthestCell(fromRelic);
  if (start.x === relic.x && start.y === relic.y) start = { x: 0, y: 0 };
  tuckStubs(maze, start, relic);

  const fromStart = distanceMap(maze, start.x, start.y);
  const candidates = [];
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      if (!vWalls[y][x]) continue;
      const d0 = fromStart[y][x - 1];
      const d1 = fromStart[y][x];
      if (d0 < 0 || d1 < 0) continue;
      const gap = Math.abs(d0 - d1);
      if (gap >= 6) candidates.push({ axis: "v", x, y, gap, mx: x, my: y + 0.5 });
    }
  }
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!hWalls[y][x]) continue;
      const d0 = fromStart[y - 1][x];
      const d1 = fromStart[y][x];
      if (d0 < 0 || d1 < 0) continue;
      const gap = Math.abs(d0 - d1);
      if (gap >= 6) candidates.push({ axis: "h", x, y, gap, mx: x + 0.5, my: y });
    }
  }
  candidates.sort((a, b) => b.gap - a.gap);
  for (const c of candidates) {
    if (maze.seals.length >= 3) break;
    if (maze.seals.some((s) => Math.hypot(s.mx - c.mx, s.my - c.my) < 4)) continue;
    maze.seals.push({ axis: c.axis, x: c.x, y: c.y, open: false, mx: c.mx, my: c.my });
  }

  const path = gridPath(maze, start.x, start.y, relic.x, relic.y) || [start, relic];
  const patrol = placePatrol(maze, path);

  maze.start = { x: start.x, y: start.y };
  maze.relic = { x: relic.x, y: relic.y };
  maze.patrol = patrol;
  maze.pathLength = path.length;
  maze.loot = placeLoot(maze, rng, start, relic);
  maze.trails = placeTrails(maze, patrol);
  return maze;
}

function wallClosed(maze, x, y, nx, ny) {
  if (nx === x + 1) return maze.vWalls[y][x + 1];
  if (nx === x - 1) return maze.vWalls[y][x];
  if (ny === y + 1) return maze.hWalls[y + 1][x];
  if (ny === y - 1) return maze.hWalls[y][x];
  return true;
}

function setWall(maze, x, y, nx, ny, closed) {
  if (nx === x + 1) maze.vWalls[y][x + 1] = closed;
  else if (nx === x - 1) maze.vWalls[y][x] = closed;
  else if (ny === y + 1) maze.hWalls[y + 1][x] = closed;
  else maze.hWalls[y][x] = closed;
}

function tuckStubs(maze, start, relic) {
  const path = gridPath(maze, start.x, start.y, relic.x, relic.y);
  if (!path) return;
  const on = new Set(path.map((cell) => cell.y * maze.w + cell.x));
  for (let guard = 0; guard < maze.w * maze.h; guard++) {
    let moved = false;
    for (let i = 1; i < path.length - 1 && !moved; i++) {
      const cell = path[i];
      for (const [sx, sy] of neighbors(maze, cell.x, cell.y)) {
        if (on.has(sy * maze.w + sx) || neighbors(maze, sx, sy).length !== 1) continue;
        for (const [dx, dy] of DIRS) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx < 0 || ny < 0 || nx >= maze.w || ny >= maze.h) continue;
          if ((nx === cell.x && ny === cell.y) || on.has(ny * maze.w + nx)) continue;
          if (!wallClosed(maze, sx, sy, nx, ny)) continue;
          setWall(maze, sx, sy, nx, ny, false);
          setWall(maze, sx, sy, cell.x, cell.y, true);
          moved = true;
          break;
        }
        if (moved) break;
      }
    }
    if (!moved) break;
  }
}

function branchTip(maze, origin, on) {
  const seeds = neighbors(maze, origin.x, origin.y).filter(([x, y]) => !on.has(y * maze.w + x));
  let best = null;
  let bestD = 0;
  for (const seed of seeds) {
    const q = [[seed[0], seed[1], 1]];
    const seen = new Set([origin.y * maze.w + origin.x, seed[1] * maze.w + seed[0]]);
    let tip = { x: seed[0], y: seed[1] };
    let depth = 1;
    for (let i = 0; i < q.length; i++) {
      const [x, y, d] = q[i];
      if (d > depth) {
        depth = d;
        tip = { x, y };
      }
      if (d >= 8) continue;
      for (const [nx, ny] of neighbors(maze, x, y)) {
        const key = ny * maze.w + nx;
        if (seen.has(key) || on.has(key)) continue;
        seen.add(key);
        q.push([nx, ny, d + 1]);
      }
    }
    if (depth > bestD) {
      bestD = depth;
      best = tip;
    }
  }
  return best ? { tip: best, depth: bestD } : null;
}

function placePatrol(maze, path) {
  const on = new Set(path.map((cell) => cell.y * maze.w + cell.x));
  const windows = [
    [Math.floor(path.length * 0.4), Math.floor(path.length * 0.78)],
    [1, Math.max(1, path.length - 2)],
  ];
  let best = null;
  for (const [lo, hi] of windows) {
    for (let i = lo; i <= hi && i < path.length - 1; i++) {
      const cell = path[i];
      const branch = branchTip(maze, cell, on);
      if (!branch) continue;
      const score = branch.depth * 1000 - Math.abs(i - path.length * 0.62);
      if (!best || score > best.score) best = { ...branch, cell, index: i, score };
    }
    if (best) break;
  }
  if (!best) {
    const mid = path[Math.min(path.length - 1, Math.floor(path.length * 0.6))] || path[0];
    return [{ x: mid.x, y: mid.y }];
  }
  const patrol = [best.tip, { x: best.cell.x, y: best.cell.y }];
  const ahead = path[Math.min(path.length - 2, best.index + 4)];
  if (
    ahead &&
    (ahead.x !== best.cell.x || ahead.y !== best.cell.y) &&
    (ahead.x !== best.tip.x || ahead.y !== best.tip.y)
  ) {
    patrol.push({ x: ahead.x, y: ahead.y });
  }
  return patrol;
}

function traceTrail(maze, start, banned, limit) {
  const route = [{ x: start.x, y: start.y }];
  let x = start.x;
  let y = start.y;
  let prev = null;
  while (route.length < limit) {
    const next = neighbors(maze, x, y).filter(([nx, ny]) => {
      if (prev && nx === prev[0] && ny === prev[1]) return false;
      return !banned.has(ny * maze.w + nx);
    });
    if (!next.length) break;
    if (prev && next.length > 1) break;
    prev = [x, y];
    x = next[0][0];
    y = next[0][1];
    route.push({ x, y });
  }
  return route;
}

function placeTrails(maze, patrol) {
  const banned = new Set();
  const ban = (x, y) => banned.add(y * maze.w + x);
  for (const cell of patrol || []) ban(cell.x, cell.y);
  if (maze.start) ban(maze.start.x, maze.start.y);
  if (maze.relic) ban(maze.relic.x, maze.relic.y);
  const ends = [];
  for (let y = 0; y < maze.h; y++) {
    for (let x = 0; x < maze.w; x++) {
      if (banned.has(y * maze.w + x)) continue;
      if (neighbors(maze, x, y).length === 1) ends.push({ x, y });
    }
  }
  ends.sort((a, b) => {
    const da = Math.hypot(a.x - maze.start.x, a.y - maze.start.y);
    const db = Math.hypot(b.x - maze.start.x, b.y - maze.start.y);
    return db - da;
  });
  const trails = [];
  const take = (route) => {
    if (route.length < 3 || trails.length >= 3) return;
    trails.push(route);
    for (const cell of route) ban(cell.x, cell.y);
  };
  for (const end of ends) {
    if (trails.length >= 3) break;
    if (banned.has(end.y * maze.w + end.x)) continue;
    take(traceTrail(maze, end, banned, 6));
  }
  for (let y = 0; y < maze.h && trails.length < 2; y++) {
    for (let x = 0; x < maze.w && trails.length < 2; x++) {
      if (banned.has(y * maze.w + x)) continue;
      if (neighbors(maze, x, y).length < 2) continue;
      take(traceTrail(maze, { x, y }, banned, 5));
    }
  }
  return trails;
}

function placeLoot(maze, rng, start, relic) {
  const cells = [];
  for (let y = 0; y < maze.h; y++) {
    for (let x = 0; x < maze.w; x++) {
      if ((x === start.x && y === start.y) || (x === relic.x && y === relic.y)) continue;
      if (Math.hypot(x - start.x, y - start.y) < 2) continue;
      if (Math.hypot(x - relic.x, y - relic.y) < 2) continue;
      cells.push({ x, y });
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const loot = [];
  cells.slice(0, 4).forEach((cell, index) => {
    loot.push({
      kind: index === 0 ? "key" : "shard",
      x: cell.x + 0.5,
      y: cell.y + 0.5,
      taken: false,
    });
  });
  return loot;
}
