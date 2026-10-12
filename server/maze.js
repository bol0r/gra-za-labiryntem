import { distanceMap, gridPath, mulberry32 } from "../shared/sim.js";

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
  const slice = path.slice(Math.floor(path.length * 0.42), Math.max(Math.floor(path.length * 0.42) + 1, Math.floor(path.length * 0.86)));
  const patrol = [];
  for (let i = 0; i < 4; i++) {
    const cell = slice[Math.min(slice.length - 1, Math.floor((i / 3) * (slice.length - 1)))] || slice[0];
    if (!patrol.some((p) => p.x === cell.x && p.y === cell.y)) patrol.push({ x: cell.x, y: cell.y });
  }
  if (!patrol.length) patrol.push({ x: relic.x, y: relic.y });

  maze.start = { x: start.x, y: start.y };
  maze.relic = { x: relic.x, y: relic.y };
  maze.patrol = patrol;
  maze.pathLength = path.length;
  maze.loot = placeLoot(maze, rng, start, relic);
  return maze;
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
