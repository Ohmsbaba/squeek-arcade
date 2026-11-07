import { ok, requireUser, route } from "@/server/http";
import { claimDaily } from "@/server/players";

export const POST = route("credits.daily", async () => ok(await claimDaily(await requireUser())));
