import { ok, requireUser, route } from "@/server/http";
import { history } from "@/server/players";

export const GET = route("history", async (req) => {
  const q = req.nextUrl.searchParams;
  const g = q.get("game");
  return ok(await history(await requireUser(), {
    game: g === "RUN" || g === "DROPS" ? g : undefined,
    cursor: q.get("cursor") ?? undefined,
    take: Number(q.get("take")) || undefined,
  }));
});
