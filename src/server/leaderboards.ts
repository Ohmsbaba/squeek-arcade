import { fallbackName, levelFromXp } from "@/shared/game-rules";
import { db } from "./db";

export const BOARDS = ["run", "drops", "games", "xp"] as const;
export type Board = (typeof BOARDS)[number];
export type Window = "all" | "week";

export type Entry = { rank: number; shareId: string; name: string; wallet: string | null; value: number; level: number; isMe: boolean };

/** Monday 00:00 UTC of the current week. */
export function weekStart(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

const cache = new Map<string, { at: number; rows: Omit<Entry, "rank" | "isMe">[] }>();

type Row = { userId: string; value: bigint | number };

async function top(board: Board, window: Window, limit: number): Promise<Row[]> {
  if (window === "all") {
    const column = { run: "bestRunMult", drops: "bestDropMult", games: "gamesPlayed", xp: "xp" }[board] as "bestRunMult" | "bestDropMult" | "gamesPlayed" | "xp";
    const rows = await db.playerProfile.findMany({
      where: { [column]: { gt: 0 } },
      orderBy: [{ [column]: "desc" }, { createdAt: "asc" }],
      take: limit,
      select: { userId: true, bestRunMult: true, bestDropMult: true, gamesPlayed: true, xp: true },
    });
    return rows.map((r) => ({ userId: r.userId, value: r[column] }));
  }
  const since = weekStart();
  if (board === "xp") {
    const rows = await db.xpTransaction.groupBy({ by: ["userId"], where: { createdAt: { gte: since } }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: limit });
    return rows.map((r) => ({ userId: r.userId, value: r._sum.amount ?? 0 }));
  }
  if (board === "games") {
    const rows = await db.gameRound.groupBy({ by: ["userId"], where: { settledAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: limit });
    return rows.map((r) => ({ userId: r.userId, value: r._count._all }));
  }
  const rows = await db.gameRound.groupBy({
    by: ["userId"],
    where: { game: board === "run" ? "RUN" : "DROPS", settledAt: { gte: since }, ...(board === "run" ? { cashedOut: true } : {}) },
    _max: { resultMult: true },
    orderBy: { _max: { resultMult: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({ userId: r.userId, value: r._max.resultMult ?? 0 }));
}

/** Real recorded activity only. An empty board stays empty. */
export async function leaderboard(board: Board, window: Window, meId: string | null, limit = 25) {
  const key = `${board}:${window}:${limit}`;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > 10_000) {
    const rows = await top(board, window, limit);
    const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, include: { profile: true, wallet: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    hit = {
      at: Date.now(),
      rows: rows.filter((r) => Number(r.value) > 0 && byId.get(r.userId)?.profile).map((r) => {
        const u = byId.get(r.userId)!;
        return {
          shareId: u.profile!.shareId, name: u.profile!.username ?? fallbackName(u.profile!.shareId), wallet: u.wallet?.address ?? null,
          value: Number(r.value), level: levelFromXp(u.profile!.xp).level,
        };
      }),
    };
    cache.set(key, hit);
  }
  const myShare = meId ? (await db.playerProfile.findUnique({ where: { userId: meId }, select: { shareId: true } }))?.shareId : null;
  return { board, window, entries: hit.rows.map((r, i): Entry => ({ ...r, rank: i + 1, isMe: r.shareId === myShare })) };
}

export function clearLeaderboardCache() {
  cache.clear();
}
