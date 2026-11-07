import { ok, requireUser, route } from "@/server/http";
import { claimRefill } from "@/server/players";

export const POST = route("credits.refill", async () => ok(await claimRefill(await requireUser())));
