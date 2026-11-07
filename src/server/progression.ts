import {
  ACHIEVEMENTS, challengesForDay, dayKey, PLAY_XP_DAILY_CAP, XP_PER_GAME, XP_WIN_BONUS, type AchievementDef, type RoundFacts,
} from "@/shared/game-rules";
import { db, type Tx } from "./db";

let synced: Promise<unknown> | null = null;
/** Keeps the Achievement table in step with the definitions in code. */
export const syncAchievements = () =>
  (synced ??= (async () => {
    await Promise.all(
      ACHIEVEMENTS.map((a, sort) =>
        db.achievement.upsert({
          where: { key: a.key },
          create: { key: a.key, name: a.name, description: a.description, xp: a.xp, sort },
          update: { name: a.name, description: a.description, xp: a.xp, sort },
        }),
      ),
    );
  })().catch((e) => {
    synced = null;
    throw e;
  }));

export type RoundRewards = {
  xpGained: number;
  unlocked: AchievementDef[];
  challengesCompleted: { key: string; title: string; xp: number }[];
};

type RoundInput = RoundFacts & { userId: string; roundId: string; stake: number; payout: number; at: Date };

/** Runs inside the settlement transaction: stats, XP and unlocks commit with the result or not at all. */
export async function applyRound(tx: Tx, r: RoundInput): Promise<RoundRewards> {
  const day = dayKey(r.at);
  const isRun = r.game === "RUN";

  // This update also holds the player's row lock until the transaction ends, so the reads below are stable.
  let profile = await tx.playerProfile.update({
    where: { userId: r.userId },
    data: {
      gamesPlayed: { increment: 1 },
      wins: { increment: r.won ? 1 : 0 },
      losses: { increment: r.won ? 0 : 1 },
      runsPlayed: { increment: isRun ? 1 : 0 },
      dropsPlayed: { increment: isRun ? 0 : 1 },
      cashouts: { increment: r.cashedOut ? 1 : 0 },
      blocksCaught: { increment: r.cashedOut ? r.blocksMined : 0 },
    },
  });

  const bests: Record<string, unknown> = {};
  if (isRun && r.cashedOut && r.resultMult > profile.bestRunMult) bests.bestRunMult = r.resultMult;
  if (!isRun && r.resultMult > profile.bestDropMult) bests.bestDropMult = r.resultMult;
  if (BigInt(r.payout) > profile.bestPayout) bests.bestPayout = BigInt(r.payout);
  if (profile.lastPlayedDay !== day) {
    bests.lastPlayedDay = day;
    bests.activeDays = profile.activeDays + 1;
  }

  // XP from the play itself, up to the day's ceiling.
  const usedToday = profile.playXpDay === day ? profile.playXpToday : 0;
  const playXp = Math.max(0, Math.min(XP_PER_GAME + (r.won ? XP_WIN_BONUS : 0), PLAY_XP_DAILY_CAP - usedToday));
  bests.playXpDay = day;
  bests.playXpToday = usedToday + playXp;
  profile = await tx.playerProfile.update({ where: { userId: r.userId }, data: bests });

  let xpGained = playXp;
  if (playXp > 0) await tx.xpTransaction.create({ data: { userId: r.userId, source: "GAME", amount: playXp, ref: r.roundId } });

  // Daily challenges.
  const challengesCompleted: RoundRewards["challengesCompleted"] = [];
  for (const def of challengesForDay(day)) {
    if (!def.counts(r)) continue;
    const row = await tx.dailyChallengeProgress.upsert({
      where: { userId_day_key: { userId: r.userId, day, key: def.key } },
      create: { userId: r.userId, day, key: def.key, progress: 1 },
      update: { progress: { increment: 1 } },
    });
    if (!row.completedAt && row.progress >= def.goal) {
      await tx.dailyChallengeProgress.update({ where: { userId_day_key: { userId: r.userId, day, key: def.key } }, data: { completedAt: r.at } });
      await tx.xpTransaction.create({ data: { userId: r.userId, source: "CHALLENGE", amount: def.xp, ref: `${day}:${def.key}` } });
      xpGained += def.xp;
      challengesCompleted.push({ key: def.key, title: def.title, xp: def.xp });
    }
  }

  // Squeek Collector counts only tokens that passed the ownership check on their way into this round.
  const distinctSqueeks = r.usedSqueek ? await tx.playerNft.count({ where: { userId: r.userId } }) : 0;

  const earned = new Set<string>();
  if (profile.dropsPlayed >= 1) earned.add("first_drop");
  if (profile.runsPlayed >= 1) earned.add("first_run");
  if (profile.cashouts >= 1) earned.add("first_cashout");
  if (profile.gamesPlayed >= 10) earned.add("games_10");
  if (profile.gamesPlayed >= 100) earned.add("games_100");
  if (isRun && r.cashedOut && r.resultMult >= 500) earned.add("wheel_survivor");
  if (isRun && r.cashedOut && r.resultMult >= 2500) earned.add("high_multiplier");
  if (!isRun && r.resultMult >= 1000) earned.add("long_shot");
  if (r.usedSqueek) earned.add("own_squeek");
  if (isRun && r.liveRun) earned.add("live_runner");
  if (isRun && r.cashedOut && r.blocksMined > 0) earned.add("block_catcher");
  if (!isRun && r.balls >= 10) earned.add("multi_ball");
  if (distinctSqueeks >= 3) earned.add("squeek_collector");
  if (profile.activeDays >= 5) earned.add("arcade_regular");

  const unlocked: AchievementDef[] = [];
  if (earned.size > 0) {
    const have = await tx.playerAchievement.findMany({ where: { userId: r.userId, achievementKey: { in: [...earned] } }, select: { achievementKey: true } });
    const haveKeys = new Set(have.map((h) => h.achievementKey));
    for (const def of ACHIEVEMENTS) {
      if (!earned.has(def.key) || haveKeys.has(def.key)) continue;
      await tx.playerAchievement.create({ data: { userId: r.userId, achievementKey: def.key, earnedAt: r.at, roundId: r.roundId } });
      await tx.xpTransaction.create({ data: { userId: r.userId, source: "ACHIEVEMENT", amount: def.xp, ref: def.key } });
      xpGained += def.xp;
      unlocked.push(def);
    }
  }

  if (xpGained > 0) await tx.playerProfile.update({ where: { userId: r.userId }, data: { xp: { increment: xpGained } } });
  await tx.gameRound.update({ where: { id: r.roundId }, data: { xpAwarded: xpGained } });
  return { xpGained, unlocked, challengesCompleted };
}
