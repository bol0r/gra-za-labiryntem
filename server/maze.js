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

export function generateMaze(size, seed) {
  const rng = mulberry32(seed);
  const w = size;
  const h = size;
  const vWalls = Array.from({ length: h }, () => Array(w + 1).fill(true));
  const hWalls = Array.from({ length: h + 1 }, () => Array(w).fill(true));
  const seen = Array.from({ length: h }, () => Array(w).fill(false));

  function carve(x, y) {
    seen[y][x] = true;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny][nx]) continue;
      if (dx === 1) vWalls[y][x + 1] = false;
      else if (dx === -1) vWalls[y][x] = false;
      else if (dy === 1) hWalls[y + 1][x] = false;
      else hWalls[y][x] = false;
      carve(nx, ny);
    }
  }

  carve(0, 0);
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
  return maze;
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
