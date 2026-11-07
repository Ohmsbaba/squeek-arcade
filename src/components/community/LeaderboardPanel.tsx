"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { credits, mult, shortAddress } from "@/client/format";

type Entry = { rank: number; shareId: string; name: string; wallet: string | null; value: number; level: number; isMe: boolean };
const BOARDS = [
  { key: "run", label: "Highest Run", format: (v: number) => mult(v), empty: "No cash-outs recorded yet." },
  { key: "drops", label: "Best Drop", format: (v: number) => mult(v), empty: "No drops recorded yet." },
  { key: "games", label: "Most Games", format: (v: number) => credits(v), empty: "No games recorded yet." },
  { key: "xp", label: "Arcade XP", format: (v: number) => `${credits(v)} XP`, empty: "No XP recorded yet." },
] as const;

export function LeaderboardPanel({ compact }: { compact?: boolean }) {
  const [board, setBoard] = useState<(typeof BOARDS)[number]["key"]>("run");
  const [window, setWindow] = useState<"week" | "all">("week");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    setEntries(null);
    setFailed(false);
    api<{ entries: Entry[] }>(`/api/leaderboards?board=${board}&window=${window}`)
      .then((r) => !dead && setEntries(r.entries))
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [board, window]);

  const def = BOARDS.find((b) => b.key === board)!;
  const rows = compact ? entries?.slice(0, 5) : entries;

  return (
    <section className="plate p-4" aria-label="Leaderboards">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="title text-2xl">Leaderboards</h2>
        <div className="flex gap-1" role="tablist" aria-label="Time window">
          {(["week", "all"] as const).map((w) => (
            <button key={w} role="tab" aria-selected={window === w} data-on={window === w} className="chip" onClick={() => setWindow(w)}>{w === "week" ? "This week" : "All time"}</button>
          ))}
        </div>
      </div>
      <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Board">
        {BOARDS.map((b) => (
          <button key={b.key} role="tab" aria-selected={board === b.key} data-on={board === b.key} data-testid={`board-${b.key}`} className="chip shrink-0" onClick={() => setBoard(b.key)}>{b.label}</button>
        ))}
      </div>
      {failed && <p className="mt-3 text-sm text-gray">The boards can&apos;t load right now.</p>}
      {entries === null && !failed && <p className="mt-3 font-data text-xs text-dim">Loading…</p>}
      {entries?.length === 0 && <p className="mt-3 text-sm text-gray">{def.empty} These boards only show real play, so the top spot is open.</p>}
      <ol className="mt-2 divide-y divide-line" data-testid="leaderboard">
        {rows?.map((e) => (
          <li key={e.shareId} className={`flex items-center gap-3 py-2 ${e.isMe ? "text-gold" : ""}`}>
            <span className="w-6 text-right font-data text-xs text-dim">{e.rank}</span>
            <Link href={`/p/${e.shareId}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
              {e.name}
              {e.isMe && <span className="ml-1.5 font-data text-[10px]">YOU</span>}
              {e.wallet && <span className="ml-2 hidden font-data text-[10px] text-dim sm:inline">{shortAddress(e.wallet)}</span>}
            </Link>
            <span className="hidden font-data text-[10px] text-dim sm:inline">LVL {e.level}</span>
            <span className="tabular font-data text-sm">{def.format(e.value)}</span>
          </li>
        ))}
      </ol>
      {compact && <Link href="/leaderboards" className="link mt-3 inline-block text-xs">See the full boards</Link>}
    </section>
  );
}
