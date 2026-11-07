import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { mult, shortAddress } from "@/client/format";
import { ShareButton } from "@/components/game/ShareButton";
import { Avatar } from "@/components/ui/Avatar";
import { publicProfile } from "@/server/players";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await publicProfile((await params).id);
  if (!p) return { title: "Player not found" };
  const title = `${p.name}, level ${p.progress.level}`;
  return { title, description: `${p.stats.gamesPlayed} games played at Squeek Arcade.`, openGraph: { title }, twitter: { card: "summary_large_image", title } };
}

export default async function Page({ params }: Props) {
  const p = await publicProfile((await params).id);
  if (!p) notFound();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 sm:p-6">
      <section className="plate p-5">
        <div className="flex items-center gap-4">
          <Avatar avatar={p.avatar} size={84} />
          <div className="min-w-0">
            <h1 className="title truncate text-4xl">{p.name}</h1>
            <p className="font-data text-xs text-gold">Arcade level {p.progress.level} · {p.xp.toLocaleString("en-US")} XP</p>
            {p.wallet && <p className="mt-0.5 font-data text-[11px] text-dim">{shortAddress(p.wallet)}</p>}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ["Games", p.stats.gamesPlayed.toLocaleString("en-US")], ["Wins", p.stats.wins.toLocaleString("en-US")], ["Losses", p.stats.losses.toLocaleString("en-US")],
            ["Best Run", p.stats.bestRunMult ? mult(p.stats.bestRunMult) : "-"], ["Best Drop", p.stats.bestDropMult ? mult(p.stats.bestDropMult) : "-"], ["Days played", String(p.stats.activeDays)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[4px] border border-line bg-ink/60 p-2.5"><dt className="eyebrow">{k}</dt><dd className="tabular font-display text-2xl font-semibold">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-4"><ShareButton path={`/p/${p.shareId}`} title="this profile" /></div>
      </section>
      <section className="plate p-5">
        <h2 className="eyebrow">Achievements</h2>
        {p.achievements.length === 0 && <p className="mt-2 text-sm text-gray">None yet.</p>}
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {p.achievements.map((a) => (
            <li key={a.key} className="rounded-[4px] border border-gold/50 bg-gold/5 p-2.5">
              <p className="font-display text-lg font-semibold uppercase leading-tight text-gold">{a.name}</p>
              <p className="text-xs text-gray">{a.description}</p>
            </li>
          ))}
        </ul>
      </section>
      <Link href="/" className="key key-gold h-14 text-2xl">Enter the arcade</Link>
    </div>
  );
}
