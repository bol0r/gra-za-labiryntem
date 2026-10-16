export const INTRO_ENTER_MS = 21000;

const SERIF = 'Palatino, "Palatino Linotype", Georgia, serif';
const SANS = '"Avenir Next", "Segoe UI", sans-serif';
const STARS = Array.from({ length: 96 }, (_, i) => ({
  x: Math.sin(i * 12.9898) * (0.55 + (i % 7) * 0.48),
  y: ((i * 47) % 100) / 100 * 6.4 - 2.9,
  z: 8 + (i * 5) % 16,
  s: i % 8 === 0 ? 2.2 : 1,
}));
const DUST = Array.from({ length: 64 }, (_, i) => ({
  x: ((i * 13) % 23) / 23 * 2.15 - 1.07,
  y: 0.08 + ((i * 19) % 29) / 29 * 2.3,
  z: (i * 0.71) % 34,
}));
const HALL_W = 1.24;
const HALL_H = 2.62;
const HALL_END = 34.6;
const HALL_HEART = 33.05;
const STEP = 0.64;

function easeOut(u) {
  const t = Math.max(0, Math.min(1, u));
  return 1 - (1 - t) ** 3;
}

function easeInOut(u) {
  const t = Math.max(0, Math.min(1, u));
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function span(t, inn, full, outStart, outEnd) {
  if (t <= inn || t >= outEnd) return 0;
  if (t < full) return easeOut((t - inn) / (full - inn));
  if (t < outStart) return 1;
  return 1 - easeOut((t - outStart) / (outEnd - outStart));
}

function rise(t, at, dur) {
  if (t < at) return 0;
  return easeOut(Math.min(1, (t - at) / dur));
}

function project(cam, x, y, z, w, h) {
  let dx = x - cam.x;
  let dy = y - cam.y;
  let dz = z - cam.z;
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const x1 = dx * cy - dz * sy;
  const z1 = dx * sy + dz * cy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const y1 = dy * cp - z1 * sp;
  const z2 = dy * sp + z1 * cp;
  if (z2 < 0.18) return null;
  const f = Math.min(w, h) * 0.96;
  return { x: w * 0.5 + (x1 / z2) * f, y: h * 0.5 - (y1 / z2) * f, z: z2, f };
}

function quad(ctx, cam, w, h, pts, rgb, light) {
  const p = [];
  for (let i = 0; i < 4; i++) {
    const q = project(cam, pts[i][0], pts[i][1], pts[i][2], w, h);
    if (!q) return;
    p.push(q);
  }
  const k = Math.max(0, Math.min(1.35, light));
  ctx.fillStyle = `rgb(${(Math.min(255, rgb[0] * k)) | 0},${(Math.min(255, rgb[1] * k)) | 0},${(Math.min(255, rgb[2] * k)) | 0})`;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  ctx.lineTo(p[1].x, p[1].y);
  ctx.lineTo(p[2].x, p[2].y);
  ctx.lineTo(p[3].x, p[3].y);
  ctx.closePath();
  ctx.fill();
}

function label(ctx, text, x, y, opt) {
  if (!opt.alpha || opt.alpha < 0.02) return;
  let size = opt.size;
  ctx.save();
  ctx.globalAlpha = opt.alpha;
  ctx.fillStyle = opt.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const weight = opt.weight ? `${opt.weight} ` : "";
  if (opt.spacing) ctx.letterSpacing = `${opt.spacing}px`;
  ctx.font = `${weight}${size}px ${opt.font}`;
  const width = ctx.measureText(text).width;
  const maxW = opt.maxW || 100000;
  if (width > maxW && width > 0) size *= maxW / width;
  ctx.font = `${weight}${size}px ${opt.font}`;
  const scale = opt.scale || 1;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function rule(ctx, x, y, width, alpha) {
  if (alpha < 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#c4a48a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y);
  ctx.lineTo(x + width / 2, y);
  ctx.stroke();
  ctx.restore();
}

function vignette(ctx, w, h, amount) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.18, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function sphere(lat, lon, radius, spin) {
  const x = Math.cos(lon + spin) * Math.cos(lat) * radius;
  const y = Math.sin(lat) * radius;
  const z = Math.sin(lon + spin) * Math.cos(lat) * radius;
  const tilt = 0.42;
  const cy = Math.cos(tilt);
  const sy = Math.sin(tilt);
  return [x, y * cy - z * sy, y * sy + z * cy];
}

// ------------------------------------------------------------------ TEKSTURY INTRA
// Pliki w public/tex/intro/ robi docs/intro_generator.py. Plan i mapowanie: docs/INTRO_TEKSTURY.md.
// Bez tekstur (nie doszły albo „Tekstury HD” wyłączone) intro rysuje się płasko, jak wcześniej.
const TEX_VER = "2";
const TEX_FILES = ["space", "planet_surface", "planet_glow", "hall_wall", "hall_floor", "hall_ceiling", "hall_gate"];
// Pikseli bufora na klatkę (sala i planeta liczone piksel po pikselu). Budżet sam się dobiera:
// schodzi, gdy rysowanie sali trwa ponad 8 ms, i wraca, gdy jest zapas.
const BUDGET_MIN = 50000;
const BUDGET_MAX = 230000;
let budget = 150000;
const SPAN = 5.12; // jedno przęsło ściany: od pilastra do pilastra (8 kroków po 0,64)
const TORCH_Z0 = 2.88; // pierwsza pochodnia (i % 8 === 4)
const TPU = 200; // tekseli na jednostkę świata, mniej więcej dla wszystkich ścian sali
const SPIN = 0.38;
const SCAR_T = 5.9; // w tej sekundzie labirynt na planecie stoi na środku tarczy
const LON0 = -1.5 * Math.PI - SPIN * SCAR_T;
let introTex = null;
let introTexAt = 0;
let hallXc = new Float32Array(0);
let hallLen = new Float32Array(0);
let hallKey = "";
const torchFlick = new Float32Array(16);

function texWanted() {
  try {
    return localStorage.getItem("zl-hd") !== "0";
  } catch {
    return true;
  }
}

function texImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(name));
    img.src = `/tex/intro/${name}.webp?v=${TEX_VER}`;
  });
}

function texPixels(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  return { w: img.width, h: img.height, px: new Uint32Array(d.buffer, d.byteOffset, d.length >> 2) };
}

// Poziomy 1/2, 1/4, 1/8: daleka posadzka i ściany nie migoczą przy przelocie.
function texMips(base) {
  const levels = [base];
  let cur = base;
  for (let k = 0; k < 3 && cur.w > 8 && cur.h > 8; k++) {
    const w = cur.w >> 1;
    const h = cur.h >> 1;
    const px = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * 2 * cur.w + x * 2;
        const a = cur.px[i], b = cur.px[i + 1], c = cur.px[i + cur.w], d = cur.px[i + cur.w + 1];
        const r = ((a & 255) + (b & 255) + (c & 255) + (d & 255) + 2) >> 2;
        const g = (((a >>> 8) & 255) + ((b >>> 8) & 255) + ((c >>> 8) & 255) + ((d >>> 8) & 255) + 2) >> 2;
        const bl = (((a >>> 16) & 255) + ((b >>> 16) & 255) + ((c >>> 16) & 255) + ((d >>> 16) & 255) + 2) >> 2;
        px[y * w + x] = 0xff000000 | (bl << 16) | (g << 8) | r;
      }
    }
    cur = { w, h, px };
    levels.push(cur);
  }
  return levels;
}

async function loadIntroTex() {
  if (typeof document === "undefined" || !texWanted()) return;
  try {
    const imgs = await Promise.all(TEX_FILES.map(texImage));
    const [space, surf, glow, wall, floor, ceil, gate] = imgs;
    introTex = {
      space,
      surf: texPixels(surf),
      glow: texPixels(glow),
      wall: texMips(texPixels(wall)),
      floor: texMips(texPixels(floor)),
      ceil: texMips(texPixels(ceil)),
      gate: texMips(texPixels(gate)),
      buf: document.createElement("canvas"),
      pbuf: document.createElement("canvas"),
      img: null,
      pimg: null,
    };
    introTexAt = performance.now();
  } catch {
    introTex = null;
  }
}

loadIntroTex();

function texFade() {
  if (!introTex || !texWanted()) return 0;
  return Math.min(1, (performance.now() - introTexAt) / 450);
}

function bufferFor(canvas, key, bw, bh) {
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
    introTex[key] = null;
  }
  if (!introTex[key]) introTex[key] = canvas.getContext("2d").createImageData(bw, bh);
  return introTex[key];
}

function mipLevel(fp) {
  return fp < 1.5 ? 0 : fp < 3 ? 1 : fp < 6 ? 2 : 3;
}

function paintHallTex(ctx, w, h, t, cam) {
  const started = performance.now();
  const k = Math.min(1.25, Math.sqrt(budget / (w * h)));
  const bw = Math.max(2, Math.round(w * k));
  const bh = Math.max(2, Math.round(h * k));
  const image = bufferFor(introTex.buf, "img", bw, bh);
  const out = new Uint32Array(image.data.buffer);
  const f = Math.min(w, h) * 0.96;
  const pxWorld = 1 / (f * k); // szerokość piksela bufora w jednostkach na odległości 1
  const cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const flick = 0.86 + 0.14 * Math.sin(t * 18.5) * Math.sin(t * 11.2);
  const heartPulse = 0.7 + 0.3 * Math.sin(t * 2.5);
  const wallT = introTex.wall, floorT = introTex.floor, ceilT = introTex.ceil, gateT = introTex.gate;
  const torches = Math.floor((HALL_END - 1 - TORCH_Z0) / SPAN);
  for (let i = 0; i <= torches; i++) torchFlick[i] = (0.55 + 0.45 * Math.sin(t * 13 + TORCH_Z0 + SPAN * i)) * 1.15;
  const key = `${bw}x${bh}x${f}`;
  if (hallKey !== key) {
    hallKey = key;
    hallXc = new Float32Array(bw);
    hallLen = new Float32Array(bw * bh);
    for (let bx = 0; bx < bw; bx++) hallXc[bx] = ((bx + 0.5) / k - w * 0.5) / f;
    for (let by = 0; by < bh; by++) {
      const yc = -((by + 0.5) / k - h * 0.5) / f;
      for (let bx = 0; bx < bw; bx++) hallLen[by * bw + bx] = Math.sqrt(hallXc[bx] * hallXc[bx] + yc * yc + 1);
    }
  }
  const tpx = pxWorld * TPU;
  let o = 0;
  for (let by = 0; by < bh; by++) {
    const yc = -((by + 0.5) / k - h * 0.5) / f;
    const dy = yc * cp + sp;
    const z1 = -yc * sp + cp;
    const tFC = dy < -1e-6 ? -cam.y / dy : dy > 1e-6 ? (HALL_H - cam.y) / dy : 1e9;
    for (let bx = 0; bx < bw; bx++, o++) {
      const xc = hallXc[bx];
      const dx = xc * cyaw + z1 * syaw;
      const dz = -xc * syaw + z1 * cyaw;
      let tt = tFC;
      let surf = dy < 0 ? 0 : 1; // 0 posadzka, 1 strop, 2 ściana prawa, 3 ściana lewa, 4 brama
      if (dx > 1e-6) {
        const tw = (HALL_W - cam.x) / dx;
        if (tw < tt) { tt = tw; surf = 2; }
      } else if (dx < -1e-6) {
        const tw = (-HALL_W - cam.x) / dx;
        if (tw < tt) { tt = tw; surf = 3; }
      }
      if (dz > 1e-6) {
        const te = (HALL_END - cam.z) / dz;
        if (te < tt) { tt = te; surf = 4; }
      }
      const px = cam.x + dx * tt;
      const py = cam.y + dy * tt;
      const pz = cam.z + dz * tt;
      const len = hallLen[o];
      const dist = tt * len;
      // ślad piksela na powierzchni w tekselach -> poziom mip (dist / cos kąta padania = tt * len² / |d·n|)
      const dn = surf < 2 ? (dy < 0 ? -dy : dy) : surf < 4 ? (dx < 0 ? -dx : dx) : dz;
      const lvl = mipLevel((tt * len * len * tpx) / (dn > 0.12 * len ? dn : 0.12 * len));
      let T, u, v, shadeK;
      if (surf === 0) {
        T = floorT[lvl]; u = (px + HALL_W) / (2 * HALL_W); v = pz / (2 * HALL_W); shadeK = 1;
      } else if (surf === 1) {
        T = ceilT[lvl]; u = (px + HALL_W) / (2 * HALL_W); v = pz / (2 * HALL_W); shadeK = 0.48;
      } else if (surf === 4) {
        T = gateT[lvl]; u = (px + HALL_W) / (2 * HALL_W); v = (HALL_H - py) / HALL_H; shadeK = 0.95;
      } else {
        T = wallT[lvl]; u = pz / SPAN; v = (HALL_H - py) / HALL_H; shadeK = surf === 2 ? 0.82 : 0.95;
      }
      // u, v są tu zawsze ≥ 0 (sala leży w x ∈ ±HALL_W, z ≥ 0), więc wystarczy obcięcie bitowe
      let tx = ((u * T.w) | 0) % T.w;
      let ty = (v * T.h) | 0;
      if (surf < 2) ty %= T.h; else ty = ty < 0 ? 0 : ty >= T.h ? T.h - 1 : ty;
      const c = T.px[ty * T.w + tx];
      // światło: latarnia przy kamerze, serce na końcu, pochodnie na prawej ścianie (jak hallLight)
      const lantern = Math.max(0, 1.25 - dist / 6.8) * flick;
      const hx = px, hy = py - 1.28, hz = pz - HALL_HEART;
      const heart = Math.max(0, 1.15 - Math.sqrt(hx * hx + hy * hy + hz * hz) / 9.5) * heartPulse;
      const fog = Math.max(0, 1 - dist / 16);
      // tekstury są jaśniejsze niż dawne płaskie kolory, więc światło jest niższe, a pochodnie mocniejsze
      let L = (0.08 * fog + Math.max(lantern, heart) * (0.3 + 0.7 * fog) * 0.62) * shadeK;
      if (L > 1.1) L = 1.1;
      let ti = ((pz - TORCH_Z0) / SPAN + 0.5) | 0;
      if (pz < TORCH_Z0) ti = 0; else if (ti > torches) ti = torches;
      const ex = px - (HALL_W - 0.06), ey = py - 1.62, ez = pz - (TORCH_Z0 + SPAN * ti);
      const torch = (torchFlick[ti] * (0.3 + 0.7 * fog)) / (1 + (ex * ex + ey * ey + ez * ez) * 2.4);
      const hw = heart > lantern ? 1 : 0; // światło serca jest bardziej bursztynowe
      const lr = L + torch * 1.1;
      const lg = L * (hw ? 0.78 : 0.88) + torch * 0.72;
      const lb = L * (hw ? 0.52 : 0.7) + torch * 0.38;
      let r = (c & 255) * lr + 0.5;
      let g = ((c >>> 8) & 255) * lg + 0.5;
      let b = ((c >>> 16) & 255) * lb + 0.5;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      out[o] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  const bctx = introTex.buf.getContext("2d");
  bctx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(introTex.buf, 0, 0, w, h);
  const spent = performance.now() - started;
  if (spent > 8) budget = Math.max(BUDGET_MIN, budget * 0.82);
  else if (spent < 4.5) budget = Math.min(BUDGET_MAX, budget * 1.05);
}

function paintSpaceBackdrop(ctx, w, h, cam, dive, night) {
  const img = introTex.space;
  // plansza pokrywa ekran z zapasem; obrót kamery lekko ją przesuwa, nurkowanie przybliża
  const cover = Math.max(w / img.width, h / img.height) * (1.18 + dive * 0.1);
  const dw = img.width * cover;
  const dh = img.height * cover;
  const x = (w - dw) * 0.5 - cam.yaw * w * 0.6 - cam.x * w * 0.04;
  const y = (h - dh) * 0.5 + cam.pitch * h * 0.6 + cam.y * h * 0.04;
  ctx.globalAlpha = night;
  ctx.drawImage(img, x, y, dw, dh);
  ctx.globalAlpha = 1;
}

function paintPlanetTex(ctx, w, h, t, cam, center, radius, night, box) {
  const k = Math.min(1.25, Math.sqrt(Math.max(budget, 120000) / (w * h)));
  const x0 = Math.max(0, Math.floor(box.x - box.r - 2));
  const y0 = Math.max(0, Math.floor(box.y - box.r - 2));
  const x1 = Math.min(w, Math.ceil(box.x + box.r + 2));
  const y1 = Math.min(h, Math.ceil(box.y + box.r + 2));
  if (x1 - x0 < 2 || y1 - y0 < 2) return;
  const bw = Math.max(2, Math.round((x1 - x0) * k));
  const bh = Math.max(2, Math.round((y1 - y0) * k));
  const image = bufferFor(introTex.pbuf, "pimg", bw, bh);
  const out = new Uint32Array(image.data.buffer);
  const f = Math.min(w, h) * 0.96;
  const cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const ox = cam.x - center[0], oy = cam.y - center[1], oz = cam.z - center[2];
  const oc2 = ox * ox + oy * oy + oz * oz;
  const R2 = radius * radius;
  const tilt = 0.42, ct = Math.cos(tilt), st = Math.sin(tilt);
  const spin = t * SPIN;
  let lx = -0.46, ly = 0.72, lz = -0.52;
  const ll = Math.hypot(lx, ly, lz);
  lx /= ll; ly /= ll; lz /= ll;
  const S = introTex.surf, G = introTex.glow;
  const wake = rise(t, 2.6, 3.2) * (0.75 + 0.25 * Math.sin(t * 2.5));
  const sx = (x1 - x0) / bw, sy = (y1 - y0) / bh;
  let o = 0;
  for (let by = 0; by < bh; by++) {
    const yc = -(y0 + (by + 0.5) * sy - h * 0.5) / f;
    const dy = yc * cp + sp;
    const z1 = -yc * sp + cp;
    for (let bx = 0; bx < bw; bx++, o++) {
      const xc = (x0 + (bx + 0.5) * sx - w * 0.5) / f;
      const dx = xc * cyaw + z1 * syaw;
      const dz = -xc * syaw + z1 * cyaw;
      const a = dx * dx + dy * dy + dz * dz;
      const b = ox * dx + oy * dy + oz * dz;
      const perp2 = oc2 - (b * b) / a; // kwadrat odległości środka od promienia
      if (perp2 >= R2 * 1.0004 || b > 0) {
        out[o] = 0;
        continue;
      }
      const disc = b * b - a * (oc2 - R2);
      const tt = (-b - Math.sqrt(disc > 0 ? disc : 0)) / a;
      const nx = (ox + dx * tt) / radius;
      const ny = (oy + dy * tt) / radius;
      const nz = (oz + dz * tt) / radius;
      // z powrotem do układu planety: odwrócone nachylenie, potem obrót
      const yy = ny * ct + nz * st;
      const zz = -ny * st + nz * ct;
      const lat = Math.asin(yy < -1 ? -1 : yy > 1 ? 1 : yy);
      let uu = (Math.atan2(zz, nx) - spin - LON0) / (2 * Math.PI);
      uu -= Math.floor(uu);
      const vv = 0.5 - lat / Math.PI;
      const ti = Math.min(S.h - 1, (vv * S.h) | 0) * S.w + Math.min(S.w - 1, (uu * S.w) | 0);
      const c = S.px[ti];
      const gl = G.px[ti] & 255;
      let nd = nx * lx + ny * ly + nz * lz;
      if (nd < 0) nd = 0;
      const ad = Math.sqrt(a);
      let facing = -(nx * dx + ny * dy + nz * dz) / ad;
      if (facing < 0) facing = 0;
      const fres = 1 - facing;
      const rim = fres * fres * 0.9;
      const term = Math.min(1, nd * 4); // pas zmierzchu
      const lit = (0.035 + nd * 1.05) * night;
      const emit = (gl / 255) * wake * (0.45 + 0.55 * (1 - term)) * night;
      let r = (c & 255) * lit + rim * 190 * (0.25 + 0.75 * term) * night + emit * 255;
      let g = ((c >>> 8) & 255) * lit + rim * 110 * (0.25 + 0.75 * term) * night + emit * 170;
      let bl = ((c >>> 16) & 255) * lit + rim * 70 * (0.25 + 0.75 * term) * night + emit * 70;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (bl > 255) bl = 255;
      // wygładzony brzeg tarczy
      const edge = (radius - Math.sqrt(perp2)) / ((Math.sqrt(oc2) / f) / k * 1.2);
      const al = edge >= 1 ? 255 : edge <= 0 ? 0 : (edge * 255) | 0;
      out[o] = (al << 24) | ((bl | 0) << 16) | ((g | 0) << 8) | (r | 0);
    }
  }
  const pctx = introTex.pbuf.getContext("2d");
  pctx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(introTex.pbuf, x0, y0, x1 - x0, y1 - y0);
}

function drawSpace(ctx, w, h, t) {
  const dive = easeInOut(Math.max(0, Math.min(1, (t - 4.2) / 2.9)));
  const cam = {
    x: Math.sin(t * 0.17) * 0.1,
    y: Math.cos(t * 0.13) * 0.06,
    z: dive * 1.6,
    yaw: Math.sin(t * 0.21) * 0.045,
    pitch: -0.04 + Math.sin(t * 0.16) * 0.02,
  };
  const night = easeOut(Math.min(1, t / 1.05));
  const fade = texFade();
  if (fade > 0) paintSpaceBackdrop(ctx, w, h, cam, dive, night * fade);
  const starA = 1 - fade * 0.45;
  for (let i = 0; i < STARS.length; i++) {
    const star = STARS[i];
    const p = project(cam, star.x, star.y, star.z, w, h);
    if (!p || p.z > 22) continue;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.7 + i));
    ctx.globalAlpha = night * tw * 0.85 * starA;
    ctx.fillStyle = i % 5 === 0 ? "#f0e2c8" : "#d9d0c4";
    ctx.fillRect(p.x, p.y, star.s, star.s);
  }
  ctx.globalAlpha = 1;

  const cz = 10.4 - dive * 5.4;
  const radius = 1.72;
  const spin = t * 0.38;
  const center = [Math.sin(t * 0.12) * 0.15, 0.05, cz];
  const glowAt = project(cam, center[0], center[1], center[2], w, h);
  const glowEdge = project(cam, center[0] + radius, center[1], center[2], w, h);
  if (glowAt && glowEdge) {
    const pr = Math.max(8, Math.hypot(glowEdge.x - glowAt.x, glowEdge.y - glowAt.y));
    const glow = ctx.createRadialGradient(glowAt.x, glowAt.y, pr * 0.7, glowAt.x, glowAt.y, pr * 1.65);
    glow.addColorStop(0, `rgba(168, 96, 62, ${0.28 * night})`);
    glow.addColorStop(1, "rgba(168, 96, 62, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(glowAt.x, glowAt.y, pr * 1.65, 0, Math.PI * 2);
    ctx.fill();
  }

  const lx = -0.46;
  const ly = 0.72;
  const lz = -0.52;
  const llen = Math.hypot(lx, ly, lz);
  const quads = [];
  const bands = fade >= 1 ? 0 : 14;
  const segs = 28;
  for (let lat = 0; lat < bands; lat++) {
    const lat0 = -Math.PI / 2 + (lat / bands) * Math.PI;
    const lat1 = -Math.PI / 2 + ((lat + 1) / bands) * Math.PI;
    for (let lon = 0; lon < segs; lon++) {
      const lon0 = (lon / segs) * Math.PI * 2;
      const lon1 = ((lon + 1) / segs) * Math.PI * 2;
      const c0 = sphere(lat0, lon0, radius, spin);
      const c1 = sphere(lat0, lon1, radius, spin);
      const c2 = sphere(lat1, lon1, radius, spin);
      const c3 = sphere(lat1, lon0, radius, spin);
      const nx = (c0[0] + c1[0] + c2[0] + c3[0]) / 4;
      const ny = (c0[1] + c1[1] + c2[1] + c3[1]) / 4;
      const nz = (c0[2] + c1[2] + c2[2] + c3[2]) / 4;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const n0 = nx / nl;
      const n1 = ny / nl;
      const n2 = nz / nl;
      const vx = cam.x - (center[0] + nx);
      const vy = cam.y - (center[1] + ny);
      const vz = cam.z - (center[2] + nz);
      const facing = n0 * vx + n1 * vy + n2 * vz;
      if (facing <= 0) continue;
      const nd = Math.max(0, n0 * lx / llen + n1 * ly / llen + n2 * lz / llen);
      const fres = 1 - Math.max(0, Math.min(1, facing / (Math.hypot(vx, vy, vz) || 1)));
      const rim = fres ** 1.35 * 0.62;
      const stripe = Math.sin(((lat0 + lat1) / 2) * 6.5 + spin * 0.25);
      const rgb = stripe > 0.28 ? [196, 138, 96] : stripe < -0.42 ? [78, 48, 38] : [138, 88, 62];
      const spec = nd > 0.9 ? (nd - 0.9) / 0.1 : 0;
      const k = (0.05 + nd * 0.92 + rim) * night;
      quads.push({
        z: center[2] + nz,
        rgb: [
          Math.min(255, rgb[0] * k + spec * 90),
          Math.min(255, rgb[1] * k + spec * 70),
          Math.min(255, rgb[2] * k + spec * 46),
        ],
        pts: [
          [center[0] + c0[0], center[1] + c0[1], center[2] + c0[2]],
          [center[0] + c1[0], center[1] + c1[1], center[2] + c1[2]],
          [center[0] + c2[0], center[1] + c2[1], center[2] + c2[2]],
          [center[0] + c3[0], center[1] + c3[1], center[2] + c3[2]],
        ],
      });
    }
  }
  quads.sort((a, b) => b.z - a.z);
  const dist = Math.max(radius + 0.35, Math.hypot(center[0] - cam.x, center[1] - cam.y, center[2] - cam.z));
  const sil = radius / Math.sqrt(Math.max(0.04, 1 - (radius / dist) ** 2));
  const clipR = glowAt ? Math.max(8, (sil / dist) * Math.min(w, h) * 0.96) : 0;
  ctx.save();
  if (glowAt && clipR) {
    ctx.beginPath();
    ctx.arc(glowAt.x, glowAt.y, clipR, 0, Math.PI * 2);
    ctx.clip();
  }
  for (const face of quads) quad(ctx, cam, w, h, face.pts, face.rgb, 1);
  ctx.restore();
  if (fade > 0 && glowAt && clipR) {
    ctx.globalAlpha = fade;
    paintPlanetTex(ctx, w, h, t, cam, center, radius, night, { x: glowAt.x, y: glowAt.y, r: clipR * 1.03 });
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < 5; i++) {
    const a = t * (0.22 + i * 0.05) + i * 1.3;
    const rad = 2.35 + i * 0.22;
    const x = center[0] + Math.cos(a) * rad;
    const y = center[1] + Math.sin(a * 1.4) * 0.35;
    const z = center[2] + Math.sin(a) * rad * 0.82;
    if (z > center[2]) continue;
    const p = project(cam, x, y, z, w, h);
    if (!p) continue;
    const s = Math.max(1.2, (p.f / p.z) * (0.05 + (i % 3) * 0.012));
    if (glowAt && Math.hypot(p.x - glowAt.x, p.y - glowAt.y) < clipR * 0.98) continue;
    ctx.fillStyle = i % 2 ? "#6a5344" : "#3a2c26";
    ctx.beginPath();
    ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hallCamera(t) {
  const u = easeInOut(Math.max(0, Math.min(1, (t - 7.6) / 13.2)));
  const creep = Math.max(0, Math.min(0.9, (t - 21) * 0.04));
  const settle = rise(t, 19.4, 1.6);
  return {
    x: Math.sin(t * 0.52) * 0.15 * (1 - settle * 0.9),
    y: 1.48 + Math.sin(t * 2.3) * 0.04 * (1 - settle * 0.5),
    z: 0.42 + u * 27.1 + creep,
    yaw: Math.sin(t * 0.4) * 0.065 * (1 - settle),
    pitch: (-0.02 + Math.sin(t * 0.29) * 0.018) * (1 - settle),
  };
}

function hallLight(cam, x, y, z, t) {
  const dist = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
  const flick = 0.86 + 0.14 * Math.sin(t * 18.5) * Math.sin(t * 11.2);
  const lantern = Math.max(0, 1.25 - dist / 6.8) * flick;
  const heart = Math.max(0, 1.15 - Math.hypot(x, y - 1.28, z - HALL_HEART) / 9.5) * (0.7 + 0.3 * Math.sin(t * 2.5));
  const fog = Math.max(0, 1 - dist / 16);
  return Math.min(1.32, 0.2 * fog + Math.max(lantern, heart) * (0.4 + 0.6 * fog));
}

function drawBillboard(ctx, cam, w, h, x, y, z, reach, core, t, phase) {
  const p = project(cam, x, y, z, w, h);
  if (!p || p.z > 16) return;
  const pulse = 0.85 + 0.15 * Math.sin(t * 2.6 + phase);
  const rad = Math.max(6, (p.f / p.z) * reach) * pulse;
  const g = ctx.createRadialGradient(p.x, p.y, rad * 0.08, p.x, p.y, rad);
  g.addColorStop(0, `rgba(255, 220, 170, ${0.95 * core})`);
  g.addColorStop(0.28, `rgba(226, 150, 64, ${0.45 * core})`);
  g.addColorStop(1, "rgba(226, 140, 50, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
  ctx.fill();
  if (core >= 1) {
    ctx.strokeStyle = `rgba(226, 176, 110, ${0.55 * pulse})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad * 0.62, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawHall(ctx, w, h, t) {
  const cam = hallCamera(t);
  const fade = texFade();
  if (fade < 1) drawHallFlat(ctx, w, h, t, cam, fade > 0);
  if (fade > 0) {
    ctx.globalAlpha = fade;
    paintHallTex(ctx, w, h, t, cam);
    ctx.globalAlpha = 1;
    // pochodnie po teksturze, od najdalszej
    for (let i = Math.floor(HALL_END / STEP); i >= 0; i--) {
      if (i % 8 !== 4) continue;
      const midZ = (i + 0.5) * STEP;
      if (midZ < cam.z + 0.32) continue;
      const tw = 0.55 + 0.45 * Math.sin(t * 13 + midZ);
      drawBillboard(ctx, cam, w, h, HALL_W - 0.06, 1.62, midZ, 0.22, tw, t, midZ);
    }
  }
  drawHallAir(ctx, w, h, t, cam);
}

function drawHallFlat(ctx, w, h, t, cam, skipTorches) {
  const walls = [
    [66, 58, 50],
    [58, 50, 43],
    [74, 64, 54],
  ];
  const count = Math.floor(HALL_END / STEP);
  for (let i = count; i >= 0; i--) {
    const z0 = i * STEP;
    const z1 = z0 + STEP;
    if (z1 < cam.z + 0.32) continue;
    const midZ = (z0 + z1) * 0.5;
    const floorL = hallLight(cam, 0, 0.05, midZ, t);
    const wallL = hallLight(cam, HALL_W, 1.3, midZ, t) * 0.95;
    const ceilL = hallLight(cam, 0, HALL_H, midZ, t) * 0.48;
    const ys = [0, 0.66, 1.32, 1.98, HALL_H];
    quad(ctx, cam, w, h, [[-HALL_W, 0, z0], [0, 0, z0], [0, 0, z1], [-HALL_W, 0, z1]], i % 2 ? [34, 29, 24] : [30, 26, 22], floorL);
    quad(ctx, cam, w, h, [[0, 0, z0], [HALL_W, 0, z0], [HALL_W, 0, z1], [0, 0, z1]], i % 2 ? [28, 24, 20] : [33, 28, 23], floorL);
    for (let b = 0; b < 4; b++) {
      const rgb = walls[(i + b) % 3];
      quad(ctx, cam, w, h, [
        [-HALL_W, ys[b], z1], [-HALL_W, ys[b], z0], [-HALL_W, ys[b + 1], z0], [-HALL_W, ys[b + 1], z1],
      ], rgb, wallL);
      quad(ctx, cam, w, h, [
        [HALL_W, ys[b], z0], [HALL_W, ys[b], z1], [HALL_W, ys[b + 1], z1], [HALL_W, ys[b + 1], z0],
      ], rgb, wallL * 0.86);
    }
    quad(ctx, cam, w, h, [[-HALL_W, HALL_H, z0], [HALL_W, HALL_H, z0], [HALL_W, HALL_H, z1], [-HALL_W, HALL_H, z1]], [16, 14, 12], ceilL);
    if (i % 8 === 0 && i > 0) {
      const pier = [28, 24, 20];
      const light = wallL * 0.8;
      quad(ctx, cam, w, h, [
        [-HALL_W, 0, z0], [-HALL_W + 0.2, 0, z0], [-HALL_W + 0.2, HALL_H - 0.35, z0 + 0.28], [-HALL_W, HALL_H - 0.35, z0 + 0.28],
      ], pier, light);
      quad(ctx, cam, w, h, [
        [HALL_W, 0, z0], [HALL_W - 0.2, 0, z0], [HALL_W - 0.2, HALL_H - 0.35, z0 + 0.28], [HALL_W, HALL_H - 0.35, z0 + 0.28],
      ], pier, light);
      quad(ctx, cam, w, h, [
        [-HALL_W, HALL_H - 0.42, z0], [HALL_W, HALL_H - 0.42, z0], [HALL_W, HALL_H, z0 + 0.28], [-HALL_W, HALL_H, z0 + 0.28],
      ], pier, light * 0.7);
    }
    if (i % 8 === 4 && !skipTorches) {
      const side = i % 8 === 2 ? -1 : 1;
      const tw = 0.55 + 0.45 * Math.sin(t * 13 + midZ);
      drawBillboard(ctx, cam, w, h, side * (HALL_W - 0.06), 1.62, midZ, 0.22, tw, t, midZ);
    }
  }

  const niche = 0.5;
  const lip = hallLight(cam, 0, 1.2, HALL_END, t);
  const stone = [18, 15, 13];
  quad(ctx, cam, w, h, [[-HALL_W, 0, HALL_END], [-niche, 0, HALL_END], [-niche, HALL_H, HALL_END], [-HALL_W, HALL_H, HALL_END]], stone, lip);
  quad(ctx, cam, w, h, [[niche, 0, HALL_END], [HALL_W, 0, HALL_END], [HALL_W, HALL_H, HALL_END], [niche, HALL_H, HALL_END]], stone, lip);
  quad(ctx, cam, w, h, [[-niche, 1.9, HALL_END], [niche, 1.9, HALL_END], [niche, HALL_H, HALL_END], [-niche, HALL_H, HALL_END]], stone, lip * 0.8);
  quad(ctx, cam, w, h, [[-niche, 0, HALL_END], [niche, 0, HALL_END], [niche, 0.62, HALL_END], [-niche, 0.62, HALL_END]], stone, lip);
}

function drawHallAir(ctx, w, h, t, cam) {
  for (let i = 0; i < DUST.length; i++) {
    const d = DUST[i];
    if (d.z < cam.z || d.z > cam.z + 12) continue;
    const p = project(cam, d.x, d.y + Math.sin(t * 0.8 + i) * 0.06, d.z, w, h);
    if (!p) continue;
    ctx.globalAlpha = Math.max(0, 0.55 - p.z / 14);
    ctx.fillStyle = "#f0e0c4";
    const s = p.z < 2.4 ? 2 : 1;
    ctx.fillRect(p.x, p.y, s, s);
  }
  ctx.globalAlpha = 1;

  drawBillboard(ctx, cam, w, h, 0, 1.28, HALL_HEART, 0.72, 1, t, 0);
  // plama latarni na posadzce: przy teksturach światło liczy się na samej posadzce, więc znika
  const poolA = 1 - texFade();
  const pool = poolA > 0.02 ? project(cam, cam.x * 0.15, 0.02, cam.z + 4.4, w, h) : null;
  if (pool) {
    const flick = 0.75 + 0.25 * Math.sin(t * 16);
    const rx = Math.min(w, h) * 0.2;
    const g = ctx.createRadialGradient(pool.x, pool.y, 4, pool.x, pool.y, rx);
    g.addColorStop(0, `rgba(255, 196, 120, ${0.34 * flick * poolA})`);
    g.addColorStop(1, "rgba(255, 170, 80, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(pool.x, pool.y, rx * 0.85, rx * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cutFade(t) {
  if (t < 6.35 || t > 8.55) return 0;
  if (t < 7.2) return easeOut((t - 6.35) / 0.85);
  if (t < 7.45) return 1;
  return 1 - easeOut((t - 7.45) / 1.1);
}

const DESCENT_NOTES = [
  "Zejście czwarte. Sygnał wraca co sto dziesięć sekund.",
  "Sonda widziała to na Marsie. Schody znaleźliśmy w piwnicy.",
  "Schodzimy we dwoje. Jedno patrzy, drugie idzie.",
];

function drawLeftLine(ctx, text, x, y, opt) {
  if (!opt.alpha || opt.alpha < 0.02) return;
  let size = opt.size;
  ctx.save();
  ctx.globalAlpha = opt.alpha;
  ctx.fillStyle = opt.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `${size}px ${opt.font}`;
  const width = ctx.measureText(text).width;
  const maxW = opt.maxW || 100000;
  if (width > maxW && width > 0) size *= maxW / width;
  ctx.font = `${size}px ${opt.font}`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawDescentNotes(ctx, w, h, t) {
  const each = 3.5;
  const start = 16.2 - each * DESCENT_NOTES.length;
  const x = Math.max(22, w * 0.06);
  const y = h - Math.max(108, h * 0.16);
  const maxW = w - x * 2;
  const size = Math.min(18, Math.max(13, w * 0.028));
  for (let i = 0; i < DESCENT_NOTES.length; i++) {
    const inn = start + i * each;
    const alpha = span(t, inn, inn + 0.4, inn + each - 0.45, inn + each);
    drawLeftLine(ctx, DESCENT_NOTES[i], x, y, {
      alpha, size, font: SANS, color: "#e7e1d6", maxW,
    });
  }
}

function stillTitleLayout(w, h) {
  const rows = [
    ["PLANETA BEZ NAZWY", SANS, "#c4a48a", 0.026, 3],
    ["Za labiryntem", SERIF, "#e7e1d6", 0.07, 0],
    ["2026", SANS, "#c4a48a", 0.032, 5],
  ];
  const sizes = rows.map((row) => Math.min(64, Math.max(15, w * row[3])));
  const pad = Math.max(10, Math.min(22, Math.min(w, h) * 0.018));
  const gap01 = sizes[0] * 0.5 + sizes[1] * 0.5 + pad;
  const gap12 = sizes[1] * 0.5 + sizes[2] * 0.5 + pad;
  const block = sizes[0] * 0.5 + gap01 + gap12 + sizes[2] * 0.5;
  const minTop = sizes[0] * 0.55 + 6;
  let top = Math.max(minTop, h * 0.16);
  const floor = h * 0.62;
  if (top + block > floor) top = Math.max(minTop, floor - block);
  const y0 = top + sizes[0] * 0.5;
  return {
    rows,
    sizes,
    ys: [y0, y0 + gap01, y0 + gap01 + gap12],
    bottom: top + block,
  };
}

function drawStillNotes(ctx, w, h, below) {
  const size = Math.min(16, Math.max(13, w * 0.022));
  const x = w * 0.1;
  const maxW = w * 0.8;
  ctx.save();
  ctx.fillStyle = "#c4a48a";
  ctx.font = `${size}px ${SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const words = DESCENT_NOTES.join(" ").split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = trial;
  }
  if (line) lines.push(line);
  const lineH = size * 1.45;
  const after = below + Math.max(16, h * 0.03);
  let y = after;
  const bottom = h - 12;
  if (y + lines.length * lineH > bottom) y = Math.max(after, bottom - lines.length * lineH);
  for (const row of lines) {
    ctx.fillText(row, x, y);
    y += lineH;
  }
  ctx.restore();
}

function drawTitle(ctx, w, h, t) {
  const alpha = span(t, 16.2, 17.4, 80, 81);
  if (alpha < 0.02) return;
  const cx = w * 0.5;
  const cy = h * 0.42;
  const maxW = w * 0.88;
  label(ctx, "PLANETA BEZ NAZWY", cx, cy - Math.min(54, h * 0.07), {
    alpha, size: Math.min(15, w * 0.028), font: SANS, color: "#c4a48a", spacing: 3.2, maxW,
  });
  label(ctx, "Za labiryntem", cx, cy, {
    alpha, size: Math.min(76, Math.max(34, w * 0.078)), font: SERIF, color: "#e7e1d6", maxW, scale: 0.94 + 0.06 * alpha,
  });
  rule(ctx, cx, cy + Math.min(46, h * 0.06), Math.min(240, w * 0.42) * alpha, alpha);
  label(ctx, "2026", cx, cy + Math.min(78, h * 0.1), {
    alpha: alpha * rise(t, 20.5, 0.6), size: Math.min(22, w * 0.04), font: SANS, color: "#c4a48a", spacing: 6, maxW,
  });
}

function drawStill(ctx, w, h) {
  const layout = stillTitleLayout(w, h);
  const cx = w * 0.5;
  const maxW = w * 0.9;
  for (let i = 0; i < layout.rows.length; i++) {
    const row = layout.rows[i];
    label(ctx, row[0], cx, layout.ys[i], {
      alpha: 1,
      size: layout.sizes[i],
      font: row[1],
      color: row[2],
      spacing: row[4],
      maxW,
    });
  }
  return layout.bottom;
}

export function paintIntroFrame(ctx, w, h, t, reduced) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#070706";
  ctx.fillRect(0, 0, w, h);
  if (reduced) {
    drawHall(ctx, w, h, 21);
    ctx.fillStyle = "rgba(7, 7, 6, 0.62)";
    ctx.fillRect(0, 0, w, h);
    vignette(ctx, w, h, 0.72);
    const below = drawStill(ctx, w, h);
    drawStillNotes(ctx, w, h, below);
    ctx.globalAlpha = 1;
    return;
  }
  if (t < 8.6) drawSpace(ctx, w, h, t);
  if (t > 7.35) drawHall(ctx, w, h, t);
  const fade = cutFade(t);
  if (fade > 0) {
    ctx.fillStyle = `rgba(7, 7, 6, ${fade})`;
    ctx.fillRect(0, 0, w, h);
  }
  const scrim = rise(t, 15.8, 0.9) * 0.5;
  if (scrim > 0.02) {
    ctx.fillStyle = `rgba(7, 7, 6, ${scrim})`;
    ctx.fillRect(0, 0, w, h);
  }
  vignette(ctx, w, h, t > 16 ? 0.7 : 0.5);
  drawDescentNotes(ctx, w, h, t);
  drawTitle(ctx, w, h, t);
  ctx.globalAlpha = 1;
}
