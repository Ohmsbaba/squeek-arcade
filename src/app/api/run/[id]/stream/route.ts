import { logError } from "@/server/errors";
import { requireUser, route } from "@/server/http";
import { readRun, runSchedule } from "@/server/run";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The stream announces a stop this long after it happens. A cash-out that reached the server before
 * the stop but is still being written then wins, as it should, instead of being overtaken.
 */
const ANNOUNCE_DELAY_MS = 250;

const encode = (data: unknown) => JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v));

/**
 * One connection per round. The server knows when the wheel will stop and says so at that moment,
 * never before: ticks carry the clock only, so nothing in the stream gives the stop away early.
 */
export const GET = route("run.stream", async (req, ctx) => {
  const { id } = await ctx.params;
  const userId = await requireUser();
  const first = await readRun(userId, id);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let ticker: ReturnType<typeof setInterval> | undefined;
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(enc.encode(`event: ${event}\ndata: ${encode(data)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        clearInterval(ticker);
        try {
          controller.close();
        } catch {
          // Already gone.
        }
      };
      req.signal.addEventListener("abort", close);

      if (first.finished) {
        send("settled", first);
        return close();
      }
      send("state", { round: first.round, serverNow: first.serverNow });
      ticker = setInterval(() => send("tick", { serverNow: Date.now() }), 1000);

      const wake = async () => {
        try {
          const when = await runSchedule(userId, id);
          // Cashed out elsewhere, or due now.
          if (when === null || when + ANNOUNCE_DELAY_MS <= Date.now()) {
            const state = await readRun(userId, id);
            if (state.finished) {
              send("settled", state);
              return close();
            }
          }
          timer = setTimeout(wake, Math.max(5, Math.min(1000, (when ?? Date.now()) + ANNOUNCE_DELAY_MS - Date.now())));
        } catch (error) {
          await logError("run.stream", error);
          close();
        }
      };
      await wake();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});
