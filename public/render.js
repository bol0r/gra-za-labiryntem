import {
  FOV,
  SENT_FOV,
  clamp,
  gridPath,
  hasLos,
  normalizeAngle,
  raycast,
  senses,
} from "/shared/sim.js";

const TEX = 128;
const RAD = 180 / Math.PI;
let proc = null;
let hd = null;
let wantHd = false;
let hdLoading = false;
let texR = 0;
let texG = 0;
let texB = 0;
let skyX = new Int32Array(0);
let skyY = new Int32Array(0);
let planetU = new Int16Array(0);
let planetV = new Int16Array(0);
let rowCenter = new Float32Array(0);
let rowLvl = new Uint8Array(0);
let colTop = new Int16Array(0);
let colBot = new Int16Array(0);
let colRx = new Float32Array(0);
let colRy = new Float32Array(0);
let colOff = new Float32Array(0);
let colWallX = new Float32Array(0);
let colLine = new Float32Array(0);
let colFall = new Float32Array(0);
let colCone = new Float32Array(0);
let colFog = new Float32Array(0);
let colSide = new Float32Array(0);
let colId = new Uint8Array(0);

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

function runeTex() {
  const data = stoneTex(9);
  const ink = (x, y) => {
    if (x < 0 || y < 0 || x >= TEX || y >= TEX) return;
    const i = (y * TEX + x) * 4;
    data[i] = 92;
    data[i + 1] = 64;
    data[i + 2] = 40;
  };
  const line = (x0, y0, x1, y1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps);
      const y = Math.round(y0 + ((y1 - y0) * s) / steps);
      ink(x, y);
      ink(x + 1, y);
    }
  };
  for (let row = 0; row < 2; row++) {
    for (let g = 0; g < 3; g++) {
      const ox = 16 + g * 36;
      const oy = 34 + row * 42;
      const code = (row + 1) * (g + 3);
      line(ox, oy, ox + 18, oy + 24);
      if (code % 2) line(ox + 18, oy, ox, oy + 24);
      if (code % 3) line(ox, oy + 12, ox + 18, oy + 12);
      line(ox + 9, oy - 6, ox + 9, oy + 28);
    }
  }
  return data;
}

function floorTex() {
  const data = new Uint8ClampedArray(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const col = Math.floor(x / 32);
      const row = Math.floor(y / 26);
      const lx = x - col * 32;
      const ly = y - row * 26;
      const mortar = lx < 2 || ly < 2 || lx > 29;
      const tone = hash01(col * 5 + 2, row * 9 + 4);
      const grit = (hash01(x * 3, y * 5) - 0.5) * 22;
      const crack = Math.abs(lx - 14 - (row % 3) * 4) < 1 && ly > 6 && ly < 22;
      let r = 78 + tone * 36 + grit;
      let g = 62 + tone * 22 + grit * 0.6;
      let b = 46 + tone * 12 + grit * 0.3;
      if (mortar) {
        r = 36;
        g = 30;
        b = 24;
      }
      if (crack) {
        r *= 0.45;
        g *= 0.45;
        b *= 0.45;
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

function buildProc() {
  if (proc) return proc;
  const made = [stoneTex(1), stoneTex(2), stoneTex(3), stoneTex(4), sealTex(), runeTex(), floorTex()];
  proc = made.map((data) => ({ size: TEX, levels: [data] }));
  return proc;
}

function sample(tex, u, v, lvl) {
  const max = tex.levels.length - 1;
  const level = lvl < 0 ? 0 : lvl > max ? max : lvl;
  const size = tex.size >> level;
  const img = tex.levels[level];
  const x = Math.floor(u * size) & (size - 1);
  const y = Math.floor(v * size) & (size - 1);
  const i = (y * size + x) << 2;
  texR = img[i];
  texG = img[i + 1];
  texB = img[i + 2];
}

function mipDown(src, size) {
  const n = size >> 1;
  const dst = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    const row = y * 2 * size;
    for (let x = 0; x < n; x++) {
      const i00 = (row + x * 2) << 2;
      const i10 = i00 + 4;
      const i01 = i00 + (size << 2);
      const i11 = i01 + 4;
      const o = (y * n + x) << 2;
      dst[o] = (src[i00] + src[i10] + src[i01] + src[i11] + 2) >> 2;
      dst[o + 1] = (src[i00 + 1] + src[i10 + 1] + src[i01 + 1] + src[i11 + 1] + 2) >> 2;
      dst[o + 2] = (src[i00 + 2] + src[i10 + 2] + src[i01 + 2] + src[i11 + 2] + 2) >> 2;
      dst[o + 3] = (src[i00 + 3] + src[i10 + 3] + src[i01 + 3] + src[i11 + 3] + 2) >> 2;
    }
  }
  return dst;
}

function withMips(data, size) {
  const levels = [data];
  let cur = data;
  let s = size;
  for (let i = 0; i < 3; i++) {
    cur = mipDown(cur, s);
    s >>= 1;
    levels.push(cur);
  }
  return { size, levels };
}

function imagePixels(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height).data;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

const HD_NAMES = ["wall_a.png", "wall_b.png", "wall_c.png", "wall_d.png", "seal.png", "rune.png", "floor.png", "sky.png", "planet.png"];

function loadHd() {
  hdLoading = true;
  Promise.all(HD_NAMES.map((name) => loadImage(`/tex/hd/${name}`))).then((imgs) => {
    const tex = imgs.slice(0, 7).map((img) => withMips(imagePixels(img), img.width));
    const skyImg = imgs[7];
    const planetImg = imgs[8];
    hd = {
      tex,
      sky: imagePixels(skyImg),
      skyW: skyImg.width,
      skyH: skyImg.height,
      planet: imagePixels(planetImg),
      planetW: planetImg.width,
      planetH: planetImg.height,
    };
    hdLoading = false;
  }).catch(() => {
    hd = null;
    hdLoading = false;
  });
}

export function setHdEnabled(on) {
  wantHd = !!on;
  if (wantHd && !hd && !hdLoading) loadHd();
}

export function hdActive() {
  return !!(wantHd && hd);
}

function packOn() {
  return hdActive();
}

function growRows(n) {
  if (rowCenter.length >= n) return;
  rowCenter = new Float32Array(n);
  rowLvl = new Uint8Array(n);
}

function growCols(n) {
  if (colTop.length >= n) return;
  colTop = new Int16Array(n);
  colBot = new Int16Array(n);
  colRx = new Float32Array(n);
  colRy = new Float32Array(n);
  colOff = new Float32Array(n);
  colWallX = new Float32Array(n);
  colLine = new Float32Array(n);
  colFall = new Float32Array(n);
  colCone = new Float32Array(n);
  colFog = new Float32Array(n);
  colSide = new Float32Array(n);
  colId = new Uint8Array(n);
}

function paintPacked(data, z, w, h, maze, body, aim, horizon, flick, focal) {
  const skyRows = Math.min(h, Math.ceil(horizon));
  skyX = growInt(skyX, w, false);
  skyY = growInt(skyY, h, false);
  planetU = growInt(planetU, w, true);
  planetV = growInt(planetV, h, true);
  growRows(h);
  const skyData = hd.sky;
  const skyW = hd.skyW;
  const skyH = hd.skyH;
  const planetData = hd.planet;
  const planetW = hd.planetW;
  const planetH = hd.planetH;
  const floorTex = hd.tex[6];
  const fLevels = floorTex.levels;
  const fBase = floorTex.size;
  const cosAim = Math.cos(aim);
  const sinAim = Math.sin(aim);
  const halfW = w * 0.5;
  const fovCone = FOV * 0.48;
  const hSoft = h * 0.55;
  for (let x = 0; x < w; x++) {
    const az = ((aim + Math.atan((x - halfW) / focal)) * RAD % 360 + 360) % 360;
    let sx = (az / 360) * skyW;
    if (sx >= skyW) sx = 0;
    skyX[x] = sx | 0;
    const du = wrap180(az - 40);
    const pu = (du / 6.5) * 168 + 384;
    planetU[x] = pu < 0 || pu >= planetW ? -1 : pu | 0;
  }
  for (let y = 0; y < h; y++) {
    if (y < skyRows) {
      const el = Math.atan((horizon - y) / focal) * RAD;
      let sy = ((90 - el) / 90) * skyH;
      if (sy < 0) sy = 0;
      else if (sy >= skyH) sy = skyH - 1;
      skyY[y] = sy | 0;
      const pv = -(((el - 13) / 6.5) * 168) + 384;
      planetV[y] = pv < 0 || pv >= planetH ? -1 : pv | 0;
    }
    if (y < horizon) {
      rowCenter[y] = 0;
      rowLvl[y] = 0;
    } else {
      const centerDist = (0.5 * focal) / Math.max(1, y - horizon);
      rowCenter[y] = centerDist;
      rowLvl[y] = floorLevel(centerDist, focal);
    }
  }
  growCols(w);
  for (let col = 0; col < w; col++) {
    const off = Math.atan((col - halfW) / focal);
    const ang = aim + off;
    const rx = Math.cos(ang);
    const ry = Math.sin(ang);
    colOff[col] = off;
    colRx[col] = rx;
    colRy[col] = ry;
    const hit = raycast(maze, body.x, body.y, ang);
    z[col] = hit.dist;
    const line = focal / hit.dist;
    colLine[col] = line;
    colTop[col] = Math.max(0, Math.min(h, Math.floor(horizon - line / 2)));
    colBot[col] = Math.max(-1, Math.min(h - 1, Math.floor(horizon + line / 2)));
    colWallX[col] = hit.wallX;
    const absOff = off < 0 ? -off : off;
    colCone[col] = Math.max(0.22, 1 - (absOff / fovCone) * (absOff / fovCone));
    colFall[col] = 1 / (1 + hit.dist * hit.dist * 0.05);
    colSide[col] = hit.side === 1 ? 0.85 : 1;
    colFog[col] = clamp((hit.dist - 1.2) / 12, 0, 0.58);
    const carved = hash01(hit.wx * 3 + 1, hit.wy * 5 + hit.side) > 0.78;
    colId[col] = hit.seal >= 0 ? 4 : carved ? 5 : Math.abs(hit.mapX * 13 + hit.mapY * 7 + hit.side * 5) % 4;
  }
  const skyEnd = Math.min(h, Math.max(0, Math.ceil(horizon)));
  for (let y = 0; y < skyEnd; y++) {
    const pv = planetV[y];
    const sy = skyY[y] * skyW;
    let i = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (y >= colTop[x]) {
        i += 4;
        continue;
      }
      const si = (sy + skyX[x]) << 2;
      let r = skyData[si];
      let g = skyData[si + 1];
      let b = skyData[si + 2];
      const pu = planetU[x];
      if (pu >= 0 && pv >= 0) {
        const pi = (pv * planetW + pu) << 2;
        const alpha = planetData[pi + 3];
        if (alpha > 0) {
          const k = alpha * (1 / 255);
          const inv = 1 - k;
          r = r * inv + planetData[pi] * k;
          g = g * inv + planetData[pi + 1] * k;
          b = b * inv + planetData[pi + 2] * k;
        }
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
      i += 4;
    }
  }
  for (let y = skyEnd; y < h; y++) {
    const centerDist = rowCenter[y];
    const fsize = fBase >> rowLvl[y];
    const fimg = fLevels[rowLvl[y]];
    let i = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (y <= colBot[x]) {
        i += 4;
        continue;
      }
      const rx = colRx[x];
      const ry = colRy[x];
      const dist = centerDist / (rx * cosAim + ry * sinAim);
      const absOff = colOff[x] < 0 ? -colOff[x] : colOff[x];
      const cone = Math.max(0.2, 1 - (absOff / fovCone) * (absOff / fovCone));
      const fall = 1 / (1 + dist * dist * 0.05);
      const lamp = fall * cone * flick;
      const wx = body.x + rx * dist;
      const wy = body.y + ry * dist;
      const tx = Math.floor(wx * 0.5 * fsize) & (fsize - 1);
      const ty = Math.floor(wy * 0.5 * fsize) & (fsize - 1);
      const ti = (ty * fsize + tx) << 2;
      data[i] = fimg[ti] * (0.16 + 1.05 * lamp);
      data[i + 1] = fimg[ti + 1] * (0.16 + 1.05 * lamp * 0.86);
      data[i + 2] = fimg[ti + 2] * (0.16 + 1.05 * lamp * 0.68);
      data[i + 3] = 255;
      i += 4;
    }
  }
  for (let col = 0; col < w; col++) {
    const line = colLine[col];
    const top = colTop[col];
    const bot = colBot[col];
    const wall = hd.tex[colId[col]];
    const lvl = wallLevel(line);
    const max = wall.levels.length - 1;
    const level = lvl > max ? max : lvl;
    const size = wall.size >> level;
    const img = wall.levels[level];
    const wallX = colWallX[col];
    const fog = colFog[col];
    const fogR = 70 * fog;
    const fogG = 50 * fog;
    const fogB = 34 * fog;
    const invFog = 1 - fog;
    const fall = colFall[col];
    const cone = colCone[col];
    const side = colSide[col];
    const wallTop = horizon - line / 2;
    for (let y = top; y <= bot; y++) {
      const v = line <= 1 ? 0 : (y - wallTop) / line;
      const tx = Math.floor(wallX * size) & (size - 1);
      const ty = Math.floor(v * size) & (size - 1);
      const ti = (ty * size + tx) << 2;
      const vy = (y - horizon) / hSoft;
      const vAbs = vy < 0 ? -vy : vy;
      const vsoft = Math.max(0.2, 1 - vAbs * 1.25);
      const lamp = fall * cone * vsoft * flick;
      let r = img[ti] * (0.16 + 1.05 * lamp) * side;
      let g = img[ti + 1] * (0.16 + 1.05 * lamp * 0.86) * side;
      let b = img[ti + 2] * (0.16 + 1.05 * lamp * 0.68) * side;
      r = r * invFog + fogR;
      g = g * invFog + fogG;
      b = b * invFog + fogB;
      const i = (y * w + col) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

function wallLevel(line) {
  const lvl = Math.floor(Math.log2(512 / Math.max(line, 1)));
  if (lvl < 0) return 0;
  if (lvl > 3) return 3;
  return lvl;
}

function floorLevel(dist, focal) {
  const lvl = Math.floor(Math.log2(Math.max(1, (256 * dist) / focal)));
  if (lvl < 0) return 0;
  if (lvl > 3) return 3;
  return lvl;
}

function wrap180(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function growInt(buf, n, signed) {
  if (buf.length >= n) return buf;
  return signed ? new Int16Array(n) : new Int32Array(n);
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
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pace = body.sprint ? 13.5 : 8.6;
  const phase = time * pace;
  const amp = calm || !moving ? 0 : body.sprint ? 1 : 0.75;
  const bob = Math.sin(phase) * h * 0.013 * amp;
  const sway = Math.cos(phase * 0.5) * 0.016 * amp;
  const aim = body.a + sway;
  const horizon = h * 0.5 + bob;
  const flick = calm ? 1 : 1 + 0.015 * Math.sin(time * 9.4) + 0.01 * Math.sin(time * 3.3 + 0.8) + 0.006 * Math.sin(time * 17.2);
  const pack = packOn();
  const focal = (w * 0.5) / Math.tan(FOV * 0.5);
  if (pack) {
    paintPacked(data, z, w, h, maze, body, aim, horizon, flick, focal);
  } else {
    const pcx = w * 0.7;
    const pcy = h * 0.2;
    const pr = Math.min(w, h) * 0.18;
    const rayX = ctx._rayX && ctx._rayX.length === w ? ctx._rayX : (ctx._rayX = new Float32Array(w));
    const rayY = ctx._rayY && ctx._rayY.length === w ? ctx._rayY : (ctx._rayY = new Float32Array(w));
    const cam = ctx._cam && ctx._cam.length === w ? ctx._cam : (ctx._cam = new Float32Array(w));
    const floorTex = buildProc()[6];
    const cosAim = Math.cos(aim);
    const sinAim = Math.sin(aim);
    for (let x = 0; x < w; x++) {
      const off = Math.atan((x - w * 0.5) / focal);
      cam[x] = off;
      const ang = aim + off;
      rayX[x] = Math.cos(ang);
      rayY[x] = Math.sin(ang);
    }
    for (let y = 0; y < h; y++) {
      const above = y < horizon;
      const row = above ? 0 : Math.max(1, y - horizon);
      const centerDist = above ? 0 : (0.5 * focal) / row;
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
          const camera = cam[x];
          const dist = centerDist / (rayX[x] * cosAim + rayY[x] * sinAim);
          const cone = Math.max(0.2, 1 - (Math.abs(camera) / (FOV * 0.48)) ** 2);
          const fall = 1 / (1 + dist * dist * 0.05);
          const lamp = fall * cone * flick;
          const wx = body.x + rayX[x] * dist;
          const wy = body.y + rayY[x] * dist;
          sample(floorTex, wx * 0.55, wy * 0.55, 0);
          const grain = (hash01(Math.floor(wx * 24), Math.floor(wy * 24)) - 0.5) * 8;
          const near = clamp(1 - dist / 9, 0, 1);
          const glow = lamp * lamp;
          r = texR * (0.35 + near * 0.25) + glow * 150 + grain;
          g = texG * (0.35 + near * 0.2) + glow * 62 + grain * 0.45;
          b = texB * (0.35 + near * 0.15) + glow * 18;
          const fx = Math.abs(wx - Math.floor(wx));
          const fy = Math.abs(wy - Math.floor(wy));
          if (fx < 0.04 || fy < 0.04) {
            r *= 0.78;
            g *= 0.78;
            b *= 0.78;
          }
        }
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    for (let col = 0; col < w; col++) {
      const ang = aim + cam[col];
      const hit = raycast(maze, body.x, body.y, ang);
      z[col] = hit.dist;
      const line = focal / hit.dist;
      const top = Math.max(0, Math.floor(horizon - line / 2));
      const bot = Math.min(h - 1, Math.floor(horizon + line / 2));
      const camera = ang - aim;
      const cone = Math.max(0.22, 1 - (Math.abs(camera) / (FOV * 0.48)) ** 2);
      const fall = 1 / (1 + hit.dist * hit.dist * 0.05);
      const side = hit.side === 1 ? 0.85 : 1;
      const fog = clamp((hit.dist - 1.2) / 12, 0, 0.58);
      const carved = hash01(hit.wx * 3 + 1, hit.wy * 5 + hit.side) > 0.78;
      const id = hit.seal >= 0 ? 4 : carved ? 5 : Math.abs(hit.mapX * 13 + hit.mapY * 7 + hit.side * 5) % 4;
      const wall = proc[id];
      for (let y = top; y <= bot; y++) {
        const v = line <= 1 ? 0 : (y - (horizon - line / 2)) / line;
        sample(wall, hit.wallX, v, 0);
        const vy = (y - horizon) / (h * 0.55);
        const vsoft = Math.max(0.2, 1 - Math.abs(vy) * 1.25);
        let light = (0.25 + 0.75 * fall * cone * vsoft * flick) * side;
        if (light < 0.25) light = 0.25;
        let r = texR * light;
        let g = texG * light;
        let b = texB * light;
        r = r * (1 - fog) + 92 * fog;
        g = g * (1 - fog) + 62 * fog;
        b = b * (1 - fog) + 38 * fog;
        const i = (y * w + col) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
  }

  const sprites = [];
  if (view.sentinel) sprites.push({ ...view.sentinel, kind: "sentinel" });
  if (maze.relic) sprites.push({ x: maze.relic.x + 0.5, y: maze.relic.y + 0.5, kind: "relic" });
  if (view.ping) sprites.push({ x: view.ping.x, y: view.ping.y, kind: "ping" });
  for (const seal of maze.seals || []) {
    if (seal.open) continue;
    const sx = seal.axis === "v" ? seal.x : seal.x + 0.5;
    const sy = seal.axis === "v" ? seal.y + 0.5 : seal.y;
    const dx = body.x - sx;
    const dy = body.y - sy;
    const len = Math.hypot(dx, dy) || 1;
    sprites.push({ x: sx + (dx / len) * 0.16, y: sy + (dy / len) * 0.16, kind: "seal" });
  }
  for (const item of maze.loot || []) {
    if (item.taken) continue;
    sprites.push({ x: item.x, y: item.y, kind: item.kind === "key" ? "key" : "shard" });
  }
  sprites.sort((a, b) => {
    const da = (a.x - body.x) ** 2 + (a.y - body.y) ** 2;
    const db = (b.x - body.x) ** 2 + (b.y - body.y) ** 2;
    return db - da;
  });
  for (const sprite of sprites) {
    if ((sprite.kind === "sentinel" || sprite.kind === "seal" || sprite.kind === "key" || sprite.kind === "shard") && !hasLos(maze, body.x, body.y, sprite.x, sprite.y)) continue;
    blitSprite(data, z, w, h, horizon, { ...body, a: aim }, sprite, time);
  }

  ctx.putImageData(image, 0, 0);
  paintAir(ctx, w, h, time);
}

const motes = Array.from({ length: 40 }, (_, i) => ({
  u: hash01(i * 19, 3),
  v: hash01(i * 7, 11),
  z: 0.25 + hash01(i, 5) * 0.75,
  s: (i % 4) * 0.6 + 0.8,
  drift: 0.012 + (i % 5) * 0.004,
}));

let grainCanvas = null;

function grainTile() {
  if (grainCanvas) return grainCanvas;
  grainCanvas = document.createElement("canvas");
  grainCanvas.width = 96;
  grainCanvas.height = 96;
  const g = grainCanvas.getContext("2d");
  const img = g.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 70 + ((i * 17) % 97);
    img.data[i] = n;
    img.data[i + 1] = n;
    img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return grainCanvas;
}

function paintAir(ctx, w, h, time) {
  ctx.save();
  ctx.fillStyle = "rgba(231, 214, 186, 0.9)";
  for (const mote of motes) {
    const rise = (mote.v + time * mote.drift) % 1;
    const x = w * (0.5 + (mote.u - 0.5) * mote.z * 0.9);
    const y = h * (0.08 + rise * 0.84);
    const dx = (x - w * 0.5) / (w * 0.42);
    const dy = (y - h * 0.5) / (h * 0.48);
    const cone = 1 - dx * dx - dy * dy * 0.65;
    if (cone < 0.08) continue;
    const size = Math.max(1.4, mote.s * (w / 780));
    ctx.globalAlpha = cone * cone * 0.42 * (0.35 + mote.z);
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 0.055;
  ctx.globalCompositeOperation = "overlay";
  const tile = grainTile();
  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function blitSprite(data, z, w, h, horizon, body, sprite, time) {
  const dx = sprite.x - body.x;
  const dy = sprite.y - body.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.2 || dist > 10.4) return;
  const ang = normalizeAngle(Math.atan2(dy, dx) - body.a);
  if (Math.abs(ang) > FOV * 0.58) return;
  const focal = (w * 0.5) / Math.tan(FOV * 0.5);
  const fog = clamp((dist - 1.5) / 7.2, 0, 1);
  const cone = Math.max(0, 1 - (Math.abs(ang) / (FOV * 0.55)) ** 2);
  const fade = (1 - fog * fog) * (0.22 + 0.78 * cone);
  if (fade < 0.04) return;
  const screenX = w * 0.5 + Math.tan(ang) * focal;
  const mark = sprite.kind === "seal";
  const pickup = sprite.kind === "key" || sprite.kind === "shard";
  const tall = sprite.kind === "sentinel" ? 0.95 : sprite.kind === "ping" ? 1.1 : pickup ? 0.34 : 0.72;
  const aspect = sprite.kind === "sentinel" ? 0.46 : sprite.kind === "ping" ? 0.16 : 1;
  const size = mark ? Math.min(h * 0.32, (h * 0.3) / dist) : Math.min(h * 0.92, (h * tall) / dist);
  const width = Math.max(2, Math.floor(mark ? size : size * aspect));
  const left = Math.floor(screenX - width * 0.5);
  const feet = mark ? Math.floor(horizon + size * 0.5) : Math.floor(horizon + (h * 0.48) / dist);
  const head = mark ? Math.floor(horizon - size * 0.5) : Math.floor(feet - size);
  for (let x = left; x < left + width; x++) {
    if (x < 0 || x >= w || z[x] < dist - 0.08) continue;
    const u = (x - left) / width;
    const y0 = Math.max(0, head);
    const y1 = Math.min(h, feet);
    for (let y = y0; y < y1; y++) {
      const v = (y - head) / Math.max(1, feet - head);
      const col = spriteColor(sprite, u, v, time);
      if (!col) continue;
      const a = col[3] * fade;
      if (a < 0.02) continue;
      const i = (y * w + x) * 4;
      const fr = col[0] * (1 - fog) + 92 * fog;
      const fg = col[1] * (1 - fog) + 62 * fog;
      const fb = col[2] * (1 - fog) + 38 * fog;
      data[i] = data[i] * (1 - a) + fr * a;
      data[i + 1] = data[i + 1] * (1 - a) + fg * a;
      data[i + 2] = data[i + 2] * (1 - a) + fb * a;
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
  if (sprite.kind === "seal") return sealGlow(u, v, time);
  if (sprite.kind === "key") return glyphMark(u, v, time, true);
  if (sprite.kind === "shard") return glyphMark(u, v, time, false);
  if (sprite.kind === "sentinel") return sentinelShade(u, v, time, sprite.state);
  const cx = u - 0.5;
  const cy = v - 0.56;
  const d = Math.abs(cx) * 1.15 + Math.abs(cy);
  if (d > 0.42) return null;
  const core = d < 0.12 ? 1 : 0;
  const pulse = 0.75 + 0.25 * Math.sin(time * 3);
  return [220 * pulse, 150 * pulse, 70, core ? 0.95 : 0.55 + (0.42 - d)];
}

function glyphMark(u, v, time, key) {
  const x = u - 0.5;
  const y = v - 0.5;
  const d = Math.hypot(x * 1.4, y);
  if (d > 0.46) return null;
  const pulse = 0.8 + 0.2 * Math.sin(time * 3);
  if (key && Math.abs(x) < 0.08 && Math.abs(y) < 0.28) return [232, 196, 140, 0.95 * pulse];
  if (key && Math.hypot(x - 0.12, y) < 0.16) return [196, 140, 72, 0.9 * pulse];
  if (!key && d < 0.22) return [226, 164, 90, 0.9 * pulse];
  return [160, 110, 64, (0.46 - d) * pulse];
}

function sealGlow(u, v, time) {
  const x = (u - 0.5) * 2;
  const y = (v - 0.5) * 2;
  const d = Math.hypot(x, y);
  if (d > 1) return null;
  const pulse = 0.82 + 0.18 * Math.sin(time * 2.2);
  if (d < 0.26) return [240, 184, 78, 0.95 * pulse];
  const a = (1 - d) ** 1.5 * 0.72 * pulse;
  return [214, 146, 58, a];
}

function sentinelShade(u, v, time, state) {
  const x = u - 0.5;
  const y = v;
  const head = Math.hypot(x / 0.15, (y - 0.15) / 0.1);
  let half = 0;
  if (y >= 0.24 && y < 0.4) half = 0.14 + (y - 0.24) * 1.7;
  else if (y >= 0.4 && y < 0.76) half = 0.41 - (y - 0.4) * 0.22;
  else if (y >= 0.76 && y < 0.98) half = 0.33 - (y - 0.76) * 0.55;
  const body = half > 0 && Math.abs(x) < half;
  const headOn = head < 1 && y < 0.28;
  const hunt = state === "hunt";
  const pulse = hunt ? 0.78 + 0.22 * Math.sin(time * 7) : 0.9 + 0.1 * Math.sin(time * 1.8);
  const gr = hunt ? 168 : 132;
  const gg = hunt ? 204 : 170;
  const gb = hunt ? 96 : 74;
  if (headOn || body) {
    const edge = headOn ? head : Math.abs(x) / half;
    const shade = (1 - edge * 0.45) * pulse;
    return [gr * shade, gg * shade, gb * shade, 0.9];
  }
  const glow = Math.hypot(x / 0.58, (y - 0.48) / 0.62);
  if (glow >= 1) return null;
  return [gr * 0.7, gg * 0.75, gb * 0.55, (1 - glow) ** 2 * 0.34 * pulse];
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
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.min(w, h) * 0.74);
  g.addColorStop(0, "rgba(12,9,7,0)");
  g.addColorStop(0.5, "rgba(12,9,7,0)");
  g.addColorStop(1, `rgba(8,6,5,${0.52 + threat * 0.18})`);
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

  drawHeartPath(ctx, maze, explorer, relic, toX, toY, size);

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
    const nearDoor = explorer && Math.hypot(explorer.x - midX, explorer.y - midY) < 1.2;
    ctx.save();
    ctx.globalAlpha = nearDoor ? 1 : 0.38;
    ctx.fillStyle = nearDoor ? "rgba(226, 176, 90, 0.7)" : "rgba(226, 150, 48, 0.35)";
    ctx.beginPath();
    ctx.arc(x, y, s * (nearDoor ? 1.9 : 1.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = nearDoor ? "#f0d7a4" : "#a07848";
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  for (const item of maze.loot || []) {
    if (item.taken) continue;
    const x = toX(item.x);
    const y = toY(item.y);
    ctx.fillStyle = item.kind === "key" ? "#e7d3a8" : "#c4893a";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, size * (item.kind === "key" ? 0.12 : 0.08)), 0, Math.PI * 2);
    ctx.fill();
    if (item.kind === "key") {
      ctx.strokeStyle = "#8f6a52";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.max(4, size * 0.14), y);
      ctx.stroke();
    }
  }

  if (sentinel) {
    const hunting = sentinel.state === "hunt";
    const beat = hunting ? 0.82 + 0.18 * Math.sin(time * 8) : 1;
    ctx.save();
    ctx.globalAlpha = beat;
    drawActor(ctx, toX(sentinel.x), toY(sentinel.y), sentinel.a, "guard", size * (hunting ? 1.15 * beat : 1));
    ctx.restore();
  }
  drawActor(ctx, ex, ey, explorer.a, "lantern", size * 1.15);
  drawHeartMark(ctx, relic, toX, toY, size, time);

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

function drawHeartPath(ctx, maze, explorer, relic, toX, toY, size) {
  if (!relic) return;
  ctx.fillStyle = "rgba(226, 164, 70, 0.5)";
  ctx.fillRect(toX(relic.x) + 1, toY(relic.y) + 1, Math.max(2, size - 2), Math.max(2, size - 2));
  const path = gridPath(maze, Math.floor(explorer.x), Math.floor(explorer.y), relic.x, relic.y);
  if (!path || path.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(232, 150, 42, 0.95)";
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.setLineDash([Math.max(7, size * 0.28), Math.max(5, size * 0.18)]);
  ctx.beginPath();
  path.forEach((cell, index) => {
    const x = toX(cell.x + 0.5);
    const y = toY(cell.y + 0.5);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 1; i < path.length; i += 3) {
    const prev = path[i - 1];
    const cell = path[i];
    const ang = Math.atan2(cell.y - prev.y, cell.x - prev.x);
    const x = toX(cell.x + 0.5);
    const y = toY(cell.y + 0.5);
    const tip = Math.max(6, size * 0.22);
    ctx.fillStyle = "#f0d7a4";
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * tip, y + Math.sin(ang) * tip);
    ctx.lineTo(x + Math.cos(ang + 2.4) * tip * 0.7, y + Math.sin(ang + 2.4) * tip * 0.7);
    ctx.lineTo(x + Math.cos(ang - 2.4) * tip * 0.7, y + Math.sin(ang - 2.4) * tip * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHeartMark(ctx, relic, toX, toY, size, time) {
  if (!relic) return;
  const rx = toX(relic.x + 0.5);
  const ry = toY(relic.y + 0.5);
  const pulse = 0.9 + 0.1 * Math.sin(time * 3);
  ctx.strokeStyle = "#f3e2c4";
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.beginPath();
  ctx.arc(rx, ry, Math.max(10, size * 0.36) * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e2a45a";
  ctx.beginPath();
  ctx.arc(rx, ry, Math.max(4, size * 0.12), 0, Math.PI * 2);
  ctx.fill();
  const font = Math.max(13, Math.min(28, size * 0.42));
  ctx.font = `600 ${font}px Palatino, Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#1a1008";
  ctx.strokeText("SERCE", rx, ry - size * 0.46);
  ctx.fillStyle = "#f6e6c8";
  ctx.fillText("SERCE", rx, ry - size * 0.46);
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

function drawActor(ctx, x, y, angle, kind, size) {
  const guard = kind === "guard";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  const s = Math.max(8, size * 0.34);
  ctx.fillStyle = guard ? "#243024" : "#3a2418";
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.55, s * 0.15);
  ctx.lineTo(s * 0.28, s * 0.85);
  ctx.lineTo(-s * 0.28, s * 0.85);
  ctx.lineTo(-s * 0.55, s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = guard ? "#8aa36a" : "#e2b07a";
  ctx.beginPath();
  ctx.arc(0, -s * 0.15, guard ? s * 0.18 : s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  if (!guard) {
    ctx.fillStyle = "#f6e2b8";
    ctx.beginPath();
    ctx.arc(0, -s * 0.72, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
