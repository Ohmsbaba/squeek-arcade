"use client";
import { useArcade } from "@/client/store";

export function LiteToggle() {
  const lite = useArcade((s) => s.lite);
  const setLite = useArcade((s) => s.setLite);
  return (
    <button className="chip" data-on={lite} aria-pressed={lite} onClick={() => setLite(!lite)} title="Swap the 3D scene for a lighter 2D one. Same game, same rules.">
      Lite mode
    </button>
  );
}
