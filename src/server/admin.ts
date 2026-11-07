import { db } from "./db";

/** Aggregates only. No seeds, no IP hashes, no secrets. */
export async function adminStats(now = Date.now()) {
  const dayAgo = new Date(now - 86_400_000);
  const weekAgo = new Date(now - 7 * 86_400_000);
  const [players, wallets, active24h, active7d] = await Promise.all([
    db.user.count(),
    db.wallet.count(),
    db.user.count({ where: { lastSeenAt: { gte: dayAgo } } }),
    db.user.count({ where: { lastSeenAt: { gte: weekAgo } } }),
  ]);
  const games = await db.gameRound.groupBy({
    by: ["game"],
    where: { status: { not: "ACTIVE" } },
    _count: { _all: true },
    _sum: { stake: true, payout: true },
    _avg: { stake: true },
  });
  const gamesToday = await db.gameRound.groupBy({ by: ["game"], where: { settledAt: { gte: dayAgo } }, _count: { _all: true } });
  const inFlight = await db.gameRound.count({ where: { status: "ACTIVE" } });
  const credits = await db.demoTransaction.groupBy({ by: ["type"], _sum: { amount: true }, _count: { _all: true } });
  const achievements = await db.achievement.findMany({ orderBy: { sort: "asc" }, include: { _count: { select: { players: true } } } });
  const errors = await db.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const errors24h = await db.errorLog.count({ where: { createdAt: { gte: dayAgo } } });
  const perGame = (game: "RUN" | "DROPS") => {
    const g = games.find((x) => x.game === game);
    const played = g?._count._all ?? 0;
    const staked = g?._sum.stake ?? 0;
    const paid = g?._sum.payout ?? 0;
    return {
      played, today: gamesToday.find((x) => x.game === game)?._count._all ?? 0, staked, paid,
      avgStake: g?._avg.stake ?? 0, actualReturn: staked > 0 ? paid / staked : null,
    };
  };
  const issued = (type: "GRANT" | "DAILY" | "REFILL") => Number(credits.find((c) => c.type === type)?._sum.amount ?? 0);
  return {
    players, wallets, active24h, active7d, inFlight,
    run: perGame("RUN"),
    drops: perGame("DROPS"),
    credits: { welcome: issued("GRANT"), daily: issued("DAILY"), refill: issued("REFILL") },
    achievements: achievements.map((a) => ({ key: a.key, name: a.name, players: a._count.players })).sort((a, b) => b.players - a.players),
    errors24h,
    errors: errors.map((e) => ({ id: e.id, scope: e.scope, message: e.message, at: e.createdAt.toISOString() })),
  };
}
