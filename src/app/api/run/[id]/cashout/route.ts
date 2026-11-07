import { ok, requireUser, route } from "@/server/http";
import { cashOut } from "@/server/run";

// No body is read. The multiplier comes from the server's clock, so there's nothing to tamper with.
export const POST = route("run.cashout", async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await cashOut(await requireUser(), id));
});
