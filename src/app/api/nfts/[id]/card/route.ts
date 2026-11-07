import { GameError } from "@/server/errors";
import { ok, route } from "@/server/http";
import { squeekCard } from "@/server/nft";

export const GET = route("nfts.card", async (_req, ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1 || id > 9999) throw new GameError("token_not_found", 404, "No such Squeek.");
  const card = await squeekCard(id);
  if (!card) throw new GameError("token_not_found", 404, "That Squeek can't be read right now.");
  return ok(card);
});
