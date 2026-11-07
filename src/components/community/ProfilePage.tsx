"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/client/api";
import { credits, mult, shortAddress, signed, timeAgo } from "@/client/format";
import { sound } from "@/client/sound";
import { useArcade } from "@/client/store";
import type { Me } from "@/client/types";
import { useOwnedSqueeks } from "@/components/drops/SqueekPicker";
import { ShareButton } from "@/components/game/ShareButton";
import { useHistory } from "@/components/game/useHistory";
import { LiteToggle } from "@/components/game/LiteToggle";
import { Avatar } from "@/components/ui/Avatar";
import { useConnectModal } from "@/components/wallet/ConnectModal";
import { ACHIEVEMENTS, COSMETICS, HAMSTER_AVATARS } from "@/shared/game-rules";

type Tx = { id: string; type: string; amount: number; balanceAfter: number; note: string | null; createdAt: string };
const TX_LABEL: Record<string, string> = { GRANT: "Welcome points", DAILY: "Daily points", REFILL: "Refill", STAKE: "Bet", PAYOUT: "Payout" };

export function ProfilePage() {
  const me = useArcade((s) => s.me);
  const setMe = useArcade((s) => s.setMe);
  const load = useArcade((s) => s.load);
  const toast = useArcade((s) => s.toast);
  const connect = useConnectModal((s) => s.show);
  const [name, setName] = useState("");
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const history = useHistory(undefined, me?.stats.gamesPlayed ?? 0, 15);
  const { listing } = useOwnedSqueeks();

  useEffect(() => {
    if (me?.username) setName(me.username);
  }, [me?.username]);
  useEffect(() => {
    api<{ transactions: Tx[] }>("/api/credits/history").then((r) => setTxs(r.transactions)).catch(() => setTxs([]));
  }, [me?.balance]);

  const save = async (patch: Record<string, string>, ok?: string) => {
    try {
      setMe(await api<Me>("/api/me", { body: patch }));
      sound.tick();
      if (ok) toast({ kind: "info", title: ok });
    } catch (e) {
      toast({ kind: "error", title: e instanceof ApiError ? e.message : "That didn't save." });
    }
  };

  if (!me) return <p className="p-6 text-center font-data text-sm text-gray">Loading your player…</p>;
  const earned = new Map(me.achievements.map((a) => [a.key, a.earnedAt]));
  const s = me.stats;

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-3 p-3 sm:p-5 lg:grid-cols-[360px_1fr]">
      <div className="flex flex-col gap-3">
        <section className="plate p-4" aria-label="Identity">
          <div className="flex items-center gap-3">
            <Avatar avatar={me.avatar} size={72} />
            <div className="min-w-0">
              <h1 className="title truncate text-3xl" data-testid="profile-name">{me.name}</h1>
              <p className="font-data text-xs text-gold">Level {me.progress.level} · {credits(me.xp)} XP</p>
              <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-line"><div className="h-full bg-tile" style={{ width: `${(me.progress.intoLevel / me.progress.levelSpan) * 100}%` }} /></div>
              <p className="mt-0.5 font-data text-[10px] text-dim">{me.progress.levelSpan - me.progress.intoLevel} XP to level {me.progress.level + 1}</p>
            </div>
          </div>
          <label className="mt-4 block">
            <span className="eyebrow">Username</span>
            <div className="mt-1 flex gap-1.5">
              <input className="field" value={name} maxLength={18} placeholder="3 to 18 characters" data-testid="username-input" onChange={(e) => setName(e.target.value)} />
              <button className="chip shrink-0" data-testid="username-save" disabled={!name || name === me.username} onClick={() => save({ username: name }, "Name saved")}>Save</button>
            </div>
          </label>
          <div className="mt-4">
            <p className="eyebrow">Wallet</p>
            {me.wallet ? (
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-data text-sm text-paper" title={me.wallet}>{shortAddress(me.wallet)}</span>
                <button className="chip" onClick={async () => { await api("/api/auth/logout", { body: {} }); await load(); }}>Sign out</button>
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-gray">You&apos;re playing as a guest on this browser. Connect a wallet to keep this player and use your Squeeks.</p>
                <button className="key key-tile mt-2 h-10 px-4 text-sm" onClick={connect}>Connect wallet</button>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ShareButton path={`/p/${me.shareId}`} title="your profile" />
            <Link className="chip" href={`/p/${me.shareId}`}>Public page</Link>
            <LiteToggle />
          </div>
        </section>

        <section className="plate p-4" aria-label="Avatar">
          <h2 className="eyebrow">Avatar</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {HAMSTER_AVATARS.map((h) => {
              const value = `hamster:${h.key}`;
              return (
                <button key={h.key} title={h.name} aria-pressed={me.avatar === value} onClick={() => save({ avatar: value })} className={`rounded-[5px] border-2 ${me.avatar === value ? "border-gold" : "border-transparent"}`}>
                  <Avatar avatar={value} size={48} />
                </button>
              );
            })}
            {listing?.tokens.slice(0, 12).map((t) => {
              const value = `squeek:${t.tokenId}`;
              return (
                <button key={t.tokenId} title={t.name} aria-pressed={me.avatar === value} onClick={() => save({ avatar: value })} className={`rounded-[5px] border-2 ${me.avatar === value ? "border-gold" : "border-transparent"}`}>
                  <Avatar avatar={value} size={48} />
                </button>
              );
            })}
          </div>
          <h2 className="eyebrow mt-4">Token trail</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COSMETICS.map((c) => {
              const locked = me.progress.level < c.level;
              return (
                <button key={c.key} disabled={locked} data-on={me.cosmetic === c.key} aria-pressed={me.cosmetic === c.key} onClick={() => save({ cosmetic: c.key })} title={locked ? `Unlocks at level ${c.level}` : c.name} className="chip disabled:opacity-40">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                  {locked ? `Lvl ${c.level}` : c.name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-dim">Looks only. Levels and XP never change the odds.</p>
        </section>
      </div>

      <div className="flex flex-col gap-3">
        <section className="plate p-4" aria-label="Stats">
          <h2 className="eyebrow">Stats</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="stats">
            {[
              ["Games played", credits(s.gamesPlayed)], ["Wins", credits(s.wins)], ["Losses", credits(s.losses)],
              ["Best Run", s.bestRunMult ? mult(s.bestRunMult) : "-"], ["Best Drop", s.bestDropMult ? mult(s.bestDropMult) : "-"], ["Real blocks caught", credits(s.blocksCaught)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[4px] border border-line bg-ink/60 p-2.5">
                <dt className="eyebrow">{k}</dt>
                <dd className="tabular font-display text-3xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="plate p-4" aria-label="Achievements">
          <h2 className="eyebrow">Achievements · {earned.size} of {ACHIEVEMENTS.length}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="achievements">
            {ACHIEVEMENTS.map((a) => {
              const at = earned.get(a.key);
              return (
                <li key={a.key} className={`rounded-[4px] border p-2.5 ${at ? "border-gold/50 bg-gold/5" : "border-line opacity-60"}`} data-earned={Boolean(at)}>
                  <p className={`font-display text-lg font-semibold uppercase leading-tight ${at ? "text-gold" : "text-lit"}`}>{a.name}</p>
                  <p className="text-xs text-gray">{a.description}</p>
                  <p className="mt-0.5 font-data text-[10px] text-dim">{at ? `Earned ${timeAgo(at)}` : `${a.xp} XP`}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="plate p-4" aria-label="Recent activity">
          <h2 className="eyebrow">Recent activity</h2>
          {history?.length === 0 && <p className="mt-2 text-sm text-gray">No rounds yet.</p>}
          <ul className="mt-1 divide-y divide-line">
            {history?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate text-sm">{r.game === "RUN" ? "Squeek Run" : "Squeek Drops"} <span className="font-data text-[11px] text-dim">{r.game === "RUN" && r.status === "LOST" ? `stopped ${mult(r.crashMult)}` : r.balls > 1 ? `${r.balls} tokens, best ${mult(r.resultMult)}` : mult(r.resultMult)} · {timeAgo(r.createdAt)}</span></span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`tabular font-data text-sm ${(r.net ?? 0) > 0 ? "text-mint" : (r.net ?? 0) < 0 ? "text-reactor" : "text-lit"}`}>{signed(r.net ?? 0)}</span>
                  <Link className="link font-data text-[11px]" href={`/r/${r.shareId}`}>Open</Link>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="plate p-4" aria-label="Points history" id="ledger">
          <h2 className="eyebrow">Points history</h2>
          <p className="mt-1 text-xs text-gray">Free points. No cash value, no deposits, no withdrawals.</p>
          <ul className="mt-2 divide-y divide-line" data-testid="ledger">
            {txs?.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 font-data text-xs">
                <span className="text-lit">{TX_LABEL[t.type] ?? t.type}<span className="ml-2 text-dim">{timeAgo(t.createdAt)}</span></span>
                <span className="flex gap-3"><span className={t.amount > 0 ? "text-mint" : "text-reactor"}>{signed(t.amount)}</span><span className="w-16 text-right text-dim">{credits(t.balanceAfter)}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
