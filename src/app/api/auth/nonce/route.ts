import { issueNonce } from "@/server/auth";
import { ok, route, throttle } from "@/server/http";
import { clientIpHash } from "@/server/session";

export const POST = route("auth.nonce", async () => {
  throttle(`nonce:${(await clientIpHash()) ?? "local"}`, 1, 10);
  return ok({ nonce: await issueNonce() });
});
