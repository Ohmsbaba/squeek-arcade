import { randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import {
  ACHIEVEMENTS, challengesForDay, COSMETICS, DAILY_CREDITS, dayKey, fallbackName, GUESTS_PER_IP_PER_HOUR, HAMSTER_AVATARS, levelFromXp,
  REFILL_BELOW, REFILL_COOLDOWN_MS, REFILL_TO, REFILLS_PER_DAY, STARTING_CREDITS, USERNAME_PATTERN,
} from "@/shared/game-rules";
import { db, isUniqueViolation } from "./db";
import { GameError } from "./errors";
import { currentCommit } from "./fairness";
import { credit } from "./ledger";
import { readHolder } from "./nft";
import { syncAchievements } from "./progression";

export async function createPlayer(ipHash?: string, walletAddress?: string) {
  if (ipHash && !walletAddress) {
    const recent = await db.user.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (recent >= (Number(process.env.GUEST_LIMIT_PER_HOUR) || GUESTS_PER_IP_PER_HOUR)) throw new GameError("too_many_players", 429, "Too many new players from here in the last hour. Try again later.");
  }
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        ipHash,
        profile: { create: { shareId: randomBytes(9).toString("base64url") } },
        balance: { create: { amount: 0, lastDailyDay: dayKey() } },
        ...(walletAddress ? { wallet: { create: { address: walletAddress } } } : {}),
      },
    });
    await credit(tx, user.id, STARTING_CREDITS, "GRANT", undefined, "Welcome points");
    return user;
  });
}

function creditStatus(balance: { amount: bigint; lastDailyDay: string | null; refillDay: string | null; refillCount: number; lastRefillAt: Date | null }, now: number) {
  const today = dayKey(now);
  const usedToday = balance.refillDay === today ? balance.refillCount : 0;
  const cooldownEnds = balance.lastRefillAt ? balance.lastRefillAt.getTime() + REFILL_COOLDOWN_MS : 0;
  return {
    dailyAvailable: balance.lastDailyDay !== today,
    dailyAmount: DAILY_CREDITS,
    refill: {
      available: balance.amount < BigInt(REFILL_BELOW) && usedToday < REFILLS_PER_DAY && cooldownEnds <= now,
      below: REFILL_BELOW,
      to: REFILL_TO,
      left: REFILLS_PER_DAY - usedToday,
      readyAt: cooldownEnds > now ? new Date(cooldownEnds).toISOString() : null,
    },
  };
}

/** Everything the arcade needs about the signed-in player. */
export async function playerState(userId: string, now = Date.now()) {
  await syncAchievements();
  await db.user.update({ where: { id: userId }, data: { lastSeenAt: new Date(now) } });
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { profile: true, balance: true, wallet: true, achievements: { orderBy: { earnedAt: "desc" } } },
  });
  if (!user?.profile || !user.balance) throw new GameError("no_session", 401, "That player no longer exists.");
  const commit = await currentCommit(userId);
  const day = dayKey(now);
  const progress = await db.dailyChallengeProgress.findMany({ where: { userId, day } });
  const p = user.profile;
  return {
    id: user.id,
    name: p.username ?? fallbackName(p.shareId),
    username: p.username,
    shareId: p.shareId,
    wallet: user.wallet?.address ?? null,
    avatar: p.avatar,
    cosmetic: p.cosmetic,
    xp: p.xp,
    progress: levelFromXp(p.xp),
    stats: {
      gamesPlayed: p.gamesPlayed, wins: p.wins, losses: p.losses, runsPlayed: p.runsPlayed, dropsPlayed: p.dropsPlayed,
      cashouts: p.cashouts, blocksCaught: p.blocksCaught, bestRunMult: p.bestRunMult, bestDropMult: p.bestDropMult, bestPayout: p.bestPayout, activeDays: p.activeDays,
    },
    balance: user.balance.amount,
    credits: creditStatus(user.balance, now),
    commit: { hash: commit.hash, nonce: commit.nonce },
    achievements: user.achievements.map((a) => ({ key: a.achievementKey, earnedAt: a.earnedAt.toISOString() })),
    challenges: challengesForDay(day).map((c) => {
      const row = progress.find((x) => x.key === c.key);
      return { key: c.key, title: c.title, goal: c.goal, xp: c.xp, progress: Math.min(c.goal, row?.progress ?? 0), done: Boolean(row?.completedAt) };
    }),
    serverNow: now,
  };
}

export async function claimDaily(userId: string, now = Date.now()) {
  const today = dayKey(now);
  return db.$transaction(async (tx) => {
    // A conditional update is the gate: two taps in the same instant still pay once.
    const claimed = await tx.demoBalance.updateMany({
      where: { userId, OR: [{ lastDailyDay: null }, { lastDailyDay: { not: today } }] },
      data: { lastDailyDay: today },
    });
    if (claimed.count === 0) throw new GameError("daily_claimed", 409, "Today's points are already claimed. Back tomorrow at 00:00 UTC.");
    const balance = await credit(tx, userId, DAILY_CREDITS, "DAILY", undefined, `Daily allowance ${today}`);
    return { balance, granted: DAILY_CREDITS };
  });
}

/** Only for a player who's run out, a few times a day, with a cooldown. */
export async function claimRefill(userId: string, now = Date.now()) {
  const today = dayKey(now);
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ amount: bigint; refillDay: string | null; refillCount: number; lastRefillAt: Date | null }[]>`
      SELECT amount, "refillDay", "refillCount", "lastRefillAt" FROM demo_balances WHERE "userId" = ${userId} FOR UPDATE`;
    const b = rows[0];
    if (!b) throw new GameError("no_session", 401, "That player no longer exists.");
    if (b.amount >= BigInt(REFILL_BELOW)) throw new GameError("refill_not_needed", 409, `Refills are for balances under ${REFILL_BELOW} points.`);
    const used = b.refillDay === today ? b.refillCount : 0;
    if (used >= REFILLS_PER_DAY) throw new GameError("refill_limit", 429, "That's today's refills. The daily allowance resets at 00:00 UTC.");
    if (b.lastRefillAt && b.lastRefillAt.getTime() + REFILL_COOLDOWN_MS > now) throw new GameError("refill_cooldown", 429, "The refill tank is still filling. Try again in a few minutes.");
    const grant = REFILL_TO - Number(b.amount);
    await tx.demoBalance.update({ where: { userId }, data: { refillDay: today, refillCount: used + 1, lastRefillAt: new Date(now) } });
    const balance = await credit(tx, userId, grant, "REFILL", undefined, `Refill ${used + 1} of ${REFILLS_PER_DAY}`);
    return { balance, granted: grant };
  });
}

export const profileSchema = z.object({
  username: z.string().regex(USERNAME_PATTERN, "Names are 3 to 18 letters, numbers, - or _.").optional(),
  avatar: z.string().max(40).optional(),
  cosmetic: z.string().max(20).optional(),
});

const RESERVED = /^(admin|squeektoshi|squeekchain|official|moderator|support)/i;

export async function updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
  const profile = await db.playerProfile.findUniqueOrThrow({ where: { userId } });
  const data: Record<string, string> = {};
  if (input.username !== undefined) {
    if (RESERVED.test(input.username)) throw new GameError("name_reserved", 400, "That name is reserved.");
    data.username = input.username;
    data.usernameKey = input.username.toLowerCase();
  }
  if (input.cosmetic !== undefined) {
    const def = COSMETICS.find((c) => c.key === input.cosmetic);
    if (!def) throw new GameError("bad_cosmetic", 400, "That trail doesn't exist.");
    const { level } = levelFromXp(profile.xp);
    if (level < def.level) throw new GameError("cosmetic_locked", 403, `${def.name} unlocks at arcade level ${def.level}.`);
    data.cosmetic = def.key;
  }
  if (input.avatar !== undefined) {
    const [kind, value] = input.avatar.split(":");
    if (kind === "hamster" && HAMSTER_AVATARS.some((h) => h.key === value)) {
      data.avatar = input.avatar;
    } else if (kind === "squeek" && /^\d{1,4}$/.test(value ?? "")) {
      const wallet = await db.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new GameError("wallet_required", 403, "Connect the wallet that holds this Squeek first.");
      const { readSqueekForPlay } = await import("./nft");
      await readSqueekForPlay(userId, Number(value));
      data.avatar = input.avatar;
    } else {
      throw new GameError("bad_avatar", 400, "That avatar doesn't exist.");
    }
  }
  try {
    await db.playerProfile.update({ where: { userId }, data });
  } catch (error) {
    if (isUniqueViolation(error)) throw new GameError("name_taken", 409, "That name is taken.");
    throw error;
  }
}

export async function history(userId: string, opts: { game?: "RUN" | "DROPS"; cursor?: string; take?: number }) {
  const take = Math.min(opts.take ?? 20, 50);
  const rows = await db.gameRound.findMany({
    where: { userId, status: { not: "ACTIVE" }, ...(opts.game ? { game: opts.game } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { seed: true },
  });
  const { publicRound } = await import("./views");
  const page = rows.slice(0, take);
  return { rounds: page.map(publicRound), nextCursor: rows.length > take ? page[page.length - 1].id : null };
}

export async function transactions(userId: string) {
  const rows = await db.demoTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 40 });
  return rows.map((t) => ({ id: t.id, type: t.type, amount: t.amount, balanceAfter: t.balanceAfter, note: t.note, roundId: t.roundId, createdAt: t.createdAt.toISOString() }));
}

/** A player's public page. No balance, no seeds, no IP. */
export async function publicProfile(shareId: string) {
  const p = await db.playerProfile.findUnique({
    where: { shareId },
    include: { user: { include: { wallet: true, achievements: { orderBy: { earnedAt: "desc" } } } } },
  });
  if (!p) return null;
  const earned = p.user.achievements.map((a) => ({ ...ACHIEVEMENTS.find((d) => d.key === a.achievementKey)!, earnedAt: a.earnedAt.toISOString() })).filter((a) => a.key);
  return {
    shareId: p.shareId, name: p.username ?? fallbackName(p.shareId), avatar: p.avatar, xp: p.xp, progress: levelFromXp(p.xp),
    wallet: p.user.wallet?.address ?? null,
    stats: { gamesPlayed: p.gamesPlayed, wins: p.wins, losses: p.losses, bestRunMult: p.bestRunMult, bestDropMult: p.bestDropMult, activeDays: p.activeDays },
    achievements: earned,
    since: p.createdAt.toISOString(),
  };
}

/** A shared round. Public by design: it only ever finds settled rounds. */
export async function sharedRound(shareId: string) {
  const r = await db.gameRound.findUnique({ where: { shareId }, include: { seed: true, user: { include: { profile: true } } } });
  if (!r || r.status === "ACTIVE") return null;
  const { publicRound } = await import("./views");
  const profile = r.user.profile!;
  return { round: publicRound(r), player: { name: profile.username ?? fallbackName(profile.shareId), shareId: profile.shareId } };
}

export function normalizeAddress(address: string) {
  if (!isAddress(address, { strict: false })) throw new GameError("invalid_address", 400, "That isn't a wallet address.");
  return getAddress(address);
}

export { readHolder };
