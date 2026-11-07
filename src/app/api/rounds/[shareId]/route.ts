import { GameError } from "@/server/errors";
import { ok, route } from "@/server/http";
import { sharedRound } from "@/server/players";

export const GET = route("rounds.shared", async (_req, ctx) => {
  const found = await sharedRound((await ctx.params).shareId);
  if (!found) throw new GameError("round_not_found", 404, "That round doesn't exist, or hasn't finished yet.");
  return ok(found);
});
