import type { Metadata } from "next";
import { Suspense } from "react";
import { FairnessTool } from "@/components/community/FairnessTool";
import { RUN_RETURN_PERCENT } from "@/shared/run-curve";
import { CALIBRATION_BALLS, DROPS_RETURN } from "@/shared/drops/tables";

export const metadata: Metadata = { title: "Fairness", description: "How Squeek Arcade's results are made, and how to check any round yourself." };

const steps = [
  ["Commit", "Before each round, the server creates a secret seed and shows you only its SHA-256 hash. It can't change that seed later without the hash giving it away."],
  ["Combine", "You add a client seed, which you can change at any time. The server locked its seed in before seeing yours, so neither side can steer the result alone."],
  ["Derive", "HMAC-SHA256(serverSeed, \"clientSeed:nonce:game\") gives one digest, and the round's outcome comes from it. Squeek Run adds the hash of the Sepolia block read as the round starts, which isn't known when the commitment is made."],
  ["Reveal", "When the round ends, the server hands over the secret seed. Hash it and compare, then re-derive the result. The tool below does both, in your browser."],
];

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 sm:p-6">
      <header className="plate p-5">
        <p className="eyebrow">Provably fair</p>
        <h1 className="title mt-1 text-5xl text-gold">Don&apos;t take our word for it</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-lit">Every round in the arcade can be checked by you, with no trust in the server. Your Squeek, its level and your arcade level play no part in any of this. There&apos;s no input for them.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2">
        {steps.map(([t, d], i) => (
          <div key={t} className="plate p-4">
            <p className="font-data text-xs text-gold">Step {i + 1}</p>
            <h2 className="title mt-1 text-2xl">{t}</h2>
            <p className="mt-1 text-sm leading-relaxed text-lit">{d}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="plate p-4">
          <h2 className="title text-2xl">Squeek Run</h2>
          <p className="mt-1 text-sm leading-relaxed text-lit">The top 52 bits of the digest, as h, set the stop: <code className="font-data text-xs text-paper">99 × 2⁵² ÷ (2⁵² − h)</code>, in hundredths, floored, from 1.00x up to 1000x.</p>
          <p className="mt-2 text-sm leading-relaxed text-lit">That makes the chance of reaching any multiplier x exactly {RUN_RETURN_PERCENT}% ÷ x, so every cash-out plan returns {RUN_RETURN_PERCENT}% over the long run before bonuses. There&apos;s no strategy to find, and past stops don&apos;t predict the next one.</p>
          <p className="mt-2 text-sm leading-relaxed text-lit"><strong className="text-paper">The real wheel.</strong> Live bonuses come from the SqueekCore contract on Sepolia, read by the server, so anyone can check them. His settled work over the last 20 minutes gives his average speed: 1% per 10 rpm, up to 10%, locked when the round starts. Each new Squeek block settled during the round adds 5%, up to 25%. They only ever raise a cash-out and never move the stop. Blocks are read as the round ends, so a round that finishes while nobody is connected keeps its work bonus and takes no block bonus. The status line you see in the game comes from the official API and is for display only.</p>
          <p className="mt-2 text-sm leading-relaxed text-lit">The wheel runs on the server&apos;s clock. Your browser never knows the stop point until it happens, and a cash-out sends no multiplier, so there&apos;s nothing to tamper with.</p>
        </div>
        <div className="plate p-4">
          <h2 className="title text-2xl">Squeek Drops</h2>
          <p className="mt-1 text-sm leading-relaxed text-lit">The digest sets the token&apos;s starting nudge and the small kick each peg gives it. From there a real rigid-body simulation (Rapier&apos;s cross-platform deterministic build) decides the slots, with tokens on a multi-ball drop knocking into each other on the way down. Nothing is steered to a chosen result.</p>
          <p className="mt-2 text-sm leading-relaxed text-lit">Each chute and ball count has its own pay table, built from {CALIBRATION_BALLS.toLocaleString("en-US")} simulated tokens, aiming for a {(DROPS_RETURN * 100).toFixed(0)}% return from every setting. Those odds are measured, so a table can be a little off the target.</p>
        </div>
      </section>
      <Suspense>
        <FairnessTool />
      </Suspense>
      <section className="plate p-4 text-sm leading-relaxed text-lit">
        <h2 className="title text-2xl text-paper">What this doesn&apos;t cover</h2>
        <p className="mt-1">Points are free and worth nothing. A commitment proves the server didn&apos;t change a seed after committing, and your client seed stops it picking a seed to suit you. The arcade&apos;s operator can still see unrevealed seeds in the database, which matters little while nothing of value is at stake.</p>
      </section>
    </div>
  );
}
