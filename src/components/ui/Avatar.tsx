import { HAMSTER_AVATARS } from "@/shared/game-rules";

/** A hamster face, or a Squeek's art. Squeek art only ever goes through <img>. */
export function Avatar({ avatar, size = 36 }: { avatar: string; size?: number }) {
  const [kind, value] = avatar.split(":");
  if (kind === "squeek") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/nfts/${value}/image`} alt={`Squeek #${value}`} width={size} height={size} className="rounded-[4px] border border-line2 bg-ink" style={{ width: size, height: size }} />;
  }
  const h = HAMSTER_AVATARS.find((a) => a.key === value) ?? HAMSTER_AVATARS[0];
  return <HamsterFace fur={h.fur} belly={h.belly} size={size} />;
}

export function HamsterFace({ fur, belly, size }: { fur: string; belly: string; size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Hamster avatar" className="rounded-[4px] border border-line2 bg-ink">
      <circle cx="18" cy="18" r="8" fill={fur} />
      <circle cx="46" cy="18" r="8" fill={fur} />
      <circle cx="18" cy="18" r="4" fill="#f7a8c9" />
      <circle cx="46" cy="18" r="4" fill="#f7a8c9" />
      <ellipse cx="32" cy="36" rx="21" ry="20" fill={fur} />
      <ellipse cx="32" cy="44" rx="16" ry="12" fill={belly} />
      <ellipse cx="14.5" cy="42" rx="7" ry="6.5" fill={belly} />
      <ellipse cx="49.5" cy="42" rx="7" ry="6.5" fill={belly} />
      <circle cx="24" cy="32" r="3.2" fill="#0b0b0d" />
      <circle cx="40" cy="32" r="3.2" fill="#0b0b0d" />
      <circle cx="25" cy="31" r="1" fill="#fff" />
      <circle cx="41" cy="31" r="1" fill="#fff" />
      <path d="M29.5 38.5h5l-2.5 2.6z" fill="#c33346" />
      <path d="M32 41v3" stroke="#6e4a2e" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
