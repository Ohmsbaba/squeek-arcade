import type { TxType } from "@prisma/client";
import type { Tx } from "./db";
import { GameError } from "./errors";

/** Takes credits only if they're there. The update and its condition are one statement, so races can't overdraw. */
export async function debit(tx: Tx, userId: string, amount: number, type: TxType, roundId?: string, note?: string) {
  const rows = await tx.$queryRaw<{ amount: bigint }[]>`
    UPDATE demo_balances SET amount = amount - ${BigInt(amount)}, "updatedAt" = now()
    WHERE "userId" = ${userId} AND amount >= ${BigInt(amount)} RETURNING amount`;
  if (rows.length === 0) throw new GameError("insufficient_credits", 409, "Not enough points for that bet.");
  const after = rows[0].amount;
  await tx.demoTransaction.create({ data: { userId, type, amount: -BigInt(amount), balanceAfter: after, roundId, note } });
  return after;
}

export async function credit(tx: Tx, userId: string, amount: number, type: TxType, roundId?: string, note?: string) {
  const rows = await tx.$queryRaw<{ amount: bigint }[]>`
    UPDATE demo_balances SET amount = amount + ${BigInt(amount)}, "updatedAt" = now()
    WHERE "userId" = ${userId} RETURNING amount`;
  const after = rows[0].amount;
  await tx.demoTransaction.create({ data: { userId, type, amount: BigInt(amount), balanceAfter: after, roundId, note } });
  return after;
}
