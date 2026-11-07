import { randomBytes } from "node:crypto";
import { hashServerSeed } from "@/shared/fairness";
import { db, isUniqueViolation, type Tx } from "./db";

export function newSeedData(userId: string, nonce: number) {
  const serverSeed = randomBytes(32).toString("hex");
  return { userId, serverSeed, hash: hashServerSeed(serverSeed), nonce };
}

/** The seed the player's next round will use. Only its hash ever leaves the server before it's spent. */
export async function currentCommit(userId: string): Promise<{ id: string; hash: string; nonce: number; serverSeed: string }> {
  const existing = await db.fairnessSeed.findFirst({ where: { userId, status: "COMMITTED" } });
  if (existing) return existing;
  const last = await db.fairnessSeed.findFirst({ where: { userId }, orderBy: { nonce: "desc" }, select: { nonce: true } });
  try {
    return await db.fairnessSeed.create({ data: newSeedData(userId, (last?.nonce ?? -1) + 1) });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return db.fairnessSeed.findFirstOrThrow({ where: { userId, status: "COMMITTED" } });
  }
}

/** Spends a commitment and lines up the next one in the same transaction. Returns false if it was already spent. */
export async function spendCommit(tx: Tx, seed: { id: string; userId: string; nonce: number }, status: "IN_PLAY" | "REVEALED", now: Date) {
  const claimed = await tx.fairnessSeed.updateMany({
    where: { id: seed.id, status: "COMMITTED" },
    data: { status, revealedAt: status === "REVEALED" ? now : null },
  });
  if (claimed.count === 0) return false;
  await tx.fairnessSeed.create({ data: newSeedData(seed.userId, seed.nonce + 1) });
  return true;
}
