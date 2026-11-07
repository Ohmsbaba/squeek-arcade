"use client";
import type { Settled } from "@/client/types";
import type { Chute } from "@/shared/drops/board";
import { roundDigest } from "@/shared/fairness";
import type { DropTrace } from "@/shared/drops/sim";

/**
 * The browser runs the same physics, from the seed the server just revealed, to draw the fall.
 * It's the same deterministic build, so it lands where the server's run did. If that ever failed
 * the server's result still stands, and we say so in the console.
 */
export async function logicalSlotCheck(res: Settled): Promise<DropTrace> {
  const { initPhysics, simulateDrop } = await import("@/shared/drops/sim");
  await initPhysics();
  const r = res.round;
  const digest = roundDigest(r.fairness.serverSeed!, r.fairness.clientSeed, r.fairness.nonce, "drops");
  const trace = simulateDrop(digest, r.chute as Chute, r.balls);
  if (JSON.stringify(trace.slots) !== JSON.stringify(r.slots)) console.error(`Replay landed in ${trace.slots}, the server settled ${r.slots}.`);
  return trace;
}
