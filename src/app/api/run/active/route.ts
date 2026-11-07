import { ok, requireUser, route } from "@/server/http";
import { activeRun } from "@/server/run";

export const GET = route("run.active", async () => ok(await activeRun(await requireUser())));
