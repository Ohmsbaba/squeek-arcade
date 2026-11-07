import { randomBytes } from "node:crypto";
import { createPublicClient, http, verifyMessage } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";
import { signInMessage } from "@/shared/auth-message";
import { db } from "./db";
import { GameError } from "./errors";
import { createPlayer, normalizeAddress } from "./players";

const NONCE_TTL_MS = 5 * 60_000;

export const verifySchema = z.object({ address: z.string(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/), nonce: z.string().min(16).max(64) });

export async function issueNonce() {
  await db.authNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const nonce = randomBytes(16).toString("hex");
  await db.authNonce.create({ data: { nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS) } });
  return nonce;
}

/**
 * Proves control of a wallet, then: a known wallet returns to its player; a new wallet joins the
 * current guest, keeping what they've earned; a player with a different wallet starts fresh.
 */
export async function verifyWallet(input: z.infer<typeof verifySchema>, currentUserId: string | null, host: string) {
  const address = normalizeAddress(input.address);
  // Delete-to-claim: a nonce works exactly once.
  const claimed = await db.authNonce.deleteMany({ where: { nonce: input.nonce, expiresAt: { gte: new Date() } } });
  if (claimed.count === 0) throw new GameError("bad_nonce", 400, "That sign-in request expired. Try again.");
  const message = signInMessage(address, input.nonce, host);
  const signature = input.signature as `0x${string}`;
  // Ordinary wallets verify offline. Only a signature that doesn't recover goes to the chain, for smart-contract wallets.
  let valid = await verifyMessage({ address, message, signature }).catch(() => false);
  if (!valid) {
    const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URLS?.split(",")[0]?.trim() || "https://sepolia.gateway.tenderly.co") });
    valid = await client.verifyMessage({ address, message, signature }).catch(() => false);
  }
  if (!valid) throw new GameError("bad_signature", 401, "That signature doesn't match the wallet.");

  const existing = await db.wallet.findUnique({ where: { address } });
  if (existing) return existing.userId;
  if (currentUserId) {
    const current = await db.user.findUnique({ where: { id: currentUserId }, include: { wallet: true } });
    if (current && !current.wallet) {
      await db.wallet.create({ data: { address, userId: current.id } });
      return current.id;
    }
  }
  return (await createPlayer(undefined, address)).id;
}
