import { body, ok, route } from "@/server/http";
import { createPlayer, playerState, profileSchema, updateProfile } from "@/server/players";
import { db } from "@/server/db";
import { clientIpHash, sessionUserId, setSession } from "@/server/session";

/** Creates a guest on first visit, so nobody needs a wallet to play. */
export const GET = route("me", async () => {
  let id = await sessionUserId();
  if (id && !(await db.user.findUnique({ where: { id }, select: { id: true } }))) id = null;
  if (!id) {
    const user = await createPlayer(await clientIpHash());
    await setSession(user.id);
    id = user.id;
  }
  return ok(await playerState(id));
});

export const POST = route("me.update", async (req) => {
  const id = await sessionUserId();
  if (!id) return ok({ error: "no_session" }, { status: 401 });
  await updateProfile(id, await body(req, profileSchema));
  return ok(await playerState(id));
});
