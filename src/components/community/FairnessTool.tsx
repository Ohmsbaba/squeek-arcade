"use client";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { mult } from "@/client/format";
import type { PublicRound } from "@/client/types";
import { BALL_COUNTS, CHUTES, type Chute } from "@/shared/drops/board";
import { slotMult } from "@/shared/drops/tables";
import { hashServerSeed, roundDigest } from "@/shared/fairness";
import { crashFromDigest } from "@/shared/run-curve";

type Result = { hash: string; hashOk: boolean | null; run?: { stop: number; ok: boolean | null }; drops?: { slots: number[]; mults: number[]; ok: boolean | null } };

/** Runs entirely in the browser, on the same code the server uses. Nothing here asks the server to confirm. */
export function FairnessTool() {
  const params = useSearchParams();
  const roundParam = params.get("round");
  const [game, setGame] = useState<"run" | "drops">("run");
  const [serverSeed, setServerSeed] = useState("");
  const [hash, setHash] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [nonce, setNonce] = useState("0");
  const [chute, setChute] = useState<Chute>(0);
  const [balls, setBalls] = useState(1);
  const [beacon, setBeacon] = useState("");
  const [expected, setExpected] = useState<PublicRound | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // A small hook for the cross-browser determinism test: it runs the public verifier's physics.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__arcadeSim = async (digestHex: string, c: number, n = 1) => {
      const { initPhysics, simulateDrop } = await import("@/shared/drops/sim");
      await initPhysics();
      const digest = Uint8Array.from(digestHex.match(/../g)!.map((b) => parseInt(b, 16)));
      const t = simulateDrop(digest, c as Chute, n);
      return { slots: t.slots, catchFrames: t.catchFrames, hash: bytesToHex(sha256(new Uint8Array(t.frames.buffer))) };
    };
  }, []);

  useEffect(() => {
    if (!roundParam) return;
    api<{ round: PublicRound }>(`/api/rounds/${encodeURIComponent(roundParam)}`)
      .then(({ round }) => {
        setExpected(round);
        setGame(round.game === "RUN" ? "run" : "drops");
        setServerSeed(round.fairness.serverSeed ?? "");
        setHash(round.fairness.hash);
        setClientSeed(round.fairness.clientSeed);
        setNonce(String(round.fairness.nonce));
        if (round.chute !== null) setChute(round.chute as Chute);
        setBalls(round.balls);
        setBeacon(round.fairness.beacon ?? "");
      })
      .catch((e) => setError(e.message));
  }, [roundParam]);

  const check = async () => {
    setError(null);
    setResult(null);
    if (!/^[0-9a-f]{64}$/i.test(serverSeed)) return setError("The server seed is 64 hex characters.");
    setWorking(true);
    try {
      const n = Number(nonce);
      const computed = hashServerSeed(serverSeed);
      const out: Result = { hash: computed, hashOk: hash ? computed === hash.trim().toLowerCase() : null };
      const digest = roundDigest(serverSeed, clientSeed, n, game, game === "run" ? beacon.trim() || null : null);
      if (game === "run") {
        const stop = crashFromDigest(digest);
        out.run = { stop, ok: expected ? stop === expected.crashMult : null };
      } else {
        const { initPhysics, simulateDrop } = await import("@/shared/drops/sim");
        await initPhysics();
        const trace = simulateDrop(digest, chute, balls, { trace: false });
        out.drops = { slots: trace.slots, mults: trace.slots.map((s) => slotMult(chute, balls, s)), ok: expected ? JSON.stringify(trace.slots) === JSON.stringify(expected.slots) : null };
      }
      setResult(out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="plate p-4" aria-label="Check a round" id="verify">
      <h2 className="title text-3xl">Check a round</h2>
      <p className="mt-1 text-sm text-lit">This runs in your browser on the same code as the server. Every round in your history has a Verify link that fills this in.</p>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Game">
        <button role="radio" aria-checked={game === "run"} data-on={game === "run"} className="chip" onClick={() => setGame("run")}>Squeek Run</button>
        <button role="radio" aria-checked={game === "drops"} data-on={game === "drops"} className="chip" onClick={() => setGame("drops")}>Squeek Drops</button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="eyebrow">Server seed (revealed)</span><input className="field mt-1 text-xs" value={serverSeed} data-testid="v-server-seed" onChange={(e) => setServerSeed(e.target.value.trim())} /></label>
        <label className="block sm:col-span-2"><span className="eyebrow">Commitment hash shown before the round</span><input className="field mt-1 text-xs" value={hash} data-testid="v-hash" onChange={(e) => setHash(e.target.value.trim())} /></label>
        <label className="block"><span className="eyebrow">Client seed</span><input className="field mt-1 text-xs" value={clientSeed} data-testid="v-client-seed" onChange={(e) => setClientSeed(e.target.value)} /></label>
        <label className="block"><span className="eyebrow">Nonce</span><input className="field mt-1 text-xs" inputMode="numeric" value={nonce} data-testid="v-nonce" onChange={(e) => setNonce(e.target.value.replace(/\D/g, ""))} /></label>
        {game === "run" && (
          <label className="block sm:col-span-2"><span className="eyebrow">Sepolia block hash (beacon)</span><input className="field mt-1 text-xs" value={beacon} data-testid="v-beacon" onChange={(e) => setBeacon(e.target.value.trim())} /></label>
        )}
        {game === "drops" && (
          <label className="block"><span className="eyebrow">Tokens</span>
            <select className="field mt-1" value={balls} onChange={(e) => setBalls(Number(e.target.value))}>
              {BALL_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        {game === "drops" && (
          <label className="block"><span className="eyebrow">Chute</span>
            <select className="field mt-1" value={chute} onChange={(e) => setChute(Number(e.target.value) as Chute)}>
              {CHUTES.map((c) => <option key={c} value={c}>{c > 0 ? `+${c}` : c}</option>)}
            </select>
          </label>
        )}
      </div>
      <button className="key key-gold mt-4 h-11 px-6 text-lg" data-testid="v-check" disabled={working} onClick={check}>{working ? "Checking…" : "Check it"}</button>
      {error && <p role="alert" className="mt-3 text-sm text-reactor">{error}</p>}
      {result && (
        <dl className="mt-4 space-y-2 rounded-[4px] border border-line bg-ink/60 p-3 font-data text-xs" data-testid="v-result">
          <div>
            <dt className="text-dim">SHA-256 of the server seed</dt>
            <dd className="break-all text-lit">{result.hash}</dd>
            {result.hashOk !== null && <dd className={result.hashOk ? "text-mint" : "text-reactor"}>{result.hashOk ? "✓ Matches the commitment" : "✗ Doesn't match the commitment"}</dd>}
          </div>
          {result.run && (
            <div>
              <dt className="text-dim">Wheel stop</dt>
              <dd className="text-base text-paper">{mult(result.run.stop)}</dd>
              {beacon && <dd><a className="link" target="_blank" rel="noreferrer" href={`https://eth-sepolia.blockscout.com/block/${beacon}`}>See that block on Sepolia</a></dd>}
              {result.run.ok !== null && <dd className={result.run.ok ? "text-mint" : "text-reactor"}>{result.run.ok ? "✓ Same as the recorded round" : "✗ Differs from the recorded round"}</dd>}
            </div>
          )}
          {result.drops && (
            <div>
              <dt className="text-dim">Physics landed in</dt>
              <dd className="text-base text-paper">{result.drops.slots.map((s, i) => `Slot ${s + 1} (${mult(result.drops!.mults[i])})`).join(", ")}</dd>
              {result.drops.ok !== null && <dd className={result.drops.ok ? "text-mint" : "text-reactor"}>{result.drops.ok ? "✓ Same as the recorded round" : "✗ Differs from the recorded round"}</dd>}
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
