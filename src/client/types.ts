export type PublicRound = {
  id: string;
  shareId: string;
  game: "RUN" | "DROPS";
  status: "ACTIVE" | "WON" | "LOST";
  stake: number;
  payout: number | null;
  net: number | null;
  resultMult: number | null;
  createdAt: string;
  settledAt: string | null;
  liftoffAt: string | null;
  autoCashout: number | null;
  cashedOut: boolean | null;
  chute: number | null;
  balls: number;
  slot: number | null;
  slots: number[];
  tokenId: number | null;
  tokenIds: number[];
  tokenLevel: number | null;
  live: { rpm: number | null; boostBp: number; startBlock: number | null; blocksMined: number };
  xpAwarded: number;
  fairness: { hash: string; nonce: number; clientSeed: string; beacon: string | null; serverSeed: string | null };
  crashMult: number | null;
};

export type Unlock = { key: string; name: string; description: string; xp: number; icon: string };
export type ChallengeDone = { key: string; title: string; xp: number };
export type Commit = { hash: string; nonce: number };

export type Settled = {
  round: PublicRound;
  balance: number;
  xpGained: number;
  unlocked: Unlock[];
  challengesCompleted: ChallengeDone[];
  commit: Commit;
  serverNow: number;
};

export type Me = {
  id: string;
  name: string;
  username: string | null;
  shareId: string;
  wallet: string | null;
  avatar: string;
  cosmetic: string;
  xp: number;
  progress: { level: number; intoLevel: number; levelSpan: number; nextAt: number };
  stats: {
    gamesPlayed: number; wins: number; losses: number; runsPlayed: number; dropsPlayed: number;
    cashouts: number; blocksCaught: number; bestRunMult: number; bestDropMult: number; bestPayout: number; activeDays: number;
  };
  balance: number;
  credits: {
    dailyAvailable: boolean; dailyAmount: number;
    refill: { available: boolean; below: number; to: number; left: number; readyAt: string | null };
  };
  commit: Commit;
  achievements: { key: string; earnedAt: string }[];
  challenges: { key: string; title: string; goal: number; xp: number; progress: number; done: boolean }[];
  serverNow: number;
};

export type OwnedSqueek = { tokenId: number; name: string; level: number; custody: string; attributes: { traitType: string; value: unknown }[]; imageUrl: string };
