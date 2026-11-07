import { playDrop, playDropSchema } from "@/server/drops";
import { body, ok, requireUser, route, throttle } from "@/server/http";

export const POST = route("drops.play", async (req) => {
  const userId = await requireUser();
  throttle(`drop:${userId}`, 4, 10);
  return ok(await playDrop(userId, await body(req, playDropSchema)));
});
