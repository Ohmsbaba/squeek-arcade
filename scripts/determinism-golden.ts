/** Writes the physics results Node computes, for the browsers to match. Run: npx tsx scripts/determinism-golden.ts */
import { writeFileSync } from "node:fs";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { BALL_COUNTS, CHUTES } from "../src/shared/drops/board";
import { initPhysics, simulateDrop } from "../src/shared/drops/sim";

async function main() {
  await initPhysics();
  const out = [];
  for (let i = 0; i < 28; i++) {
    const digest = sha256(new TextEncoder().encode(`golden-${i}`));
    const chute = CHUTES[i % CHUTES.length];
    const balls = BALL_COUNTS[i % BALL_COUNTS.length];
    const t = simulateDrop(digest, chute, balls);
    out.push({ digest: bytesToHex(digest), chute, balls, slots: t.slots, catchFrames: t.catchFrames, hash: bytesToHex(sha256(new Uint8Array(t.frames.buffer))) });
  }
  writeFileSync(new URL("../e2e/determinism-golden.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
}
main();
