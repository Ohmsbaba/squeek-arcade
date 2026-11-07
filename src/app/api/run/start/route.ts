import { body, ok, requireUser, route, throttle } from "@/server/http";
import { startRun, startRunSchema } from "@/server/run";

export const POST = route("run.start", async (req) => {
  const userId = await requireUser();
  throttle(`run:${userId}`, 2, 6);
  return ok(await startRun(userId, await body(req, startRunSchema)));
});
