import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { readLiveWheel } from "@/server/squeekchain";

export const dynamic = "force-dynamic";

/** Public, and shared for a moment at the CDN so a crowd of players doesn't mean a crowd of API calls. */
export const GET = route("squeekchain.live", async () =>
  NextResponse.json(await readLiveWheel(), { headers: { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=4" } }),
);
