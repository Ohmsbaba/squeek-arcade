import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { createPlayer, playerState } from "@/server/players";
import { clearLeaderboardCache } from "@/server/leaderboards";

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE users, wallets, auth_nonces, player_profiles, demo_balances, demo_transactions, fairness_seeds, game_rounds, nfts, player_nfts, player_achievements, xp_transactions, daily_challenge_progress, error_logs CASCADE`);
  clearLeaderboardCache();
}

export async function newPlayer() {
  const user = await createPlayer();
  const state = await playerState(user.id);
  return { id: user.id, commit: state.commit.hash };
}

export const key = () => randomBytes(8).toString("hex");

export async function balanceOf(userId: string) {
  return Number((await db.demoBalance.findUniqueOrThrow({ where: { userId } })).amount);
}

/** The ledger must always add up to the balance. */
export async function ledgerSum(userId: string) {
  const r = await db.demoTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
  return Number(r._sum.amount ?? 0);
}
