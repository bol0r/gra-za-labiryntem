import {
  FOV,
  SENT_FOV,
  clamp,
  gridPath,
  hasLos,
  neighbors,
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
let rowVsoft = new Float32Array(0);
let colConeF = new Float32Array(0);
let colInv = new Float32Array(0);
let frame32 = null;
let frame32Src = null;

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

// Ściany są próbkowane pionowo (cały słupek ma to samo u), więc trzymamy je w pamięci
// kolumnami: kolejne v leżą obok siebie i pętla ściany nie skacze po pamięci co 2 KB.
function transposed(src, size) {
  const dst = new Uint8ClampedArray(src.length);
  const s32 = new Uint32Array(src.buffer, src.byteOffset, size * size);
  const d32 = new Uint32Array(dst.buffer);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) d32[x * size + y] = s32[row + x];
  }
  return dst;
}

function wallMips(data, size) {
  const tex = withMips(data, size);
  tex.levels = tex.levels.map((lvl, i) => transposed(lvl, size >> i));
  tex.levels32 = tex.levels.map((lvl) => new Uint32Array(lvl.buffer, lvl.byteOffset, lvl.length >> 2));
  return tex;
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
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

// WebP, ~320 KB razem zamiast ~3 MB PNG. Zmień HD_VER przy każdej zmianie plików w tex/hd:
// serwer trzyma je w cache przeglądarki na stałe, a nowa wersja w adresie wymusza pobranie.
const HD_VER = "2";
const HD_NAMES = ["wall_a", "wall_b", "wall_c", "wall_d", "seal", "rune", "floor", "sky", "planet"];

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadHd() {
  hdLoading = true;
  try {
    // Pobieranie idzie równolegle, a rozpakowanie do pikseli po jednym pliku na zadanie,
    // żeby menu i intro nie stawały na jednej długiej klatce.
    const pending = HD_NAMES.map((name) => loadImage(`/tex/hd/${name}.webp?v=${HD_VER}`));
    pending.forEach((p) => p.catch(() => {}));
    const tex = [];
    for (let i = 0; i < 7; i++) {
      const img = await pending[i];
      // 0–5 to ściany (kolumnami), 6 to podłoga (wierszami).
      tex.push(i < 6 ? wallMips(imagePixels(img), img.width) : withMips(imagePixels(img), img.width));
      await nextTask();
    }
    const skyImg = await pending[7];
    const sky = imagePixels(skyImg);
    await nextTask();
    const planetImg = await pending[8];
    // Zdjęcie Wery na posadzce jednego ślepego zaułka (easter egg). Brak pliku nie psuje reszty HD.
    let egg = null;
    try {
      const eggImg = await loadImage(`/tex/hd/egg_photo.webp?v=${HD_VER}`);
      egg = withMips(imagePixels(eggImg), eggImg.width);
    } catch {
      egg = null;
    }
    hd = {
      egg,
      tex,
      sky,
      sky32: new Uint32Array(sky.buffer, sky.byteOffset, sky.length >> 2),
      skyW: skyImg.width,
      skyH: skyImg.height,
      planet: imagePixels(planetImg),
      planetW: planetImg.width,
      planetH: planetImg.height,
    };
  } catch {
    hd = null;
  }
  hdLoading = false;
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
  rowVsoft = new Float32Array(n);
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
  colConeF = new Float32Array(n);
  colInv = new Float32Array(n);
}

// Widok 32-bitowy na bufor klatki: jeden zapis na piksel zamiast czterech.
function frameView(data) {
  if (frame32Src !== data) {
    frame32 = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2);
    frame32Src = data;
  }
  return frame32;
}

// Ślepy zaułek ze zdjęciem: stały dla danego labiryntu, inny w każdej rundzie. Bez startu i serca.
let eggMaze = null;
let eggX = -1;
let eggY = -1;
let eggDx = 0;
let eggDy = 0;

function eggCell(maze) {
  if (eggMaze === maze) return;
  eggMaze = maze;
  eggX = -1;
  eggY = -1;
  const ends = [];
  for (let y = 0; y < maze.h; y++) {
    for (let x = 0; x < maze.w; x++) {
      if (maze.start && maze.start.x === x && maze.start.y === y) continue;
      if (maze.relic && maze.relic.x === x && maze.relic.y === y) continue;
      if (neighbors(maze, x, y).length === 1) ends.push(x, y);
    }
  }
  if (!ends.length) return;
  const seed = hash01(maze.w * 131 + (maze.start ? maze.start.x * 7 + maze.start.y : 0), (maze.relic ? maze.relic.x * 17 + maze.relic.y : 0) + (maze.pathLength || 0));
  const k = Math.floor(seed * (ends.length / 2)) * 2;
  // środek komórki: z wejścia do zaułka zdjęcie leży 1,4–2 jednostki przed latarnikiem, w dole kadru.
  // D to kierunek patrzenia z wejścia w głąb zaułka; podpis odbitki leży od strony wejścia.
  const [nx, ny] = neighbors(maze, ends[k], ends[k + 1])[0];
  eggX = ends[k] + 0.5;
  eggY = ends[k + 1] + 0.5;
  eggDx = ends[k] - nx;
  eggDy = ends[k + 1] - ny;
}

function paintPacked(data, z, w, h, maze, body, aim, horizon, flick, focal) {
  const out = frameView(data);
  const skyRows = Math.min(h, Math.ceil(horizon));
  skyX = growInt(skyX, w, false);
  skyY = growInt(skyY, h, false);
  planetU = growInt(planetU, w, true);
  planetV = growInt(planetV, h, true);
  growRows(h);
  const sky32 = hd.sky32;
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
  const invHSoft = 1.25 / (h * 0.55);
  for (let x = 0; x < w; x++) {
    const az = ((aim + Math.atan((x - halfW) / focal)) * RAD % 360 + 360) % 360;
    let sx = (az / 360) * skyW;
    if (sx >= skyW) sx = 0;
    skyX[x] = sx | 0;
    const du = wrap180(az - 40);
    const pu = (du / 6.5) * 168 + 384;
    planetU[x] = pu < 0 || pu >= planetW ? -1 : pu | 0;
  }
  let planetRows = false;
  for (let y = 0; y < h; y++) {
    if (y < skyRows) {
      const el = Math.atan((horizon - y) / focal) * RAD;
      let sy = ((90 - el) / 90) * skyH;
      if (sy < 0) sy = 0;
      else if (sy >= skyH) sy = skyH - 1;
      skyY[y] = sy | 0;
      const pv = -(((el - 13) / 6.5) * 168) + 384;
      planetV[y] = pv < 0 || pv >= planetH ? -1 : pv | 0;
      if (planetV[y] >= 0) planetRows = true;
    }
    if (y < horizon) {
      rowCenter[y] = 0;
      rowLvl[y] = 0;
    } else {
      const centerDist = (0.5 * focal) / Math.max(1, y - horizon);
      rowCenter[y] = centerDist;
      rowLvl[y] = floorLevel(centerDist, focal);
    }
    const vy = (y - horizon) * invHSoft;
    const vs = 1 - (vy < 0 ? -vy : vy);
    rowVsoft[y] = vs < 0.2 ? 0.2 : vs;
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
    colInv[col] = 1 / (rx * cosAim + ry * sinAim);
    const hit = raycast(maze, body.x, body.y, ang);
    z[col] = hit.dist;
    const line = focal / hit.dist;
    colLine[col] = line;
    colTop[col] = Math.max(0, Math.min(h, Math.floor(horizon - line / 2)));
    colBot[col] = Math.max(-1, Math.min(h - 1, Math.floor(horizon + line / 2)));
    // u rośnie zawsze od lewej do prawej, z której strony by nie patrzeć: glify nie są w lustrze,
    // a sąsiednie odcinki tej samej ściany leżą w tym samym kierunku.
    const flip = hit.side === 0 ? rx < 0 : ry > 0;
    colWallX[col] = flip ? 1 - hit.wallX : hit.wallX;
    const absOff = off < 0 ? -off : off;
    const k = 1 - (absOff / fovCone) * (absOff / fovCone);
    colCone[col] = k < 0.22 ? 0.22 : k;
    colConeF[col] = k < 0.2 ? 0.2 : k;
    colFall[col] = 1 / (1 + hit.dist * hit.dist * 0.05);
    colSide[col] = hit.side === 1 ? 0.85 : 1;
    colFog[col] = clamp((hit.dist - 1.2) / 12, 0, 0.58);
    const carved = hash01(hit.wx * 3 + 1, hit.wy * 5 + hit.side) > 0.78;
    colId[col] = hit.seal >= 0 ? 4 : carved ? 5 : Math.abs(hit.mapX * 13 + hit.mapY * 7 + hit.side * 5) % 4;
  }
  const skyEnd = Math.min(h, Math.max(0, Math.ceil(horizon)));
  for (let y = 0; y < skyEnd; y++) {
    const pv = planetRows ? planetV[y] : -1;
    const sy = skyY[y] * skyW;
    let i = y * w;
    if (pv < 0) {
      for (let x = 0; x < w; x++, i++) {
        if (y < colTop[x]) out[i] = sky32[sy + skyX[x]];
      }
      continue;
    }
    const prow = pv * planetW;
    for (let x = 0; x < w; x++, i++) {
      if (y >= colTop[x]) continue;
      const pu = planetU[x];
      const s = sky32[sy + skyX[x]];
      if (pu < 0) {
        out[i] = s;
        continue;
      }
      const pi = (prow + pu) << 2;
      const alpha = planetData[pi + 3];
      if (alpha === 0) {
        out[i] = s;
        continue;
      }
      const k = alpha * (1 / 255);
      const inv = 1 - k;
      const r = ((s & 255) * inv + planetData[pi] * k + 0.5) | 0;
      const g = (((s >>> 8) & 255) * inv + planetData[pi + 1] * k + 0.5) | 0;
      const b = (((s >>> 16) & 255) * inv + planetData[pi + 2] * k + 0.5) | 0;
      out[i] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  const bx = body.x;
  const by = body.y;
  const egg = hd.egg;
  if (egg) eggCell(maze);
  const eggOn = !!egg && eggX >= 0;
  for (let y = skyEnd; y < h; y++) {
    const centerDist = rowCenter[y];
    const fsize = fBase >> rowLvl[y];
    const fmask = fsize - 1;
    const fscale = 0.5 * fsize;
    const fimg = fLevels[rowLvl[y]];
    // zdjęcie ma 512 px na komórkę, posadzka 256, więc jeden poziom mip dalej
    const eLvl = eggOn ? Math.min(egg.levels.length - 1, rowLvl[y] + 1) : 0;
    const eSize = eggOn ? egg.size >> eLvl : 0;
    const eImg = eggOn ? egg.levels[eLvl] : null;
    let i = y * w;
    for (let x = 0; x < w; x++, i++) {
      if (y <= colBot[x]) continue;
      const dist = centerDist * colInv[x];
      const lamp = (colConeF[x] * flick) / (1 + dist * dist * 0.05);
      const wx = bx + colRx[x] * dist;
      const wy = by + colRy[x] * dist;
      const tx = Math.floor(wx * fscale) & fmask;
      const ty = Math.floor(wy * fscale) & fmask;
      const ti = (ty * fsize + tx) << 2;
      let cr = fimg[ti];
      let cg = fimg[ti + 1];
      let cb = fimg[ti + 2];
      const ex = wx - eggX;
      const ey = wy - eggY;
      if (eggOn && ex > -0.5 && ex < 0.5 && ey > -0.5 && ey < 0.5) {
        // obraz: w prawo = prawa ręka patrzącego (-Dy, Dx), w dół = w stronę wejścia (-D)
        const eu = 0.5 - ex * eggDy + ey * eggDx;
        const ev = 0.5 - ex * eggDx - ey * eggDy;
        const ei = (((ev * eSize) | 0) * eSize + ((eu * eSize) | 0)) << 2;
        const a = eImg[ei + 3] * (1 / 255);
        if (a > 0) {
          cr += (eImg[ei] - cr) * a;
          cg += (eImg[ei + 1] - cg) * a;
          cb += (eImg[ei + 2] - cb) * a;
        }
      }
      let r = cr * (0.16 + 1.05 * lamp) + 0.5;
      let g = cg * (0.16 + 0.903 * lamp) + 0.5;
      let b = cb * (0.16 + 0.714 * lamp) + 0.5;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      out[i] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  for (let col = 0; col < w; col++) {
    const line = colLine[col];
    const top = colTop[col];
    const bot = colBot[col];
    if (bot < top) continue;
    const wall = hd.tex[colId[col]];
    const lvl = wallLevel(line);
    const max = wall.levels.length - 1;
    const level = lvl > max ? max : lvl;
    const size = wall.size >> level;
    const mask = size - 1;
    const img = wall.levels32[level];
    const fog = colFog[col];
    const fogR = 70 * fog + 0.5;
    const fogG = 50 * fog + 0.5;
    const fogB = 34 * fog + 0.5;
    const sideFog = colSide[col] * (1 - fog);
    // kolor = tex * (0.16 + 1.05 * lamp * ciepło) * bok, potem mgła; lamp = fall * cone * vsoft * flick
    const amb = 0.16 * sideFog;
    const kR = 1.05 * colFall[col] * colCone[col] * flick * sideFog;
    const kG = kR * 0.86;
    const kB = kR * 0.68;
    const colBase = (Math.floor(colWallX[col] * size) & mask) * size;
    const step = line <= 1 ? 0 : size / line;
    let tv = line <= 1 ? 0 : (top - (horizon - line / 2)) * step;
    let i = top * w + col;
    for (let y = top; y <= bot; y++, i += w, tv += step) {
      const t = img[colBase + (Math.floor(tv) & mask)];
      const vs = rowVsoft[y];
      let r = (t & 255) * (amb + kR * vs) + fogR;
      let g = ((t >>> 8) & 255) * (amb + kG * vs) + fogG;
      let b = ((t >>> 16) & 255) * (amb + kB * vs) + fogB;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      out[i] = 0xff000000 | (b << 16) | (g << 8) | r;
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
  for (const beast of view.beasts || []) sprites.push({ ...beast, kind: "beast" });
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
    if ((sprite.kind === "sentinel" || sprite.kind === "beast" || sprite.kind === "seal" || sprite.kind === "key" || sprite.kind === "shard") && !hasLos(maze, body.x, body.y, sprite.x, sprite.y)) continue;
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
  const mark = sprite.kind === "seal";
  const pickup = sprite.kind === "key" || sprite.kind === "shard";
  if (dist < 0.2 || dist > (mark || pickup ? 16 : 10.4)) return;
  const ang = normalizeAngle(Math.atan2(dy, dx) - body.a);
  if (Math.abs(ang) > FOV * 0.58) return;
  const focal = (w * 0.5) / Math.tan(FOV * 0.5);
  const fog = mark || pickup ? clamp((dist - 4.5) / 14, 0, 0.45) : clamp((dist - 1.5) / 7.2, 0, 1);
  const cone = Math.max(0, 1 - (Math.abs(ang) / (FOV * 0.55)) ** 2);
  const fade = (1 - fog * fog) * (0.22 + 0.78 * cone);
  if (fade < 0.04) return;
  const screenX = w * 0.5 + Math.tan(ang) * focal;
  const tall = sprite.kind === "sentinel" ? 0.95 : sprite.kind === "beast" ? 0.62 : sprite.kind === "ping" ? 1.1 : pickup ? 0.7 : 0.72;
  const aspect = sprite.kind === "sentinel" ? 0.46 : sprite.kind === "beast" ? 0.4 : sprite.kind === "ping" ? 0.16 : 1;
  const size = mark ? Math.min(h * 0.46, (h * 0.72) / dist) : Math.min(h * 0.92, (h * tall) / dist);
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
  if (sprite.kind === "beast") return beastShade(u, v, time);
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
  const y = v - 0.46;
  const pulse = 0.88 + 0.12 * Math.sin(time * 3);
  if (key) {
    const head = Math.hypot(x + 0.1, y);
    const shaft = Math.abs(y) < 0.055 && x > -0.1 && x < 0.36;
    const tooth = (Math.abs(x - 0.16) < 0.04 || Math.abs(x - 0.28) < 0.04) && y > 0 && y < 0.16;
    if (head < 0.15 || shaft || tooth) return [248, 236, 210, 0.98 * pulse];
    if (head < 0.24 || (Math.abs(y) < 0.12 && x > -0.2 && x < 0.42)) return [24, 14, 8, 0.92 * pulse];
    return null;
  }
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const diamond = ax * 1.35 + ay;
  if (diamond > 0.46) return null;
  if (diamond < 0.12) return [255, 244, 210, 0.98 * pulse];
  if (diamond < 0.3) return [255, 168, 42, 0.96 * pulse];
  return [48, 22, 8, 0.9 * pulse];
}

function sealGlow(u, v, time) {
  const x = (u - 0.5) * 2;
  const y = (v - 0.5) * 2;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const hex = Math.max(ax * 0.866 + ay * 0.5, ay);
  if (hex > 1.02) return null;
  const pulse = 0.86 + 0.14 * Math.sin(time * 2.2);
  if (hex < 0.22) return [255, 228, 150, 0.98 * pulse];
  if (hex < 0.38) return [28, 16, 8, 0.92 * pulse];
  if (hex < 0.7) return [240, 168, 52, 0.96 * pulse];
  if (hex < 0.86) return [255, 232, 180, 0.9 * pulse];
  const a = (1.02 - hex) * 1.6 * pulse;
  if (a < 0.08) return null;
  return [214, 140, 48, a];
}

function beastShade(u, v, time) {
  const x = u - 0.5;
  const y = v;
  const head = Math.hypot(x / 0.16, (y - 0.22) / 0.1);
  let half = 0;
  if (y >= 0.32 && y < 0.5) half = 0.16 + (y - 0.32) * 1.2;
  else if (y >= 0.5 && y < 0.82) half = 0.34 - (y - 0.5) * 0.2;
  else if (y >= 0.82 && y < 0.98) half = 0.26 - (y - 0.82) * 0.7;
  const body = half > 0 && Math.abs(x) < half;
  const headOn = head < 1 && y < 0.36;
  const pulse = 0.86 + 0.1 * Math.sin(time * 2.4);
  if (headOn || body) {
    const edge = headOn ? head : Math.abs(x) / half;
    const shade = (1 - edge * 0.4) * pulse;
    return [118 * shade, 78 * shade, 48 * shade, 0.9];
  }
  return null;
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
  const { maze, explorer, sentinel, beasts, ping, time, wake } = view;
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

  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(120, 86, 52, 0.85)";
  ctx.beginPath();
  for (const trail of maze.trails || []) {
    trail.forEach((cell, index) => {
      const x = toX(cell.x + 0.5);
      const y = toY(cell.y + 0.5);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const seal of maze.seals || []) {
    if (seal.open) continue;
    const midX = seal.axis === "v" ? seal.x : seal.x + 0.5;
    const midY = seal.axis === "v" ? seal.y + 0.5 : seal.y;
    const nearDoor = explorer && Math.hypot(explorer.x - midX, explorer.y - midY) < 1.2;
    drawMapSeal(ctx, toX(midX), toY(midY), Math.max(9, size * 0.36), nearDoor, time);
  }

  for (const item of maze.loot || []) {
    if (item.taken) continue;
    drawMapLoot(ctx, toX(item.x), toY(item.y), size, item.kind === "key");
  }

  if (sentinel) {
    const hunting = sentinel.state === "hunt";
    const beat = hunting ? 0.82 + 0.18 * Math.sin(time * 8) : 1;
    ctx.save();
    ctx.globalAlpha = beat;
    drawActor(ctx, toX(sentinel.x), toY(sentinel.y), sentinel.a, "guard", size * (hunting ? 1.15 * beat : 1));
    ctx.restore();
  }
  for (const beast of beasts || []) {
    drawActor(ctx, toX(beast.x), toY(beast.y), beast.a, "beast", size * 0.72);
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

function drawMapSeal(ctx, x, y, s, near, time) {
  const pulse = near ? 0.94 + 0.06 * Math.sin(time * 4) : 1;
  const r = s * (near ? 1.12 : 1) * pulse;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#140e08";
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.strokeStyle = near ? "#ffe6b0" : "#f0b43a";
  ctx.stroke();
  ctx.fillStyle = near ? "#ffe2aa" : "#e8a040";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMapLoot(ctx, x, y, size, key) {
  const r = Math.max(key ? 8 : 7, size * (key ? 0.3 : 0.26));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(16, 10, 6, 0.94)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
  ctx.fill();
  if (key) {
    ctx.strokeStyle = "#f7ead0";
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(-r * 0.22, 0, r * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.85, 0);
    ctx.moveTo(r * 0.48, 0);
    ctx.lineTo(r * 0.48, r * 0.36);
    ctx.moveTo(r * 0.74, 0);
    ctx.lineTo(r * 0.74, r * 0.26);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#ffc14a";
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.7, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff3cc";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
  const beast = kind === "beast";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  const s = Math.max(8, size * 0.34);
  ctx.fillStyle = guard ? "#243024" : beast ? "#3a2c24" : "#3a2418";
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.55, s * 0.15);
  ctx.lineTo(s * 0.28, s * 0.85);
  ctx.lineTo(-s * 0.28, s * 0.85);
  ctx.lineTo(-s * 0.55, s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = guard ? "#8aa36a" : beast ? "#c4a080" : "#e2b07a";
  ctx.beginPath();
  ctx.arc(0, -s * 0.15, guard ? s * 0.18 : s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  if (!guard && !beast) {
    ctx.fillStyle = "#f6e2b8";
    ctx.beginPath();
    ctx.arc(0, -s * 0.72, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
