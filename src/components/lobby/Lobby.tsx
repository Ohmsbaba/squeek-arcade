"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasWebGL, useReducedMotion } from "@/client/env";
import { credits, mult, shortAddress, signed, timeAgo } from "@/client/format";
import { sound } from "@/client/sound";
import { useArcade } from "@/client/store";
import { DotText } from "@/components/ui/DotText";
import { useHistory } from "@/components/game/useHistory";
import { useOwnedSqueeks } from "@/components/drops/SqueekPicker";
import { LeaderboardPanel } from "@/components/community/LeaderboardPanel";
import { useLiveWheel } from "@/client/useLiveWheel";
import { DailyClaim } from "@/components/game/DailyClaim";
import { useConnectModal } from "@/components/wallet/ConnectModal";
import { ACHIEVEMENTS } from "@/shared/game-rules";

const LobbyScene = dynamic(() => import("./LobbyScene"), { ssr: false, loading: () => null });

function PortalPoster({ game }: { game: "drops" | "run" }) {
  return game === "drops" ? (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {Array.from({ length: 6 }, (_, r) => Array.from({ length: 9 - (r % 2) }, (_, i) => <circle key={`${r}-${i}`} cx={100 + (i - (8 - (r % 2)) / 2) * 22} cy={18 + r * 16} r={2.4} fill="#8d8f9b" />))}
      <circle cx="96" cy="40" r="9" fill="#f2c230" />
    </svg>
  ) : (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <circle cx="100" cy="60" r="50" fill="none" stroke="#8a8c98" strokeWidth="4" />
      <circle cx="100" cy="60" r="44" fill="none" stroke="#c9a23a" strokeWidth="5" strokeDasharray="2 7" />
      <ellipse cx="100" cy="92" rx="17" ry="11" fill="#ee9a3f" />
      <circle cx="115" cy="86" r="8" fill="#ee9a3f" />
    </svg>
  );
}

export function Lobby() {
  const router = useRouter();
  const me = useArcade((s) => s.me);
  const portal = useArcade((s) => s.portal);
  const setPortal = useArcade((s) => s.setPortal);
  const lite = useArcade((s) => s.lite);
  const reduced = useReducedMotion();
  const hover = useRef<{ drops: number; run: number; target: "drops" | "run" | null }>({ drops: 0, run: 0, target: null });
  const [gl, setGl] = useState<boolean | null>(null);
  const history = useHistory(undefined, 0, 6);
  const { listing, loading } = useOwnedSqueeks();
  const connect = useConnectModal((s) => s.show);
  const wheel = useLiveWheel(6000);

  useEffect(() => setGl(hasWebGL()), []);
  useEffect(() => {
    router.prefetch("/drops");
    router.prefetch("/run");
  }, [router]);

  const enter = (game: "drops" | "run") => {
    if (portal) return;
    sound.drop();
    hover.current.target = game;
    setPortal(game);
    setTimeout(() => router.push(`/${game}`), reduced ? 100 : 620);
  };

  const portalButton = (game: "drops" | "run", name: string, line: string, color: string) => (
    <button
      data-testid={`portal-${game}`}
      onClick={() => enter(game)}
      onPointerEnter={() => { hover.current.target = game; }}
      onPointerLeave={() => { hover.current.target = null; }}
      onFocus={() => { hover.current.target = game; }}
      onBlur={() => { hover.current.target = null; }}
      className="group plate pointer-events-auto flex min-h-[132px] flex-1 flex-col justify-end overflow-hidden bg-ink/75 p-3 text-left backdrop-blur-[2px] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-gold sm:p-4"
    >
      <span className="title text-3xl sm:text-5xl" style={{ color }}>{name}</span>
      <span className="mt-1 text-xs leading-snug text-lit sm:text-sm">{line}</span>
      <span className="mt-2 font-data text-[11px] uppercase tracking-widest text-gold">Play free →</span>
    </button>
  );

  const showScene = gl && !lite;
  const earned = new Map(me?.achievements.map((a) => [a.key, a.earnedAt]));

  return (
    <div className="flex flex-col">
      <section className="relative h-[calc(100svh-56px)] min-h-[560px] overflow-hidden">
        <div className="absolute inset-0">
          {showScene ? (
            <LobbyScene hover={hover} reduced={reduced} />
          ) : gl !== null ? (
            <div className="flex h-full items-center justify-center gap-4 p-6 opacity-70">
              <div className="h-40 w-64 max-w-[45%]"><PortalPoster game="drops" /></div>
              <div className="h-40 w-64 max-w-[45%]"><PortalPoster game="run" /></div>
            </div>
          ) : null}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-ink via-ink/70 to-transparent" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center px-4 pt-5 text-center">
          <h1 aria-label="Squeek Arcade" className="flex w-full max-w-[640px] justify-center">
            <span className="w-full">
              <span className="flex justify-center"><DotText text="SQUEEK ARCADE" height={38} fit label="Squeek Arcade" /></span>
            </span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-lit">An underground arcade running on hamster power. Two machines, 10,000 free points a day, no wallet needed.</p>
          {wheel.now && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-line2 bg-ink/80 px-3 py-1 font-data text-[11px] text-lit" data-testid="lobby-live">
              <span className={`h-2 w-2 rounded-full ${wheel.now.running ? "animate-pulse bg-mint" : "bg-amber"}`} />
              {wheel.now.running ? `The real Squeektoshi is running: ${wheel.now.rpm} rpm` : "The real Squeektoshi is resting"}
            </p>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-[150px] mx-auto w-full max-w-[420px] px-3 sm:bottom-[176px]"><DailyClaim /></div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto flex max-w-[980px] gap-2 p-3 sm:gap-4 sm:p-5">
          {portalButton("drops", "Squeek Drops", "Drop your Squeek through a 3D pegboard and see where it lands.", "#f2c230")}
          {portalButton("run", "Squeek Run", "The wheel speeds up, the multiplier climbs. Cash out before it stops.", "#7c97fb")}
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1300px] grid-cols-1 gap-3 p-3 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
        {/* Player */}
        <section className="plate p-4" aria-label="Your player">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Your player</p>
              <p className="title mt-1 truncate text-3xl">{me?.name ?? "…"}</p>
            </div>
            <Link href="/profile" className="chip shrink-0">Profile</Link>
          </div>
          {me && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[4px] border border-line bg-ink/60 p-2.5">
                  <p className="eyebrow">Your points</p>
                  <p className="tabular font-display text-3xl font-semibold text-gold">{credits(me.balance)}</p>
                </div>
                <div className="rounded-[4px] border border-line bg-ink/60 p-2.5">
                  <p className="eyebrow">Arcade level</p>
                  <p className="tabular font-display text-3xl font-semibold">{me.progress.level}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-tile" style={{ width: `${(me.progress.intoLevel / me.progress.levelSpan) * 100}%` }} /></div>
                  <p className="mt-1 font-data text-[10px] text-dim">{credits(me.xp)} XP</p>
                </div>
              </div>
              <h3 className="eyebrow mt-4">Today&apos;s challenges</h3>
              <ul className="mt-1.5 space-y-1.5" data-testid="challenges">
                {me.challenges.map((c) => (
                  <li key={c.key} className="flex items-center gap-2">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border text-[10px] ${c.done ? "border-mint bg-mint/20 text-mint" : "border-line2"}`}>{c.done ? "✓" : ""}</span>
                    <span className={`flex-1 text-xs ${c.done ? "text-gray line-through" : "text-lit"}`}>{c.title}</span>
                    <span className="font-data text-[10px] text-dim">{c.progress}/{c.goal} · {c.xp} XP</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Squeeks */}
        <section className="plate p-4" aria-label="Your Squeeks">
          <p className="eyebrow">Your Squeeks</p>
          {!me?.wallet ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-lit">Hold a Squeek on Sepolia? Connect to fall as your own character. It stays where it is, and nothing is moved or locked.</p>
              <button className="key key-tile mt-3 h-11 px-5 text-base" data-testid="connect-wallet" onClick={connect}>Connect wallet</button>
            </>
          ) : (
            <>
              <p className="mt-1 font-data text-xs text-gray">{shortAddress(me.wallet)}</p>
              {loading && <p className="mt-3 font-data text-xs text-dim">Reading the collection…</p>}
              {listing?.status === "unavailable" && <p className="mt-2 text-sm text-amber">The Squeekchain API can&apos;t list this wallet right now. That doesn&apos;t mean it&apos;s empty.</p>}
              {listing?.status === "available" && listing.tokens.length === 0 && <p className="mt-2 text-sm text-gray">No Squeeks in this wallet on Sepolia.</p>}
              <div className="mt-2 grid grid-cols-4 gap-2" data-testid="lobby-squeeks">
                {listing?.tokens.slice(0, 8).map((t) => (
                  <Link key={t.tokenId} href="/drops" title={t.name} className="rounded-[4px] border border-line2 p-1 hover:border-gold">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.imageUrl} alt={t.name} loading="lazy" className="aspect-square w-full rounded-[3px] bg-panel object-cover" />
                    <span className="mt-0.5 block font-data text-[10px] text-lit">#{t.tokenId}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          <h3 className="eyebrow mt-4">Achievements</h3>
          <p className="mt-1 font-data text-xs text-lit">{earned.size} of {ACHIEVEMENTS.length} earned</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ACHIEVEMENTS.map((a) => (
              <li key={a.key} title={`${a.name}: ${a.description}`} className={`rounded-[3px] border px-1.5 py-0.5 font-data text-[10px] ${earned.has(a.key) ? "border-gold/60 bg-gold/10 text-gold" : "border-line text-dim"}`}>{a.name}</li>
            ))}
          </ul>
        </section>

        {/* Activity */}
        <section className="plate p-4 md:col-span-2 xl:col-span-1" aria-label="Your recent activity">
          <p className="eyebrow">Your recent activity</p>
          {history === null && <p className="mt-3 font-data text-xs text-dim">Loading…</p>}
          {history?.length === 0 && <p className="mt-3 text-sm text-gray">Nothing yet. Pick a machine and your rounds will show up here.</p>}
          <ul className="mt-1 divide-y divide-line" data-testid="activity">
            {history?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-paper">{r.game === "RUN" ? "Squeek Run" : "Squeek Drops"}</span>
                  <span className="font-data text-[11px] text-dim">{timeAgo(r.createdAt)} · {r.game === "RUN" && r.status === "LOST" ? `stopped ${mult(r.crashMult)}` : r.balls > 1 ? `${r.balls} tokens, best ${mult(r.resultMult)}` : mult(r.resultMult)}</span>
                </span>
                <span className={`tabular font-data text-sm ${(r.net ?? 0) > 0 ? "text-mint" : (r.net ?? 0) < 0 ? "text-reactor" : "text-lit"}`}>{signed(r.net ?? 0)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="md:col-span-2 xl:col-span-3"><LeaderboardPanel compact /></div>
      </div>
    </div>
  );
}
