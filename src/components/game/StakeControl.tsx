"use client";
import { sound } from "@/client/sound";
import { credits } from "@/client/format";
import { MAX_STAKE, MIN_STAKE, QUICK_STAKES } from "@/shared/game-rules";

export function StakeControl({ stake, setStake, balance, disabled, label = "Your bet", multiple = 1 }: { stake: number; setStake: (n: number) => void; balance: number; disabled?: boolean; label?: string; multiple?: number }) {
  const clamp = (n: number) => Math.max(MIN_STAKE, Math.min(MAX_STAKE, Math.floor(n) || MIN_STAKE));
  const over = stake * multiple > balance;
  return (
    <div>
      <label htmlFor="stake" className="eyebrow flex justify-between">
        <span>{label}</span>
        {over && <span className="text-reactor">Over your balance</span>}
      </label>
      <div className="mt-1.5 flex gap-1.5">
        <input
          id="stake"
          inputMode="numeric"
          disabled={disabled}
          className="field tabular text-lg"
          value={stake === 0 ? "" : stake}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9]/g, ""));
            setStake(Math.min(MAX_STAKE, n));
          }}
          onBlur={() => setStake(clamp(stake))}
          aria-invalid={over}
        />
        <button className="chip shrink-0" disabled={disabled} onClick={() => { sound.tick(); setStake(clamp(stake / 2)); }} aria-label="Halve stake">½</button>
        <button className="chip shrink-0" disabled={disabled} onClick={() => { sound.tick(); setStake(clamp(stake * 2)); }} aria-label="Double stake">2×</button>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {QUICK_STAKES.map((q) => (
          <button key={q} disabled={disabled} data-on={stake === q} className="chip justify-center px-0" onClick={() => { sound.tick(); setStake(q); }}>{q.toLocaleString("en-US")}</button>
        ))}
        <button disabled={disabled} className="chip justify-center px-0" onClick={() => { sound.tick(); setStake(clamp(Math.min(Math.floor(balance / multiple), MAX_STAKE))); }} title={`All in: ${credits(balance)}`}>Max</button>
      </div>
    </div>
  );
}
