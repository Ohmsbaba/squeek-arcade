import type { FairnessSeed, GameRound } from "@prisma/client";

export type RoundWithSeed = GameRound & { seed: FairnessSeed };

/**
 * The only shape a round leaves the server in. The server seed and the stop point stay hidden
 * until the seed is revealed at settlement. Tests pin this.
 */
export function publicRound(r: RoundWithSeed) {
  const revealed = r.seed.status === "REVEALED";
  return {
    id: r.id,
    shareId: r.shareId,
    game: r.game,
    status: r.status,
    stake: r.stake,
    payout: r.payout,
    net: r.payout === null ? null : r.payout - r.stake,
    resultMult: r.resultMult,
    createdAt: r.createdAt.toISOString(),
    settledAt: r.settledAt?.toISOString() ?? null,
    liftoffAt: r.liftoffAt?.toISOString() ?? null,
    autoCashout: r.autoCashout,
    cashedOut: r.cashedOut,
    chute: r.chute,
    balls: r.balls,
    slot: r.slot,
    slots: r.slots,
    tokenId: r.tokenId,
    tokenIds: r.tokenIds,
    tokenLevel: r.tokenLevel,
    live: { rpm: r.liveRpm, boostBp: r.boostBp, startBlock: r.startBlock, blocksMined: r.blocksMined },
    xpAwarded: r.xpAwarded,
    fairness: {
      hash: r.seed.hash,
      nonce: r.seed.nonce,
      clientSeed: r.clientSeed,
      beacon: r.beacon,
      serverSeed: revealed ? r.seed.serverSeed : null,
    },
    crashMult: revealed ? r.crashMult : null,
  };
}
export type PublicRound = ReturnType<typeof publicRound>;
