import { adminStats } from "@/server/admin";
import { GameError } from "@/server/errors";
import { ok, route } from "@/server/http";
import { isAdmin } from "@/server/session";

export const GET = route("admin.stats", async () => {
  if (!(await isAdmin())) throw new GameError("not_admin", 401, "Sign in first.");
  return ok(await adminStats());
});
