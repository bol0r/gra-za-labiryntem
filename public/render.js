import {
  FOV,
  SENT_FOV,
  clamp,
  gridPath,
  normalizeAngle,
  raycast,
  senses,
} from "/shared/sim.js";

const TEX = 128;
let textures = null;

function hash01(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function byte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function stoneTex(seed) {
  const data = new Uint8ClampedArray(TEX * TEX * 4);
  const bw = 32;
  const bh = 24;
  for (let y = 0; y < TEX; y++) {
    const row = Math.floor(y / bh);
    const shift = (row & 1) ? 16 : 0;
    const ly = y - row * bh;
    for (let x = 0; x < TEX; x++) {
      const sx = x + shift;
      const col = Math.floor(sx / bw);
      const lx = sx - col * bw;
      const grout = lx < 2 || ly < 2;
      const tone = hash01(col + seed * 19, row + seed * 7);
      const noise = (hash01(x + seed * 3, y + seed * 11) - 0.5) * 18;
      let r = 158 + tone * 52 + noise;
      let g = 132 + tone * 34 + noise * 0.62;
      let b = 102 + tone * 16 + noise * 0.3;
      if (!grout && ly < 7) {
        r += 14;
        g += 10;
        b += 4;
      }
      if (grout) {
        r = 54 + noise * 0.15;
        g = 46;
        b = 36;
      }
      const i = (y * TEX + x) * 4;
      data[i] = byte(r);
      data[i + 1] = byte(g);
      data[i + 2] = byte(b);
      data[i + 3] = 255;
    }
  }
  return data;
}

function sealTex() {
  const data = new Uint8ClampedArray(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let r = 62;
      let g = 48;
      let b = 36;
      const chev = Math.abs((x - 64) * 0.45) + 16;
      if (Math.abs(y - chev) < 3 || Math.abs(y - (chev + 28)) < 3) {
        r = 214;
        g = 148;
        b = 64;
      }
      const i = (y * TEX + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

function buildTextures() {
  return [stoneTex(1), stoneTex(2), stoneTex(3), stoneTex(4), sealTex()];
}

function texAt(id, u, v) {
  if (!textures) textures = buildTextures();
  const img = textures[id];
  const x = Math.floor(u * TEX) & (TEX - 1);
  const y = Math.floor(v * TEX) & (TEX - 1);
  const i = (y * TEX + x) * 4;
  return [img[i], img[i + 1], img[i + 2]];
}

function starAt(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) % 240 === 0;
}

const dust = Array.from({ length: 48 }, (_, i) => ({
  x: (i * 47) % 100 / 100,
  y: (i * 19) % 100 / 100,
  r: (i % 5) * 0.3 + 0.4,
  s: ((i % 7) + 2) * 0.004,
}));

export function drawLobby(ctx, w, h, time) {
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#070706");
  sky.addColorStop(0.45, "#16130f");
  sky.addColorStop(1, "#0c0d10");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const px = w * 0.72;
  const py = h * 0.28;
  const pr = Math.min(w, h) * 0.18;
  const planet = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr);
  planet.addColorStop(0, "#6a4a38");
  planet.addColorStop(0.55, "#3a2a28");
  planet.addColorStop(1, "rgba(20,16,18,0)");
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(143, 106, 82, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.62, Math.min(w, h) * 0.22, time * 0.15, time * 0.15 + 1.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.62, Math.min(w, h) * 0.3, -time * 0.1, -time * 0.1 + 2.4);
  ctx.stroke();
  ctx.fillStyle = "rgba(239, 231, 218, 0.45)";
  for (const speck of dust) {
    const x = ((speck.x + time * speck.s) % 1) * w;
    const y = speck.y * h;
    ctx.fillRect(x, y, speck.r, speck.r);
  }
}

export function drawExplorer(canvas, view) {
  const w = canvas.width;
  const h = canvas.height;
  if (!view.maze || w < 2 || h < 2) return;
  const ctx = canvas.getContext("2d", { alpha: false });
  const image = ctx._frame && ctx._frame.width === w && ctx._frame.height === h
    ? ctx._frame
    : (ctx._frame = ctx.createImageData(w, h));
  const data = image.data;
  const z = ctx._z && ctx._z.length === w ? ctx._z : (ctx._z = new Float32Array(w));
  z.fill(99);
  const { maze, body, time } = view;
  const moving = !!body.moving;
  const bob = moving ? Math.sin(time * (body.sprint ? 14 : 9)) * h * (body.sprint ? 0.012 : 0.008) : 0;
  const horizon = h * 0.5 + bob;
  const flick = 1 + 0.03 * Math.sin(time * 1.5);
  const pcx = w * 0.7;
  const pcy = h * 0.2;
  const pr = Math.min(w, h) * 0.18;
  const rayX = new Float32Array(w);
  const rayY = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const ang = body.a + (x / w - 0.5) * FOV;
    rayX[x] = Math.cos(ang);
    rayY[x] = Math.sin(ang);
  }
  for (let y = 0; y < h; y++) {
    const above = y < horizon;
    for (let x = 0; x < w; x++) {
      let r;
      let g;
      let b;
      if (above) {
        const t = horizon <= 1 ? 0 : y / horizon;
        const grain = (hash01(x >> 1, y >> 1) - 0.5) * 16;
        const mottling = (hash01(x >> 4, y >> 4) - 0.5) * 12;
        r = 22 + t * 16 + grain + mottling;
        g = 16 + t * 12 + grain * 0.55;
        b = 12 + t * 8 + grain * 0.25;
        const dx = x - pcx;
        const dy = y - pcy;
        const dist = Math.hypot(dx, dy);
        if (dist < pr) {
          const shade = 1 - dist / pr;
          const band = 0.65 + 0.35 * Math.sin(dy * 0.09 + 1.2);
          r = 48 + shade * 78 * band;
          g = 32 + shade * 40 * band;
          b = 22 + shade * 18;
        } else if (starAt(x >> 1, y >> 1)) {
          r = g = b = 210;
        }
      } else {
        const row = Math.max(1, y - horizon);
        const dist = (h * 0.5) / row;
        const camera = (x / w - 0.5) * FOV;
        const cone = Math.max(0.2, 1 - (Math.abs(camera) / (FOV * 0.48)) ** 2);
        const fall = 1 / (1 + dist * dist * 0.05);
        const lamp = fall * cone * flick;
        const wx = body.x + rayX[x] * dist;
        const wy = body.y + rayY[x] * dist;
        const grain = (hash01(Math.floor(wx * 18), Math.floor(wy * 18)) - 0.5) * 16;
        const tile = hash01(Math.floor(wx * 2), Math.floor(wy * 2));
        const near = clamp(1 - dist / 9, 0, 1);
        const glow = lamp * lamp;
        r = 24 + near * 10 + tile * 10 + glow * 168 + grain;
        g = 16 + near * 6 + tile * 5 + glow * 72 + grain * 0.45;
        b = 10 + near * 2 + tile * 2 + glow * 22;
        const fx = Math.abs(wx - Math.floor(wx));
        const fy = Math.abs(wy - Math.floor(wy));
        if (fx < 0.04 || fy < 0.04) {
          r *= 0.78;
          g *= 0.78;
          b *= 0.78;
        }
      }
      const i = (y * w + x) * 4;
      data[i] = byte(r);
      data[i + 1] = byte(g);
      data[i + 2] = byte(b);
      data[i + 3] = 255;
    }
  }

  const pa = body.a;
  for (let col = 0; col < w; col++) {
    const camera = (col / w - 0.5) * FOV;
    const hit = raycast(maze, body.x, body.y, pa + camera);
    z[col] = hit.dist;
    const line = h / hit.dist;
    const top = Math.max(0, Math.floor(horizon - line / 2));
    const bot = Math.min(h - 1, Math.floor(horizon + line / 2));
    const cone = Math.max(0.22, 1 - (Math.abs(camera) / (FOV * 0.48)) ** 2);
    const fall = 1 / (1 + hit.dist * hit.dist * 0.05);
    const side = hit.side === 1 ? 0.85 : 1;
    const fog = clamp((hit.dist - 1.2) / 12, 0, 0.58);
    const id = hit.seal >= 0 ? 4 : Math.abs(hit.mapX * 13 + hit.mapY * 7 + hit.side * 5) % 4;
    for (let y = top; y <= bot; y++) {
      const v = line <= 1 ? 0 : (y - (horizon - line / 2)) / line;
      const rgb = texAt(id, hit.wallX, v);
      const vy = (y - horizon) / (h * 0.55);
      const vsoft = Math.max(0.2, 1 - Math.abs(vy) * 1.25);
      let light = (0.25 + 0.75 * fall * cone * vsoft * flick) * side;
      if (light < 0.25) light = 0.25;
      let r = rgb[0] * light;
      let g = rgb[1] * light;
      let b = rgb[2] * light;
      r = r * (1 - fog) + 92 * fog;
      g = g * (1 - fog) + 62 * fog;
      b = b * (1 - fog) + 38 * fog;
      const i = (y * w + col) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  const sprites = [];
  if (view.sentinel) sprites.push({ ...view.sentinel, kind: "sentinel" });
  if (maze.relic) sprites.push({ x: maze.relic.x + 0.5, y: maze.relic.y + 0.5, kind: "relic" });
  if (view.ping) sprites.push({ x: view.ping.x, y: view.ping.y, kind: "ping" });
  sprites.sort((a, b) => {
    const da = (a.x - body.x) ** 2 + (a.y - body.y) ** 2;
    const db = (b.x - body.x) ** 2 + (b.y - body.y) ** 2;
    return db - da;
  });
  for (const sprite of sprites) blitSprite(data, z, w, h, horizon, body, sprite, time);

  ctx.putImageData(image, 0, 0);
}

function blitSprite(data, z, w, h, horizon, body, sprite, time) {
  const dx = sprite.x - body.x;
  const dy = sprite.y - body.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.18) return;
  const ang = normalizeAngle(Math.atan2(dy, dx) - body.a);
  if (Math.abs(ang) > FOV * 0.62) return;
  const screenX = (0.5 + ang / FOV) * w;
  const size = Math.min(h * 0.95, (h * (sprite.kind === "ping" ? 1.1 : 0.72)) / dist);
  const left = Math.floor(screenX - size * (sprite.kind === "ping" ? 0.08 : 0.5));
  const width = Math.max(2, Math.floor(size * (sprite.kind === "ping" ? 0.16 : 1)));
  const feet = Math.floor(horizon + (h * 0.5) / dist);
  const head = Math.floor(feet - size);
  for (let x = left; x < left + width; x++) {
    if (x < 0 || x >= w || z[x] < dist - 0.05) continue;
    const u = (x - left) / width;
    const y0 = Math.max(0, head);
    const y1 = Math.min(h, feet);
    for (let y = y0; y < y1; y++) {
      const v = (y - head) / Math.max(1, feet - head);
      const col = spriteColor(sprite, u, v, time);
      if (!col) continue;
      const i = (y * w + x) * 4;
      const a = col[3];
      data[i] = data[i] * (1 - a) + col[0] * a;
      data[i + 1] = data[i + 1] * (1 - a) + col[1] * a;
      data[i + 2] = data[i + 2] * (1 - a) + col[2] * a;
    }
  }
}

function spriteColor(sprite, u, v, time) {
  if (sprite.kind === "ping") {
    const band = Math.abs(u - 0.5);
    if (band > 0.5) return null;
    const pulse = 0.35 + 0.25 * Math.sin(time * 6 + v * 8);
    return [176, 124, 86, (1 - band * 1.6) * pulse];
  }
  const cx = u - 0.5;
  const cy = v - 0.56;
  if (sprite.kind === "relic") {
    const d = Math.abs(cx) * 1.15 + Math.abs(cy);
    if (d > 0.42) return null;
    const core = d < 0.12 ? 1 : 0;
    const pulse = 0.75 + 0.25 * Math.sin(time * 3);
    return [220 * pulse, 150 * pulse, 70, core ? 0.95 : 0.55 + (0.42 - d)];
  }
  const r = Math.hypot(cx * 1.25, cy);
  if (r > 0.5) return null;
  const hunt = sprite.state === "hunt";
  const eye = Math.abs(cx) < (hunt ? 0.07 : 0.04) && v > 0.3 && v < 0.74;
  const ring = Math.abs(r - 0.3) < 0.03 || Math.abs(r - 0.4) < 0.02;
  if (eye) return hunt ? [196, 72, 52, 1] : [196, 206, 140, 1];
  if (r < 0.1) return [168, 184, 96, 0.95];
  if (ring) return hunt ? [176, 84, 58, 0.9] : [140, 156, 78, 0.85];
  return [30 + (1 - r) * 40, 48 + (1 - r) * 50, 28, 0.22 + (0.5 - r)];
}

export function drawBeacon(ctx, w, h, body, ping) {
  if (!ping || !body) return;
  const ang = normalizeAngle(Math.atan2(ping.y - body.y, ping.x - body.x) - body.a);
  const rx = w * 0.42;
  const ry = h * 0.36;
  const x = w / 2 + Math.sin(ang) * rx;
  const y = h / 2 - Math.cos(ang) * ry;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = "rgba(196, 164, 138, 0.95)";
  ctx.fillStyle = "rgba(196, 164, 138, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(6, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawVignette(ctx, w, h, threat, veil) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.min(w, h) * 0.72);
  g.addColorStop(0, "rgba(20,12,8,0)");
  g.addColorStop(0.55, "rgba(20,12,8,0)");
  g.addColorStop(1, `rgba(20,12,8,${0.38 + threat * 0.2})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (threat > 0.08) {
    ctx.fillStyle = `rgba(180, 40, 24, ${threat * 0.28})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (veil > 0) {
    ctx.fillStyle = "rgba(143, 106, 82, 0.1)";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.strokeStyle = "rgba(239, 231, 218, 0.28)";
  ctx.lineWidth = 1;
  const cx = w / 2;
  const cy = h / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy);
  ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy);
  ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3);
  ctx.lineTo(cx, cy + 10);
  ctx.stroke();
}

export function drawGuide(ctx, w, h, view) {
  const { maze, explorer, sentinel, ping, time, wake } = view;
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * 0.7);
  bg.addColorStop(0, "#161410");
  bg.addColorStop(1, "#070706");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (!maze || !explorer) return null;
  const pad = 28;
  const size = Math.min((w - pad * 2) / maze.w, (h - pad * 2) / maze.h);
  const ox = (w - size * maze.w) / 2;
  const oy = (h - size * maze.h) / 2;
  const toX = (x) => ox + x * size;
  const toY = (y) => oy + y * size;
  const relic = maze.relic;

  for (let y = 0; y < maze.h; y++) {
    for (let x = 0; x < maze.w; x++) {
      const n = hash01(x + 3, y + 11);
      const r = 214 + n * 22;
      const g = 202 + n * 14;
      const b = 176 + n * 10;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(toX(x), toY(y), size + 0.5, size + 0.5);
    }
  }
  ctx.strokeStyle = "rgba(92, 72, 48, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y <= maze.h; y++) {
    ctx.moveTo(toX(0), toY(y));
    ctx.lineTo(toX(maze.w), toY(y));
  }
  for (let x = 0; x <= maze.w; x++) {
    ctx.moveTo(toX(x), toY(0));
    ctx.lineTo(toX(x), toY(maze.h));
  }
  ctx.stroke();

  if (sentinel) {
    const sense = senses(explorer.quiet, explorer.sprint, wake || 0);
    const sx = toX(sentinel.x);
    const sy = toY(sentinel.y);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = -10; i <= 10; i++) {
      const a = sentinel.a + (i / 10) * (SENT_FOV / 2);
      const hit = raycast(maze, sentinel.x, sentinel.y, a);
      const reach = Math.min(hit.dist, sense.sight);
      ctx.lineTo(toX(sentinel.x + Math.cos(a) * reach), toY(sentinel.y + Math.sin(a) * reach));
    }
    ctx.closePath();
    ctx.fillStyle = sentinel.state === "hunt" ? "rgba(196, 64, 40, 0.28)" : "rgba(31, 138, 50, 0.22)";
    ctx.fill();
    if (sense.hear > 0.2) {
      ctx.beginPath();
      ctx.arc(sx, sy, sense.hear * size, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(31, 120, 42, 0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.moveTo(toX(explorer.x), toY(explorer.y));
  for (let i = -8; i <= 8; i++) {
    const a = explorer.a + (i / 8) * (FOV / 2);
    const hit = raycast(maze, explorer.x, explorer.y, a);
    ctx.lineTo(toX(explorer.x + Math.cos(a) * hit.dist), toY(explorer.y + Math.sin(a) * hit.dist));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(196, 112, 42, 0.38)";
  ctx.fill();
  const ex = toX(explorer.x);
  const ey = toY(explorer.y);
  const poolR = size * 2.4;
  const pool = ctx.createRadialGradient(ex, ey, size * 0.15, ex, ey, poolR);
  pool.addColorStop(0, "rgba(255, 168, 64, 0.72)");
  pool.addColorStop(0.45, "rgba(226, 140, 60, 0.28)");
  pool.addColorStop(1, "rgba(226, 140, 60, 0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(ex, ey, poolR, 0, Math.PI * 2);
  ctx.fill();

  const thick = Math.max(5, size * 0.2);
  const shadow = 3;
  for (let y = 0; y < maze.h; y++) {
    for (let x = 0; x <= maze.w; x++) {
      if (!maze.vWalls[y][x]) continue;
      stoneWall(ctx, toX(x) - thick / 2, toY(y), thick, size, shadow);
    }
  }
  for (let y = 0; y <= maze.h; y++) {
    for (let x = 0; x < maze.w; x++) {
      if (!maze.hWalls[y][x]) continue;
      stoneWall(ctx, toX(x), toY(y) - thick / 2, size, thick, shadow);
    }
  }

  ctx.setLineDash([4, 7]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(46, 110, 48, 0.55)";
  ctx.beginPath();
  const patrol = maze.patrol || [];
  for (let i = 0; i < patrol.length; i++) {
    const a = patrol[i];
    const b = patrol[(i + 1) % patrol.length];
    const path = gridPath(maze, a.x, a.y, b.x, b.y);
    if (!path) continue;
    path.forEach((cell, index) => {
      const x = toX(cell.x + 0.5);
      const y = toY(cell.y + 0.5);
      if (index === 0 && i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const seal of maze.seals || []) {
    if (seal.open) continue;
    const midX = seal.axis === "v" ? seal.x : seal.x + 0.5;
    const midY = seal.axis === "v" ? seal.y + 0.5 : seal.y;
    const x = toX(midX);
    const y = toY(midY);
    const s = Math.max(6, size * 0.22);
    ctx.fillStyle = "rgba(226, 150, 48, 0.55)";
    ctx.beginPath();
    ctx.arc(x, y, s * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#e2a45a";
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  const pulse = 0.65 + 0.35 * Math.sin(time * 3);
  ctx.fillStyle = `rgba(226, 164, 90, ${0.35 + pulse * 0.4})`;
  ctx.beginPath();
  ctx.arc(toX(relic.x + 0.5), toY(relic.y + 0.5), Math.max(5, size * 0.28) * pulse, 0, Math.PI * 2);
  ctx.fill();

  if (sentinel) {
    const hunting = sentinel.state === "hunt";
    const beat = hunting ? 0.82 + 0.18 * Math.sin(time * 8) : 1;
    ctx.save();
    ctx.globalAlpha = beat;
    drawActor(ctx, toX(sentinel.x), toY(sentinel.y), sentinel.a, "#1f8a32", size * (hunting ? 1.15 * beat : 1));
    ctx.restore();
  }
  drawActor(ctx, ex, ey, explorer.a, "#8a3e12", size * 1.15);

  if (ping && ping.ttl > 0) {
    const radius = (1.2 - ping.ttl / 12) * size * 0.8;
    ctx.beginPath();
    ctx.arc(toX(ping.x), toY(ping.y), Math.max(4, radius), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(196, 164, 138, 0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  return { ox, oy, size };
}

function stoneWall(ctx, x, y, w, h, shadow) {
  ctx.fillStyle = "rgba(42, 28, 16, 0.38)";
  ctx.fillRect(x + shadow, y + shadow, w, h);
  ctx.fillStyle = "#5c5146";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(236, 224, 200, 0.45)";
  if (w >= h) ctx.fillRect(x, y, w, Math.max(1, h * 0.28));
  else ctx.fillRect(x, y, Math.max(1, w * 0.28), h);
}

function drawActor(ctx, x, y, angle, color, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  const tip = Math.max(7, size * 0.28);
  ctx.moveTo(tip, 0);
  ctx.lineTo(-tip * 0.7, tip * 0.55);
  ctx.lineTo(-tip * 0.4, 0);
  ctx.lineTo(-tip * 0.7, -tip * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
