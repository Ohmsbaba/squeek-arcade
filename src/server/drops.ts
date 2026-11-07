import { randomBytes } from "node:crypto";
import { z } from "zod";
import { BALL_COUNTS, CHUTES, type Chute } from "@/shared/drops/board";
import { initPhysics, simulateDrop } from "@/shared/drops/sim";
import { slotMult } from "@/shared/drops/tables";
import { CLIENT_SEED_PATTERN, roundDigest } from "@/shared/fairness";
import { MAX_STAKE, MIN_STAKE } from "@/shared/game-rules";
import { payoutFor } from "@/shared/run-curve";
import { db, isUniqueViolation } from "./db";
import { GameError } from "./errors";
import { currentCommit, spendCommit } from "./fairness";
import { credit, debit } from "./ledger";
import { readSqueekForPlay } from "./nft";
import { applyRound, syncAchievements, type RoundRewards } from "./progression";
import { publicRound, type RoundWithSeed } from "./views";

export const playDropSchema = z.object({
  stake: z.number().int("Bets are whole points.").min(MIN_STAKE, `The minimum bet is ${MIN_STAKE}.`).max(MAX_STAKE, `The maximum bet is ${MAX_STAKE.toLocaleString("en")}.`),
  chute: z.number().int().refine((c) => (CHUTES as readonly number[]).includes(c), "Pick one of the chutes."),
  balls: z.number().int().refine((b) => (BALL_COUNTS as readonly number[]).includes(b), "Pick how many tokens to drop.").default(1),
  /** The Squeeks falling, in turn. Looks only. */
  tokenIds: z.array(z.number().int().min(1).max(9999)).max(10).default([]),
  clientSeed: z.string().regex(CLIENT_SEED_PATTERN, "The client seed must be 1 to 64 plain characters."),
  commitHash: z.string().length(64),
  requestKey: z.string().min(8).max(64),
});
export type PlayDropInput = z.input<typeof playDropSchema>;

async function response(round: RoundWithSeed, userId: string, rewards: RoundRewards, now: number) {
  const balance = await db.demoBalance.findUniqueOrThrow({ where: { userId } });
  const commit = await currentCommit(userId);
  return {
    round: publicRound(round), balance: balance.amount, xpGained: rewards.xpGained, unlocked: rewards.unlocked,
    challengesCompleted: rewards.challengesCompleted, commit: { hash: commit.hash, nonce: commit.nonce }, serverNow: now,
  };
}

/**
 * One drop, start to finish, in one transaction: the stake, the physics result, the payout and the
 * reveal commit together or not at all. There's no state where a player can walk away from a bad fall.
 */
export async function playDrop(userId: string, input: PlayDropInput, now = Date.now()) {
  const repeat = await db.gameRound.findUnique({ where: { userId_requestKey: { userId, requestKey: input.requestKey } }, include: { seed: true } });
  if (repeat) return response(repeat, userId, { xpGained: 0, unlocked: [], challengesCompleted: [] }, now);

  await syncAchievements();
  // Checked against the chain first. A Squeek you don't hold isn't swapped for anything: the request is refused.
  const tokenIds = [...new Set(input.tokenIds ?? [])];
  const squeeks = await Promise.all(tokenIds.map((id) => readSqueekForPlay(userId, id)));

  const seed = await currentCommit(userId);
  if (seed.hash !== input.commitHash) {
    throw new GameError("commit_changed", 409, "The fairness commitment moved on. Try again.", { commit: { hash: seed.hash, nonce: seed.nonce } });
  }

  await initPhysics();
  const chute = input.chute as Chute;
  const balls = input.balls ?? 1;
  const trace = simulateDrop(roundDigest(seed.serverSeed, input.clientSeed, seed.nonce, "drops"), chute, balls, { trace: false });
  const mults = trace.slots.map((slot) => slotMult(chute, balls, slot));
  const best = mults.indexOf(Math.max(...mults));
  const stake = input.stake * balls;
  const payout = mults.reduce((sum, m) => sum + payoutFor(input.stake, m), 0);
  const won = payout > stake;
  const at = new Date(now);

  try {
    const { round, rewards } = await db.$transaction(async (tx) => {
      if (!(await spendCommit(tx, { id: seed.id, userId, nonce: seed.nonce }, "REVEALED", at))) {
        throw new GameError("commit_changed", 409, "The fairness commitment moved on. Try again.");
      }
      const created = await tx.gameRound.create({
        data: {
          userId, game: "DROPS", stake, requestKey: input.requestKey, seedId: seed.id, clientSeed: input.clientSeed,
          shareId: randomBytes(9).toString("base64url"), status: won ? "WON" : "LOST", payout, resultMult: mults[best], settledAt: at,
          chute, balls, slots: trace.slots, slot: trace.slots[best], tokenId: squeeks[0]?.tokenId ?? null, tokenIds, tokenLevel: squeeks[0]?.level ?? null, cashedOut: null,
        },
      });
      await debit(tx, userId, stake, "STAKE", created.id);
      if (payout > 0) await credit(tx, userId, payout, "PAYOUT", created.id);
      for (const squeek of squeeks) {
        await tx.playerNft.upsert({
          where: { userId_tokenId: { userId, tokenId: squeek.tokenId } },
          create: { userId, tokenId: squeek.tokenId },
          update: { plays: { increment: 1 } },
        });
      }
      const rewards = await applyRound(tx, {
        userId, roundId: created.id, game: "DROPS", won, cashedOut: false, resultMult: mults[best],
        usedSqueek: squeeks.length > 0, balls, liveRun: false, blocksMined: 0, stake, payout, at,
      });
      const round = await tx.gameRound.findUniqueOrThrow({ where: { id: created.id }, include: { seed: true } });
      return { round, rewards };
    });
    return response(round, userId, rewards, now);
  } catch (error) {
    // A duplicate of this very request lost the race: answer with the round the winner made.
    if (isUniqueViolation(error) || (error instanceof GameError && error.code === "commit_changed")) {
      const raced = await db.gameRound.findUnique({ where: { userId_requestKey: { userId, requestKey: input.requestKey } }, include: { seed: true } });
      if (raced) return response(raced, userId, { xpGained: 0, unlocked: [], challengesCompleted: [] }, now);
      throw new GameError("commit_changed", 409, "The fairness commitment moved on. Try again.");
    }
    throw error;
  }
}
