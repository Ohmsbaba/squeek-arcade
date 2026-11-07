import { db } from "@/server/db";
import { ok, requireUser, route } from "@/server/http";
import { listOwned } from "@/server/nft";

export const GET = route("nfts", async () => {
  const userId = await requireUser();
  const wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet) return ok({ status: "no_wallet", tokens: [] });
  return ok(await listOwned(wallet.address));
});
