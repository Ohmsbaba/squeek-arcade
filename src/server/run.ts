import { randomBytes } from "node:crypto";
import { z } from "zod";
import { CLIENT_SEED_PATTERN, roundDigest } from "@/shared/fairness";
import { MAX_AUTO_CASHOUT, MAX_STAKE, MIN_AUTO_CASHOUT, MIN_STAKE } from "@/shared/game-rules";
import { blockBonusBp, crashFromDigest, livePayout, msToReach, multAt, rpmBoostBp, RUN_COUNTDOWN_MS } from "@/shared/run-curve";
import { db, isUniqueViolation } from "./db";
import { GameError } from "./errors";
import { currentCommit, spendCommit } from "./fairness";
import { credit, debit } from "./ledger";
import { applyRound, syncAchievements, type RoundRewards } from "./progression";
import { readLiveWheel, readLiveWheelQuickly } from "./squeekchain";
import { publicRound, type RoundWithSeed } from "./views";

export const startRunSchema = z.object({
  stake: z.number().int("Bets are whole points.").min(MIN_STAKE, `The minimum bet is ${MIN_STAKE}.`).max(MAX_STAKE, `The maximum bet is ${MAX_STAKE.toLocaleString("en")}.`),
  autoCashout: z.number().int().min(MIN_AUTO_CASHOUT, "Auto cash-out starts at 1.01x.").max(MAX_AUTO_CASHOUT, "Auto cash-out stops at 1000x.").nullable().optional(),
  clientSeed: z.string().regex(CLIENT_SEED_PATTERN, "The client seed must be 1 to 64 plain characters."),
  commitHash: z.string().length(64),
  requestKey: z.string().min(8).max(64),
});
export type StartRunInput = z.infer<typeof startRunSchema>;

const BLOCK_READ_WINDOW_MS = 15_000;

const newShareId = () => randomBytes(9).toString("base64url");

/** What has happened by this moment, given only the committed numbers and the server's clock. */
export function runVerdict(
  round: { crashMult: number; autoCashout: number | null; liftoffAt: Date },
  now: number,
  cashingOut: boolean,
): { kind: "running" } | { kind: "countdown" } | { kind: "won"; mult: number; at: number; auto: boolean } | { kind: "lost"; at: number } {
  const liftoff = round.liftoffAt.getTime();
  const elapsed = now - liftoff;
  if (elapsed < 0) return { kind: "countdown" };
  // Auto cash-out wins any tie with the stop, because P(stop >= x) = 99%/x counts the equal case.
  if (round.autoCashout !== null && round.autoCashout <= round.crashMult) {
    const autoAt = msToReach(round.autoCashout);
    if (elapsed >= autoAt) return { kind: "won", mult: round.autoCashout, at: liftoff + autoAt, auto: true };
  }
  const stopAt = msToReach(round.crashMult);
  if (elapsed >= stopAt) return { kind: "lost", at: liftoff + stopAt };
  if (cashingOut) return { kind: "won", mult: multAt(elapsed), at: now, auto: false };
  return { kind: "running" };
}

/** When the round finishes if nobody presses anything. Server-only: telling a client would give away the stop. */
export function nextEventAt(round: { crashMult: number; autoCashout: number | null; liftoffAt: Date }) {
  const liftoff = round.liftoffAt.getTime();
  if (round.autoCashout !== null && round.autoCashout <= round.crashMult) return liftoff + msToReach(round.autoCashout);
  return liftoff + msToReach(round.crashMult);
}

const noRewards: RoundRewards = { xpGained: 0, unlocked: [], challengesCompleted: [] };

type Settlement = { round: RoundWithSeed; balance: bigint; rewards: RoundRewards; settledNow: boolean };

/** Settles exactly once. The status change is the gate: whichever request flips ACTIVE owns the payout. */
async function settle(
  round: RoundWithSeed,
  verdict: { kind: "won"; mult: number; at: number } | { kind: "lost"; at: number },
): Promise<Settlement> {
  await syncAchievements();
  const at = new Date(verdict.at);
  const won = verdict.kind === "won";
  const mult = won ? verdict.mult : round.crashMult!;
  // Blocks only count if this is happening about when the round ended, so the reading describes the
  // round. A round settled long afterwards keeps its locked work boost and takes no block bonus.
  let blocksMined = 0;
  if (won && round.startBlock !== null && Math.abs(Date.now() - verdict.at) < BLOCK_READ_WINDOW_MS) {
    const wheel = await readLiveWheelQuickly();
    if (wheel.blockHeight !== null) blocksMined = Math.max(0, wheel.blockHeight - round.startBlock);
  }
  const payout = won ? livePayout(round.stake, mult, round.boostBp + blockBonusBp(blocksMined)) : 0;

  const result = await db.$transaction(async (tx) => {
    const flipped = await tx.gameRound.updateMany({
      where: { id: round.id, status: "ACTIVE" },
      data: { status: won ? "WON" : "LOST", payout, resultMult: mult, settledAt: at, cashedOut: won, blocksMined },
    });
    if (flipped.count === 0) return null;
    await tx.fairnessSeed.update({ where: { id: round.seedId }, data: { status: "REVEALED", revealedAt: new Date() } });
    if (payout > 0) await credit(tx, round.userId, payout, "PAYOUT", round.id);
    const rewards = await applyRound(tx, {
      userId: round.userId, roundId: round.id, game: "RUN", won, cashedOut: won, resultMult: mult,
      usedSqueek: false, balls: 1, liveRun: (round.liveRpm ?? 0) > 0, blocksMined, stake: round.stake, payout, at,
    });
    return rewards;
  });

  const fresh = await db.gameRound.findUniqueOrThrow({ where: { id: round.id }, include: { seed: true } });
  const balance = await db.demoBalance.findUniqueOrThrow({ where: { userId: round.userId } });
  return { round: fresh, balance: balance.amount, rewards: result ?? noRewards, settledNow: result !== null };
}

async function loadOwned(userId: string, roundId: string) {
  const round = await db.gameRound.findFirst({ where: { id: roundId, userId, game: "RUN" }, include: { seed: true } });
  if (!round) throw new GameError("round_not_found", 404, "That round isn't yours or doesn't exist.");
  return round;
}

/** Finishes this player's round if its time has passed. Lets a player leave and come back. */
async function settleIfDue(round: RoundWithSeed, now: number): Promise<RoundWithSeed | Settlement> {
  if (round.status !== "ACTIVE") return round;
  const v = runVerdict(round as RoundWithSeed & { crashMult: number; liftoffAt: Date }, now, false);
  if (v.kind === "won" || v.kind === "lost") return settle(round, v);
  return round;
}

export async function startRun(userId: string, input: StartRunInput, now = Date.now()) {
  const repeat = await db.gameRound.findUnique({ where: { userId_requestKey: { userId, requestKey: input.requestKey } }, include: { seed: true } });
  if (repeat) return startResponse(repeat, userId, now);

  const active = await db.gameRound.findFirst({ where: { userId, game: "RUN", status: "ACTIVE" }, include: { seed: true } });
  if (active) {
    const after = await settleIfDue(active, now);
    const stillActive = "seed" in after && after.status === "ACTIVE";
    if (stillActive) throw new GameError("round_active", 409, "You already have a wheel turning.", { roundId: active.id });
  }

  const seed = await currentCommit(userId);
  if (seed.hash !== input.commitHash) {
    throw new GameError("commit_changed", 409, "The fairness commitment moved on. Try again.", { commit: { hash: seed.hash, nonce: seed.nonce } });
  }

  // The real wheel, read from the contract by the server. A client can't claim a boost, and a failed read just means none.
  const wheel = await readLiveWheel();
  const beacon = wheel.beacon;
  const crashMult = crashFromDigest(roundDigest(seed.serverSeed, input.clientSeed, seed.nonce, "run", beacon));
  try {
    const created = await db.$transaction(async (tx) => {
      if (!(await spendCommit(tx, { id: seed.id, userId, nonce: seed.nonce }, "IN_PLAY", new Date(now)))) {
        throw new GameError("commit_changed", 409, "The fairness commitment moved on. Try again.");
      }
      const round = await tx.gameRound.create({
        data: {
          userId, game: "RUN", stake: input.stake, requestKey: input.requestKey, seedId: seed.id, clientSeed: input.clientSeed,
          shareId: newShareId(), liftoffAt: new Date(now + RUN_COUNTDOWN_MS), crashMult, autoCashout: input.autoCashout ?? null,
          beacon, liveRpm: wheel.running ? wheel.rpm : 0, boostBp: wheel.running ? rpmBoostBp(wheel.rpm) : 0, startBlock: wheel.blockHeight,
        },
        include: { seed: true },
      });
      await debit(tx, userId, input.stake, "STAKE", round.id);
      return round;
    });
    return startResponse(created, userId, now);
  } catch (error) {
    // A duplicate of this very request lost the race: answer with the round the winner made.
    const lostRace = error instanceof GameError && error.code === "commit_changed";
    if (isUniqueViolation(error) || lostRace) {
      const raced = await db.gameRound.findUnique({ where: { userId_requestKey: { userId, requestKey: input.requestKey } }, include: { seed: true } });
      if (raced) return startResponse(raced, userId, now);
      if (lostRace) throw error;
      throw new GameError("round_active", 409, "You already have a wheel turning.");
    }
    throw error;
  }
}

async function startResponse(round: RoundWithSeed, userId: string, now: number) {
  const balance = await db.demoBalance.findUniqueOrThrow({ where: { userId } });
  const commit = await currentCommit(userId);
  return { round: publicRound(round), balance: balance.amount, commit: { hash: commit.hash, nonce: commit.nonce }, serverNow: now };
}

async function settlementResponse(s: Settlement, now: number) {
  const commit = await currentCommit(s.round.userId);
  return {
    round: publicRound(s.round), balance: s.balance, xpGained: s.rewards.xpGained, unlocked: s.rewards.unlocked,
    challengesCompleted: s.rewards.challengesCompleted, settledNow: s.settledNow,
    commit: { hash: commit.hash, nonce: commit.nonce }, serverNow: now,
  };
}

/** The client's only say is the moment this request arrives. The multiplier comes from the server's clock. */
export async function cashOut(userId: string, roundId: string, now = Date.now()) {
  const round = await loadOwned(userId, roundId);
  if (round.status !== "ACTIVE") {
    // A repeat of a finished cash-out gets the same answer and moves nothing.
    const balance = await db.demoBalance.findUniqueOrThrow({ where: { userId } });
    return settlementResponse({ round, balance: balance.amount, rewards: noRewards, settledNow: false }, now);
  }
  const verdict = runVerdict(round as RoundWithSeed & { crashMult: number; liftoffAt: Date }, now, true);
  if (verdict.kind === "countdown") throw new GameError("not_started", 409, "The wheel hasn't started yet.");
  if (verdict.kind === "running") throw new Error("unreachable: cashing out is never 'running'");
  return settlementResponse(await settle(round, verdict), now);
}

/** A round's state as of now, settling it if it has finished. */
export async function readRun(userId: string, roundId: string, now = Date.now()) {
  const round = await loadOwned(userId, roundId);
  const after = await settleIfDue(round, now);
  if ("rewards" in after) return { finished: true as const, ...(await settlementResponse(after, now)) };
  if (after.status !== "ACTIVE") {
    const balance = await db.demoBalance.findUniqueOrThrow({ where: { userId } });
    return { finished: true as const, ...(await settlementResponse({ round: after, balance: balance.amount, rewards: noRewards, settledNow: false }, now)) };
  }
  return { finished: false as const, round: publicRound(after), serverNow: now };
}

/** For a reload: the round still in flight, if there is one. A round that ended while away is settled and reported. */
export async function activeRun(userId: string, now = Date.now()) {
  const round = await db.gameRound.findFirst({ where: { userId, game: "RUN", status: "ACTIVE" }, include: { seed: true } });
  if (!round) return { active: null, serverNow: now };
  const state = await readRun(userId, round.id, now);
  return state.finished ? { active: null, endedWhileAway: state, serverNow: now } : { active: state.round, serverNow: now };
}

/** Server-side only: used by the stream to wake at the right moment. */
export async function runSchedule(userId: string, roundId: string) {
  const round = await loadOwned(userId, roundId);
  if (round.status !== "ACTIVE") return null;
  return nextEventAt(round as RoundWithSeed & { crashMult: number; liftoffAt: Date });
}
