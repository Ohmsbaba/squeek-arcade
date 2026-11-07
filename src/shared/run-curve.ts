/**
 * Squeek Run's rules. Multipliers are integers in hundredths: 241 means 2.41x.
 *
 * crash(digest): the stop point, from the top 52 bits of the digest. P(stop >= x) = RETURN / x,
 * so any cash-out strategy returns the same 99% over the long run: no strategy beats another.
 */
import { digestRng } from "./fairness";

export const RUN_RETURN_PERCENT = 99;
export const RUN_MAX_MULT = 100_000; // 1000.00x
export const RUN_COUNTDOWN_MS = 3_000;
/** Per millisecond: 2x after 5.8 s, 10x after 19 s, 100x after 38 s, 1000x after 58 s. */
export const RUN_GROWTH = 0.00012;

export function crashFromDigest(digest: Uint8Array): number {
  let h = 0n;
  for (let i = 0; i < 7; i++) h = (h << 8n) | BigInt(digest[i]);
  h >>= 4n; // top 52 bits
  const e = 1n << 52n;
  const value = (BigInt(RUN_RETURN_PERCENT) * e) / (e - h);
  const hundredths = Number(value);
  return Math.min(RUN_MAX_MULT, Math.max(100, hundredths));
}

/** Multiplier in hundredths after elapsed ms, rounded down. */
export function multAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return 100;
  return Math.min(RUN_MAX_MULT, Math.floor(100 * Math.exp(RUN_GROWTH * elapsedMs) + 1e-9));
}

/** Smooth multiplier for animation only. Never used to settle anything. */
export function displayMultAt(elapsedMs: number): number {
  return elapsedMs <= 0 ? 1 : Math.exp(RUN_GROWTH * elapsedMs);
}

/** First elapsed ms at which the multiplier reaches m (hundredths). */
export function msToReach(mult: number): number {
  if (mult <= 100) return 0;
  return Math.ceil(Math.log(mult / 100) / RUN_GROWTH);
}

/** Payout never rounds in the player's favour past a whole credit. */
export function payoutFor(stake: number, mult: number): number {
  return Math.floor((stake * mult) / 100);
}

/** The real wheel's speed, turned into a payout boost: 1% per 10 rpm, from 1% to 10%. Basis points. */
export const MAX_RPM_BOOST_BP = 1000;
export function rpmBoostBp(rpm: number): number {
  if (rpm <= 0) return 0;
  return Math.min(MAX_RPM_BOOST_BP, Math.max(100, Math.round(rpm / 10) * 100));
}
/** Each real Squeek block mined during a round adds this much, up to a limit. */
export const BLOCK_BONUS_BP = 500;
export const MAX_BLOCKS_PAID = 5;
export const blockBonusBp = (blocks: number) => Math.min(MAX_BLOCKS_PAID, Math.max(0, blocks)) * BLOCK_BONUS_BP;

/** A cash-out with the live bonuses on top. The stop is untouched: these only ever add to a win. */
export function livePayout(stake: number, mult: number, bonusBp: number): number {
  return Math.floor((stake * mult * (10_000 + bonusBp)) / 1_000_000);
}

export const formatMult = (mult: number) => `${(mult / 100).toFixed(2)}x`;

export { digestRng };
