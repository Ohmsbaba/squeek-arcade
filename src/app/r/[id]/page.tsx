import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { mult, signed } from "@/client/format";
import { ShareButton } from "@/components/game/ShareButton";
import { sharedRound } from "@/server/players";

type Props = { params: Promise<{ id: string }> };

const headline = (r: NonNullable<Awaited<ReturnType<typeof sharedRound>>>["round"]) =>
  r.game === "RUN"
    ? r.status === "WON" ? `Cashed out at ${mult(r.resultMult)}` : `The wheel stopped at ${mult(r.crashMult)}`
    : r.balls > 1 ? `${r.balls} tokens, best ${mult(r.resultMult)}` : `Landed on ${mult(r.resultMult)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await sharedRound((await params).id);
  if (!found) return { title: "Round not found" };
  const title = `${found.player.name}: ${headline(found.round)}`;
  return { title, description: "A real round from Squeek Arcade, free points, provably fair.", openGraph: { title }, twitter: { card: "summary_large_image", title } };
}

export default async function Page({ params }: Props) {
  const found = await sharedRound((await params).id);
  if (!found) notFound();
  const { round: r, player } = found;
  const isRun = r.game === "RUN";
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-3 p-3 sm:p-6">
      <section className="plate p-6 text-center">
        <p className="eyebrow">{isRun ? "Squeek Run" : "Squeek Drops"}</p>
        <p className={`title mt-3 text-6xl ${r.status === "WON" ? "text-mint" : "text-gold"}`} data-testid="shared-mult">{mult(isRun && r.status === "LOST" ? r.crashMult : r.resultMult)}</p>
        <h1 className="mt-2 font-voice text-lg text-paper">{headline(r)}</h1>
        <p className="mt-1 text-sm text-gray">by <Link className="link" href={`/p/${player.shareId}`}>{player.name}</Link></p>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-left">
          {[["Stake", String(r.stake)], ["Paid", String(r.payout ?? 0)], ["Net", signed(r.net ?? 0)]].map(([k, v]) => (
            <div key={k} className="rounded-[4px] border border-line bg-ink/60 p-2.5"><dt className="eyebrow">{k}</dt><dd className="tabular font-data text-sm">{v}</dd></div>
          ))}
        </dl>
        {!isRun && <p className="mt-3 font-data text-xs text-gray">{r.balls > 1 ? `${r.balls} tokens, best shown` : r.tokenId ? `Squeek #${r.tokenId}, slot ${(r.slot ?? 0) + 1} of 11` : `Arcade token, slot ${(r.slot ?? 0) + 1} of 11`}</p>}
        <p className="mt-3 text-xs text-dim">Free points, no monetary value.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <ShareButton path={`/r/${r.shareId}`} title="this round" />
          <Link className="chip" href={`/fairness?round=${r.shareId}`}>Verify this round</Link>
        </div>
      </section>
      <Link href={isRun ? "/run" : "/drops"} className="key key-gold h-14 text-2xl">Play it yourself</Link>
    </div>
  );
}
