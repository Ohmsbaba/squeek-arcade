import { ok, requireUser, route } from "@/server/http";
import { readRun } from "@/server/run";

export const GET = route("run.read", async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await readRun(await requireUser(), id));
});
