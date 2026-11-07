"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sound } from "@/client/sound";
import { clientSeed, randomClientSeed, setClientSeed, useArcade } from "@/client/store";
import { CLIENT_SEED_PATTERN } from "@/shared/fairness";

/** The next round's commitment, on show before anything is staked. */
export function FairnessPanel({ disabled }: { disabled?: boolean }) {
  const commit = useArcade((s) => s.me?.commit);
  const [seed, setSeed] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => setSeed(clientSeed()), []);
  const valid = CLIENT_SEED_PATTERN.test(seed);
  return (
    <div className="rounded-[4px] border border-line bg-ink/60">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="eyebrow">Provably fair</span>
        <span className="font-data text-[11px] text-dim">{commit ? `#${commit.nonce} · ${commit.hash.slice(0, 10)}…` : "…"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-3">
          <p className="text-xs leading-relaxed text-gray">The server has already locked in this round&apos;s seed. Its hash is below, so it can&apos;t change after you stake. You add your own seed, and the secret is revealed the moment the round ends.</p>
          <div>
            <p className="eyebrow">Next commitment</p>
            <p className="mt-1 break-all font-data text-[11px] text-lit" data-testid="commit-hash">{commit?.hash}</p>
          </div>
          <div>
            <label htmlFor="client-seed" className="eyebrow">Your client seed</label>
            <div className="mt-1 flex gap-1.5">
              <input
                id="client-seed"
                className="field text-xs"
                disabled={disabled}
                value={seed}
                maxLength={64}
                aria-invalid={!valid}
                onChange={(e) => {
                  setSeed(e.target.value);
                  if (CLIENT_SEED_PATTERN.test(e.target.value)) setClientSeed(e.target.value);
                }}
              />
              <button
                className="chip shrink-0"
                disabled={disabled}
                onClick={() => {
                  sound.tick();
                  const next = randomClientSeed();
                  setSeed(next);
                  setClientSeed(next);
                }}
              >New</button>
            </div>
          </div>
          <Link href="/fairness" className="link text-xs">How it works, and check a round yourself</Link>
        </div>
      )}
    </div>
  );
}
