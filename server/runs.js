import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gridPath } from "../shared/sim.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const runsPath = path.join(root, "data", "runs.jsonl");

function tenth(n) {
  return Math.round(Number(n) * 10) / 10;
}

export function pathPercent(maze, ex) {
  if (!maze || !ex || !maze.start || !maze.relic) return null;
  const cx = Math.floor(ex.x);
  const cy = Math.floor(ex.y);
  if (cx < 0 || cy < 0 || cx >= maze.w || cy >= maze.h) return null;
  const whole = gridPath(maze, maze.start.x, maze.start.y, maze.relic.x, maze.relic.y);
  if (!whole || whole.length < 2) return null;
  const rest = gridPath(maze, cx, cy, maze.relic.x, maze.relic.y);
  if (!rest) return null;
  const total = whole.length - 1;
  const remain = rest.length - 1;
  return tenth(((total - remain) / total) * 100);
}

export function runRecord(room, result) {
  return {
    heat: room.heat,
    size: room.maze ? room.maze.w : null,
    time: tenth(room.roundT || 0),
    result,
    chaseAt: room.chaseAt == null ? null : tenth(room.chaseAt),
    chasePct: room.chaseAt == null ? null : room.chasePct ?? null,
    seals: (room.usedSeals || []).map((seal) => ({
      t: tenth(seal.t),
      axis: seal.axis,
      x: seal.x,
      y: seal.y,
    })),
    loot: [...(room.takenLoot || [])],
    veil: !!room.veilUsed,
  };
}

export function appendRun(row, file = runsPath) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}

export function readRuns(file = runsPath) {
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split("\n")) {
    const text = line.trim();
    if (!text) continue;
    try {
      rows.push(JSON.parse(text));
    } catch {
      // urwana linia nie psuje reszty
    }
  }
  return rows;
}

function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function num(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return tenth(n).toFixed(1).replace(".", ",");
}

export function summaryLines(rows) {
  if (!rows.length) return ["Brak rund."];
  const wins = rows.filter((row) => row.result === "win").length;
  const losses = rows.filter((row) => row.result === "lose").length;
  const times = rows.map((row) => Number(row.time)).filter((n) => Number.isFinite(n));
  const heats = [0, 1, 2].map((heat) => rows.filter((row) => row.heat === heat).length);
  const chases = rows.filter((row) => row.chaseAt != null);
  const chaseTimes = chases.map((row) => Number(row.chaseAt)).filter((n) => Number.isFinite(n));
  const chasePcts = chases.map((row) => Number(row.chasePct)).filter((n) => Number.isFinite(n));
  const seals = mean(rows.map((row) => (Array.isArray(row.seals) ? row.seals.length : 0)));
  const loot = mean(rows.map((row) => (Array.isArray(row.loot) ? row.loot.length : 0)));
  const veils = rows.filter((row) => row.veil).length;
  const chaseLine = chases.length
    ? `Pościg: ${chases.length} z ${rows.length}, średnio po ${num(mean(chaseTimes))} s, latarnik na ${num(mean(chasePcts))}% trasy.`
    : "Pościg: brak.";
  return [
    `Rundy: ${rows.length}. Wygrane: ${wins}. Przegrane: ${losses}.`,
    `Średni czas: ${num(mean(times))} s.`,
    `Żar 0: ${heats[0]}. Żar 1: ${heats[1]}. Żar 2: ${heats[2]}.`,
    chaseLine,
    `Pieczęcie: średnio ${num(seals)}. Łup: średnio ${num(loot)}. Zasłona: ${veils} z ${rows.length}.`,
  ];
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
  for (const line of summaryLines(readRuns())) console.log(line);
}
