/**
 * The real wheel, as the game server sees it: read straight from the SqueekCore contract on Sepolia,
 * so anyone can check the same numbers. Each accepted wheel-magnet passage is one work unit, so work
 * over time is his average speed. Settlement batches arrive roughly every 10 minutes.
 *
 * The browser separately shows his up-to-the-second status from the official API. The server doesn't
 * use that feed for anything: Cloudflare challenges it from this hosting, and bonuses have to rest on
 * something a client can't fake. On any read failure the game plays on with no bonus.
 */
import { parseAbi } from "viem";
import { logError } from "./errors";
import { client, collection } from "./nft";

const FRESH_MS = 12_000;
const READ_TIMEOUT_MS = 2_500;
const FIRST_READ_TIMEOUT_MS = 8_000;
const LOG_EVERY_MS = 10 * 60_000;
/** About 20 minutes of Ethereum blocks: wide enough to always span a settlement while he's active. */
const WINDOW_BLOCKS = 100n;
const SECONDS_PER_BLOCK = 12;

const coreAbi = parseAbi([
  "function state() view returns ((uint64 settledThroughRound, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint64 blockHeight, uint96 blockProgress, uint32 workPerThousandBlocks, uint256 authorizationNonce, bool paused))",
]);

export type LiveWheel = {
  /** Whether the chain answered. */
  available: boolean;
  /** He put in settled work during the window. */
  running: boolean;
  /** Average speed over the window, from settled on-chain work. */
  rpm: number;
  /** Settled wheel passages during the window. */
  recentWork: number;
  windowMinutes: number;
  /** Settled Squeek block height. */
  blockHeight: number | null;
  /** Hash of the Sepolia block these numbers were read at. Mixed into Squeek Run's digest. */
  beacon: string | null;
  ethBlock: number | null;
};

export const NO_READING: LiveWheel = { available: false, running: false, rpm: 0, recentWork: 0, windowMinutes: 0, blockHeight: null, beacon: null, ethBlock: null };

/** Turns two on-chain readings into the wheel's state. */
export function wheelFromReadings(now: { work: bigint; height: bigint; hash: string; number: bigint }, before: { work: bigint }, windowBlocks: bigint): LiveWheel {
  const recentWork = Number(now.work - before.work);
  const minutes = (Number(windowBlocks) * SECONDS_PER_BLOCK) / 60;
  const rpm = Math.max(0, Math.round(recentWork / minutes));
  return {
    available: true, running: recentWork > 0, rpm: recentWork > 0 ? Math.max(1, rpm) : 0, recentWork: Math.max(0, recentWork),
    windowMinutes: minutes, blockHeight: Number(now.height), beacon: now.hash, ethBlock: Number(now.number),
  };
}

async function readChain(): Promise<LiveWheel> {
  const c = await collection();
  const block = await client().getBlock({ blockTag: "latest" });
  const read = (blockNumber: bigint) => client().readContract({ address: c.core, abi: coreAbi, functionName: "state", blockNumber });
  // One snapshot per block, as the docs ask.
  const [now, before] = await Promise.all([read(block.number), read(block.number - WINDOW_BLOCKS)]);
  return wheelFromReadings({ work: now.cumulativeWork, height: now.blockHeight, hash: block.hash, number: block.number }, { work: before.cumulativeWork }, WINDOW_BLOCKS);
}

let cached: { at: number; value: LiveWheel } | null = null;
let pending: Promise<LiveWheel> | null = null;
let lastLoggedFailure = 0;

/** Test seam: lets tests decide what the wheel is doing. */
let override: (() => LiveWheel | Promise<LiveWheel>) | null = null;
export function setLiveWheelForTests(fn: (() => LiveWheel | Promise<LiveWheel>) | null) {
  override = fn;
  cached = null;
}

/** Starts a read unless one is under way. A slow one still fills the cache for whoever asks next. */
function refresh(): Promise<LiveWheel> {
  pending ??= readChain()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .catch(async (error) => {
      if (Date.now() - lastLoggedFailure > LOG_EVERY_MS) {
        lastLoggedFailure = Date.now();
        await logError("squeekchain.chain", error);
      }
      return cached?.value ?? NO_READING;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Cached, time-limited and never throws. The first read allows longer, since it also verifies the collection. */
export async function readLiveWheel(): Promise<LiveWheel> {
  if (override) return override();
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  const waitMs = cached ? READ_TIMEOUT_MS : FIRST_READ_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<LiveWheel>((resolve) => {
    timer = setTimeout(() => resolve(cached?.value ?? NO_READING), waitMs);
  });
  try {
    return await Promise.race([refresh(), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * For a cash-out, which has already been decided by the clock and mustn't sit waiting on an RPC: if
 * the wheel stopped during that wait, a win could be overtaken by the stop.
 */
export async function readLiveWheelQuickly(maxWaitMs = 150): Promise<LiveWheel> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fallback = new Promise<LiveWheel>((resolve) => {
    timer = setTimeout(() => resolve(cached?.value ?? NO_READING), maxWaitMs);
  });
  try {
    return await Promise.race([readLiveWheel(), fallback]);
  } finally {
    clearTimeout(timer);
  }
}
