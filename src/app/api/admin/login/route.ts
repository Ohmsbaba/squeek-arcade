import { z } from "zod";
import { GameError } from "@/server/errors";
import { body, ok, route, throttle } from "@/server/http";
import { checkAdminPassword, clearAdmin, clientIpHash, setAdmin } from "@/server/session";

export const POST = route("admin.login", async (req) => {
  throttle(`admin:${(await clientIpHash()) ?? "local"}`, 0.1, 5);
  const { password } = await body(req, z.object({ password: z.string().max(200) }));
  if (!checkAdminPassword(password)) throw new GameError("bad_password", 401, "That's not it.");
  await setAdmin();
  return ok({ ok: true });
});

export const DELETE = route("admin.logout", async () => {
  await clearAdmin();
  return ok({ ok: true });
});
