import { verifySchema, verifyWallet } from "@/server/auth";
import { body, ok, route } from "@/server/http";
import { playerState } from "@/server/players";
import { sessionUserId, setSession } from "@/server/session";

export const POST = route("auth.verify", async (req) => {
  const input = await body(req, verifySchema);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const userId = await verifyWallet(input, await sessionUserId(), host);
  await setSession(userId);
  return ok(await playerState(userId));
});
