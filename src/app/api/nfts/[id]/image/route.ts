import { route } from "@/server/http";
import { squeekArt } from "@/server/nft";

/** Untrusted on-chain art. Rendered via <img> or a canvas, and locked down if someone opens it directly. */
export const GET = route("nfts.image", async (_req, ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1 || id > 9999) return new Response("Not found", { status: 404 });
  const svg = await squeekArt(id);
  if (!svg) return new Response("Not found", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
