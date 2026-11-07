"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useMuted } from "@/client/env";
import { sound } from "@/client/sound";
import { useArcade } from "@/client/store";
import { ConnectModal } from "@/components/wallet/ConnectModal";
import { Avatar } from "./Avatar";
import { BalanceChip } from "./Balance";
import { Logo } from "./Logo";

function MuteButton() {
  const muted = useMuted();
  return (
    <button
      onClick={() => { sound.setMuted(!muted); if (muted) sound.click(); }}
      aria-pressed={muted}
      aria-label={muted ? "Turn sound on" : "Mute sound"}
      className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-line2 bg-panel text-lit transition-colors hover:border-gold hover:text-gold"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
        {muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
}

function Toasts() {
  const toasts = useArcade((s) => s.toasts);
  const dismiss = useArcade((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[60] flex w-[min(320px,calc(100vw-24px))] flex-col gap-2 sm:bottom-auto sm:top-[68px]" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={`plate pointer-events-auto p-3 text-left ${t.kind === "achievement" ? "border-gold" : t.kind === "error" ? "border-reactor/60" : ""}`}
          >
            {t.kind === "achievement" && <p className="eyebrow text-gold">Achievement unlocked</p>}
            <p className="font-display text-lg font-semibold uppercase leading-tight tracking-wide">{t.title}</p>
            {t.body && <p className="mt-0.5 text-xs text-lit">{t.body}</p>}
            {t.xp ? <p className="mt-1 font-data text-xs text-mint">+{t.xp} XP</p> : null}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** The walk into a machine: the lobby closes the iris, the game opens it. */
function Iris() {
  const portal = useArcade((s) => s.portal);
  const setPortal = useArcade((s) => s.setPortal);
  const path = usePathname();
  useEffect(() => {
    if (portal && path === `/${portal}`) {
      const t = setTimeout(() => setPortal(null), 120);
      return () => clearTimeout(t);
    }
  }, [path, portal, setPortal]);
  return (
    <AnimatePresence>
      {portal && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[70] bg-ink"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, delay: 0.25, ease: "easeInOut" }}
        />
      )}
    </AnimatePresence>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const me = useArcade((s) => s.me);
  const load = useArcade((s) => s.load);
  const error = useArcade((s) => s.error);
  const setLite = useArcade((s) => s.setLite);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    sound.init();
    if (localStorage.getItem("sa_lite") === "1") setLite(true);
    void load().finally(() => setBooted(true));
  }, [load, setLite]);

  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-3 sm:px-5">
          <Logo />
          <nav className="ml-5 hidden items-center gap-5 md:flex" aria-label="Main">
            {[["/drops", "Drops"], ["/run", "Run"], ["/leaderboards", "Boards"], ["/fairness", "Fairness"]].map(([href, label]) => (
              <Link key={href} href={href} className="font-display text-base font-semibold uppercase tracking-wider text-lit transition-colors hover:text-gold">{label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <BalanceChip />
            <MuteButton />
            <Link href="/profile" aria-label="Your profile" className="flex h-10 items-center gap-2 rounded-[6px] border border-line2 bg-panel pl-1 pr-1 transition-colors hover:border-gold sm:pr-3">
              {me ? <Avatar avatar={me.avatar} size={30} /> : <span className="h-[30px] w-[30px] rounded-[4px] bg-line" />}
              {me && (
                <span className="hidden flex-col leading-none sm:flex">
                  <span className="max-w-[110px] truncate font-data text-xs text-paper">{me.name}</span>
                  <span className="mt-1 font-data text-[10px] text-gold">LVL {me.progress.level}</span>
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>
      {booted && error && !me && (
        <div role="alert" className="mx-auto mt-6 max-w-lg rounded border border-reactor/50 bg-reactor/10 p-4 text-sm">
          {error} <button className="link" onClick={() => load()}>Try again</button>
        </div>
      )}
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-line px-4 py-5 text-center font-data text-[11px] leading-relaxed text-dim">
        Community-built for the Squeekchain ecosystem. Not an official Squeekchain product. Points only: free, non-redeemable, no monetary value.
        <span className="mt-1 block">Squeek data comes from Sepolia, a testnet. <Link className="link" href="/fairness">How fairness works</Link></span>
      </footer>
      <Toasts />
      <Iris />
      <ConnectModal />
    </div>
  );
}
