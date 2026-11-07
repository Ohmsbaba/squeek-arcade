export const credits = (n: number) => Math.round(n).toLocaleString("en-US");
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
export const mult = (h: number | null | undefined) => (h === null || h === undefined ? "-" : `${(h / 100).toFixed(2)}x`);
/** A slot's label: as short as it can be. */
export const slotLabel = (m: number) => (m >= 10 ? `${Math.round(m)}x` : `${Number(m.toFixed(m < 1 ? 2 : 1))}x`);
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
