/**
 * Builds the payout tables from the physics itself. Each chute and ball count gets its own table,
 * so choosing them changes the shape of the risk and aims at the same expected return. Tokens knock
 * into each other on a multi-ball drop, which spreads them, so a ball count can't borrow another's odds.
 *
 *   npm run calibrate -- [ballsPerCombination]
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BALL_COUNTS, CHUTES, SLOTS, type Chute } from "../src/shared/drops/board";
import { initPhysics, simulateDrop } from "../src/shared/drops/sim";

const SAMPLES = Number(process.argv[2] ?? 30000);
const TARGET_RTP = 0.97;
const MAX_MULT = 500;
const SHAPE = 0.86;
const WORKERS = 6;

function nice(m: number): number {
  if (m >= 100) return Math.round(m / 10) * 10;
  if (m >= 20) return Math.round(m);
  if (m >= 5) return Math.round(m * 2) / 2;
  return Math.max(0.1, Math.round(m * 10) / 10);
}

async function worker(chute: Chute, balls: number) {
  await initPhysics();
  const c = new Array(SLOTS).fill(0);
  let unlanded = 0;
  for (let i = 0; i * balls < SAMPLES; i++) {
    const t = simulateDrop(randomBytes(32), chute, balls, { trace: false });
    for (const s of t.slots) c[s]++;
    if (!t.landed) unlanded++;
  }
  process.stdout.write(JSON.stringify({ c, unlanded }));
}

function runWorker(chute: number, balls: number): Promise<{ c: number[]; unlanded: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), String(SAMPLES), String(chute), String(balls)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`worker ${chute}/${balls} exited ${code}`))));
  });
}

/** Pays never fall as a slot gets further from the most-hit one. */
function monotone(table: number[], p: number[]) {
  const mode = p.indexOf(Math.max(...p));
  for (let i = mode + 1; i < table.length; i++) table[i] = Math.max(table[i], table[i - 1]);
  for (let i = mode - 1; i >= 0; i--) table[i] = Math.max(table[i], table[i + 1]);
  return table;
}

function buildTable(chute: number, source: number[], total: number) {
  let raw = chute <= 0 ? [...source] : [...source].reverse();
  if (chute === 0) raw = raw.map((n, i) => (n + raw[SLOTS - 1 - i]) / 2);
  const p = raw.map((n) => (n + 0.5) / (total + 0.5 * SLOTS));
  let k = 0.3;
  let table: number[] = [];
  const rtp = () => table.reduce((sum, m, i) => sum + m * p[i], 0);
  for (let iter = 0; iter < 60; iter++) {
    table = monotone(p.map((pi) => Math.min(MAX_MULT, nice(k * Math.pow(pi, -SHAPE)))), p);
    k *= Math.pow(TARGET_RTP / rtp(), 0.5);
  }
  // Rounding leaves a small error. Close it on the most-hit slots, which move the return most finely.
  const order = p.map((_, i) => i).sort((a, b) => p[b] - p[a]);
  for (let guard = 0; guard < 400 && Math.abs(rtp() - TARGET_RTP) > 0.001; guard++) {
    const i = order[guard % 3];
    const delta = rtp() > TARGET_RTP ? -0.01 : 0.01;
    table[i] = Math.max(0.05, Math.round((table[i] + delta) * 100) / 100);
    // The centre chute has to stay a mirror of itself.
    if (chute === 0) table[SLOTS - 1 - i] = table[i];
  }
  return { table, p, rtp: rtp() };
}

async function main() {
  const half = CHUTES.filter((c) => c <= 0);
  const jobs = BALL_COUNTS.flatMap((balls) => half.map((chute) => ({ balls, chute })));
  const results = new Map<string, number[]>();
  let unlanded = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const r = await runWorker(job.chute, job.balls);
        results.set(`${job.balls}:${job.chute}`, r.c);
        unlanded += r.unlanded;
        console.log(`done ${job.balls} balls, chute ${job.chute}`);
      }
    }),
  );
  console.log("unlanded", unlanded);

  const tables: Record<string, Record<string, number[]>> = {};
  const probabilities: Record<string, Record<string, number[]>> = {};
  for (const balls of BALL_COUNTS) {
    tables[balls] = {};
    probabilities[balls] = {};
    for (const chute of CHUTES) {
      const source = results.get(`${balls}:${chute <= 0 ? chute : -chute}`)!;
      const total = source.reduce((a, b) => a + b, 0);
      const { table, p, rtp } = buildTable(chute, source, total);
      tables[balls][chute] = table;
      probabilities[balls][chute] = p.map((x) => Number(x.toFixed(5)));
      console.log(`${balls} balls, chute ${chute}: return ${(rtp * 100).toFixed(2)}%`, table.join(" "));
    }
  }
  writeFileSync(
    new URL("../src/shared/drops/tables.json", import.meta.url),
    JSON.stringify({ ballsPerCombination: SAMPLES, targetReturn: TARGET_RTP, tables, probabilities }, null, 1) + "\n",
  );
}

const [, , , chuteArg, ballsArg] = process.argv;
if (chuteArg !== undefined) worker(Number(chuteArg) as Chute, Number(ballsArg));
else main();
