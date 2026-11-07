"use client";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { sound } from "@/client/sound";
import { useArcade } from "@/client/store";
import type { OwnedSqueek } from "@/client/types";
import { Modal } from "@/components/ui/Modal";
import { useConnectModal } from "@/components/wallet/ConnectModal";
import { trailForLevel } from "@/shared/game-rules";

type Listing = { status: "available" | "unavailable" | "no_wallet"; tokens: OwnedSqueek[] };

export function useOwnedSqueeks() {
  const wallet = useArcade((s) => s.me?.wallet);
  const [state, setState] = useState<{ loading: boolean; listing: Listing | null }>({ loading: false, listing: null });
  useEffect(() => {
    if (!wallet) {
      setState({ loading: false, listing: { status: "no_wallet", tokens: [] } });
      return;
    }
    let dead = false;
    setState({ loading: true, listing: null });
    const fromBrowser = async (): Promise<Listing> => {
      // The official API is open to browsers, but challenges this game's server. The server still checks the chain on every drop.
      const found: { tokenId: string; custody: string; level: number | null }[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page++) {
        const q = new URLSearchParams({ limit: "100" });
        if (cursor) q.set("cursor", cursor);
        const res = await fetch(`https://api.squeekchain.com/v1/accounts/${wallet.toLowerCase()}?${q}`);
        if (!res.ok) return { status: "unavailable", tokens: [] };
        const data = await res.json();
        // "unavailable" means unknown, not empty.
        if (data.status !== "available") return { status: "unavailable", tokens: [] };
        found.push(...(data.tokens ?? []));
        cursor = data.nextCursor ?? null;
        if (!cursor) break;
      }
      const tokens = await Promise.all(
        found.map(async (t) => {
          const id = Number(t.tokenId);
          const card = await api<Partial<OwnedSqueek>>(`/api/nfts/${id}/card`).catch(() => ({} as Partial<OwnedSqueek>));
          return { tokenId: id, name: card.name ?? `Squeek #${id}`, level: t.level ?? card.level ?? 1, custody: t.custody, attributes: card.attributes ?? [], imageUrl: `/api/nfts/${id}/image` } as OwnedSqueek;
        }),
      );
      tokens.sort((a, b) => b.level - a.level || a.tokenId - b.tokenId);
      return { status: "available", tokens };
    };
    api<Listing>("/api/nfts")
      .then((listing) => (listing.status === "available" ? listing : fromBrowser()))
      .catch(() => fromBrowser())
      .then((listing) => !dead && setState({ loading: false, listing }))
      .catch(() => !dead && setState({ loading: false, listing: { status: "unavailable", tokens: [] } }));
    return () => {
      dead = true;
    };
  }, [wallet]);
  return state;
}

const custodyLabel = (c: string) => (c === "staking" ? "In staking" : "In wallet");

export function SqueekPicker({ open, onClose, selected, onSelect }: { open: boolean; onClose: () => void; selected: OwnedSqueek[]; onSelect: (s: OwnedSqueek[]) => void }) {
  const { loading, listing } = useOwnedSqueeks();
  const show = useConnectModal((s) => s.show);
  const [detail, setDetail] = useState<OwnedSqueek | null>(null);
  const shown = detail ?? selected[0] ?? null;
  const isOn = (t: OwnedSqueek) => selected.some((s) => s.tokenId === t.tokenId);
  const toggle = (t: OwnedSqueek) => {
    sound.tick();
    setDetail(t);
    onSelect(isOn(t) ? selected.filter((s) => s.tokenId !== t.tokenId) : [...selected, t].slice(-10));
  };

  return (
    <Modal open={open} onClose={onClose} title="Choose your fallers" wide>
      <p className="mb-4 text-sm leading-relaxed text-lit">
        Pick as many as you like, and they take turns on a multi-ball drop. Each Squeek stays where it is: nothing is transferred, staked or locked. Level changes only the trail, and every token has the same odds.
      </p>
      <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="squeek-grid">
          <button
            onClick={() => { sound.tick(); setDetail(null); onSelect([]); onClose(); }}
            data-on={selected.length === 0}
            className="group rounded-[4px] border border-line2 bg-ink p-1.5 text-left hover:border-gold data-[on=true]:border-gold"
          >
            <ArcadeFace />
            <p className="mt-1 font-data text-[11px] text-paper">Arcade token</p>
            <p className="font-data text-[10px] text-dim">Default</p>
          </button>
          {listing?.tokens.map((t) => (
            <button
              key={t.tokenId}
              data-testid="squeek-option"
              data-on={isOn(t)}
              aria-pressed={isOn(t)}
              onMouseEnter={() => setDetail(t)}
              onFocus={() => setDetail(t)}
              onClick={() => toggle(t)}
              className="rounded-[4px] border border-line2 bg-ink p-1.5 text-left hover:border-gold data-[on=true]:border-gold"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.imageUrl} alt={t.name} loading="lazy" className="aspect-square w-full rounded-[3px] bg-panel object-cover" />
              <p className="mt-1 truncate font-data text-[11px] text-paper">#{t.tokenId}</p>
              <p className="font-data text-[10px]" style={{ color: trailForLevel(t.level) }}>Level {t.level}</p>
            </button>
          ))}
          {loading && Array.from({ length: 3 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-[4px] bg-panel" />)}
        </div>
        <div className="flex flex-col gap-3">
          {listing?.status === "no_wallet" && (
            <div className="rounded-[4px] border border-line bg-ink/60 p-3">
              <p className="text-sm text-lit">Connect a wallet to fall as your own Squeek. Everything else works without one.</p>
              <button className="key key-tile mt-3 h-10 w-full text-sm" onClick={() => { onClose(); show(); }}>Connect wallet</button>
            </div>
          )}
          {listing?.status === "unavailable" && (
            <p className="rounded-[4px] border border-amber/40 bg-amber/5 p-3 text-sm text-amber">
              The Squeekchain API can&apos;t list this wallet right now. That doesn&apos;t mean it&apos;s empty. Try again in a moment, or play the arcade token.
            </p>
          )}
          {listing?.status === "available" && listing.tokens.length === 0 && (
            <p className="rounded-[4px] border border-line bg-ink/60 p-3 text-sm text-gray">No Squeeks in this wallet on Sepolia. The arcade token plays exactly the same.</p>
          )}
          {shown && (
            <div className="rounded-[4px] border border-line bg-ink/60 p-3" data-testid="squeek-detail">
              <p className="font-display text-xl font-semibold uppercase">{shown.name}</p>
              <p className="font-data text-[11px] text-gray">Level {shown.level} · {custodyLabel(shown.custody)}</p>
              <dl className="mt-2 grid grid-cols-1 gap-0.5">
                {shown.attributes.slice(0, 7).map((a) => (
                  <div key={a.traitType} className="flex justify-between gap-2 font-data text-[10px]">
                    <dt className="text-dim">{a.traitType}</dt>
                    <dd className="truncate text-lit">{String(a.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {listing?.status === "available" && listing.tokens.length > 0 && (
            <button className="key key-gold h-10 w-full text-base" data-testid="picker-done" onClick={onClose}>
              {selected.length ? `Use ${selected.length} Squeek${selected.length > 1 ? "s" : ""}` : "Use the arcade token"}
            </button>
          )}
          <p className="text-[11px] leading-snug text-dim">Sepolia testnet Squeeks. Ownership is read from the contract each time you drop one. It needs no approval and costs no gas.</p>
        </div>
      </div>
    </Modal>
  );
}

export function ArcadeFace({ size }: { size?: number }) {
  return (
    <svg viewBox="0 0 19 19" className="aspect-square rounded-[3px] bg-[#14141a]" style={size ? { width: size, height: size } : { width: "100%" }} role="img" aria-label="Arcade token">
      {["..XX.......XX..", ".XXXX.....XXXX.", ".XXXXXXXXXXXXX.", "XXXXXXXXXXXXXXX", "XXX..XXXXX..XXX", "XXX..XXXXX..XXX", "XXXXXXXXXXXXXXX", "XXXXXXoooXXXXXX", "XoooXoooooXoooX", "XoooooooooooooX", ".ooooooooooooo.", "..ooooooooooo..", "....ooooooo...."].flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === "." ? null : <circle key={`${x}-${y}`} cx={2 + x + 0.5} cy={3 + y + 0.5} r={0.43} fill={ch === "X" ? "#f2c230" : "#fff2d8"} />,
        ),
      )}
    </svg>
  );
}
