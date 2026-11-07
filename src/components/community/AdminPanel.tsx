"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/client/api";
import { credits, timeAgo } from "@/client/format";

type GameStats = { played: number; today: number; staked: number; paid: number; avgStake: number; actualReturn: number | null };
type Stats = {
  players: number; wallets: number; active24h: number; active7d: number; inFlight: number;
  run: GameStats; drops: GameStats;
  credits: { welcome: number; daily: number; refill: number };
  achievements: { key: string; name: string; players: number }[];
  errors24h: number;
  errors: { id: string; scope: string; message: string; at: string }[];
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="plate p-3">
      <p className="eyebrow">{label}</p>
      <p className="tabular font-display text-4xl font-semibold">{value}</p>
      {hint && <p className="font-data text-[11px] text-dim">{hint}</p>}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(1)}%`);

export function AdminPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await api<Stats>("/api/admin/stats"));
      setNeedLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedLogin(true);
      else setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (needLogin) {
    return (
      <form
        className="plate mx-auto mt-10 flex w-full max-w-sm flex-col gap-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await api("/api/admin/login", { body: { password } });
            setPassword("");
            await load();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <h1 className="title text-3xl">Admin</h1>
        <label>
          <span className="eyebrow">Password</span>
          <input type="password" autoComplete="current-password" className="field mt-1" data-testid="admin-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-reactor">{error}</p>}
        <button className="key key-gold h-11 text-lg" data-testid="admin-login">Sign in</button>
      </form>
    );
  }
  if (!stats) return <p className="p-6 text-center font-data text-sm text-gray">{error ?? "Loading…"}</p>;

  const issued = stats.credits.welcome + stats.credits.daily + stats.credits.refill;
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 p-3 sm:p-5" data-testid="admin-panel">
      <div className="flex items-center justify-between">
        <h1 className="title text-4xl">Arcade admin</h1>
        <div className="flex gap-2">
          <button className="chip" onClick={load}>Refresh</button>
          <button className="chip" onClick={async () => { await api("/api/admin/login", { method: "DELETE" }); setStats(null); setNeedLogin(true); }}>Sign out</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Players" value={credits(stats.players)} hint={`${credits(stats.wallets)} with a wallet`} />
        <Tile label="Active, 24 h" value={credits(stats.active24h)} hint={`${credits(stats.active7d)} in 7 days`} />
        <Tile label="Games played" value={credits(stats.run.played + stats.drops.played)} hint={`${stats.inFlight} in flight`} />
        <Tile label="Points issued" value={credits(issued)} hint={`${credits(stats.credits.welcome)} welcome, ${credits(stats.credits.daily)} daily, ${credits(stats.credits.refill)} refill`} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(["drops", "run"] as const).map((g) => {
          const s = stats[g];
          return (
            <section key={g} className="plate p-4">
              <h2 className="title text-2xl text-gold">{g === "run" ? "Squeek Run" : "Squeek Drops"}</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-data text-xs">
                {[["Played", credits(s.played)], ["Last 24 h", credits(s.today)], ["Staked", credits(s.staked)], ["Paid out", credits(s.paid)], ["Average stake", credits(s.avgStake)], ["Actual return", pct(s.actualReturn)]].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-dim">{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-dim">Target: {g === "run" ? "99%" : "97%"}. Expect it to wander until there are many rounds.</p>
            </section>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="plate p-4">
          <h2 className="eyebrow">Popular achievements</h2>
          <ul className="mt-2 space-y-1">
            {stats.achievements.map((a) => (
              <li key={a.key} className="flex justify-between font-data text-xs"><span className="text-lit">{a.name}</span><span>{a.players}</span></li>
            ))}
          </ul>
        </section>
        <section className="plate p-4">
          <h2 className="eyebrow">Recent errors · {stats.errors24h} in 24 h</h2>
          {stats.errors.length === 0 && <p className="mt-2 text-sm text-gray">None.</p>}
          <ul className="thin-scrollbar mt-2 max-h-80 space-y-2 overflow-y-auto">
            {stats.errors.map((e) => (
              <li key={e.id} className="font-data text-[11px]"><span className="text-amber">{e.scope}</span> <span className="text-dim">{timeAgo(e.at)}</span><p className="break-words text-lit">{e.message}</p></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
