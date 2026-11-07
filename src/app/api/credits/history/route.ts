import { ok, requireUser, route } from "@/server/http";
import { transactions } from "@/server/players";

export const GET = route("credits.history", async () => ok({ transactions: await transactions(await requireUser()) }));
