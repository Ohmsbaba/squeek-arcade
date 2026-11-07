import { ok, route } from "@/server/http";
import { BOARDS, leaderboard, type Board } from "@/server/leaderboards";
import { sessionUserId } from "@/server/session";

export const GET = route("leaderboards", async (req) => {
  const q = req.nextUrl.searchParams;
  const board = BOARDS.includes(q.get("board") as Board) ? (q.get("board") as Board) : "run";
  const window = q.get("window") === "all" ? "all" : "week";
  return ok(await leaderboard(board, window, await sessionUserId()));
});
