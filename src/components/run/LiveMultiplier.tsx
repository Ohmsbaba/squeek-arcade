"use client";
/** The big dot-matrix multiplier. Redrawn straight onto a canvas each frame, outside React. */
import { useEffect, useRef, type MutableRefObject } from "react";
import { drawDots, textCols } from "@/components/ui/dotfont";
import type { RunLive } from "./useRunGame";

export function LiveMultiplier({ live, height = 64 }: { live: MutableRefObject<RunLive>; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = "";
    const draw = () => {
      const canvas = ref.current;
      const l = live.current;
      if (canvas) {
        let text: string;
        if (l.phase === "countdown") text = String(Math.max(1, Math.ceil(l.countdown)));
        else if (l.phase === "idle" || l.phase === "starting") text = "1.00x";
        else text = `${l.mult.toFixed(2)}x`;
        const color = l.phase === "won" ? "#35d07f" : l.phase === "lost" ? "#f44a5e" : l.phase === "overtime" ? "#7c97fb" : l.phase === "missed" ? "#9aa6d8" : l.phase === "countdown" ? "#5b7cfa" : l.phase === "running" ? "#f2c230" : "#b4b4c0";
        const key = `${text}|${color}|${height}`;
        if (key !== last) {
          last = key;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const pitch = height / 7;
          const cols = Math.max(textCols("00.00x"), textCols(text));
          const w = cols * pitch;
          canvas.width = Math.ceil(w * dpr);
          canvas.height = Math.ceil(height * dpr);
          canvas.style.width = `${w}px`;
          canvas.style.height = `${height}px`;
          const ctx = canvas.getContext("2d")!;
          ctx.scale(dpr, dpr);
          ctx.fillStyle = "#1c1c23";
          ctx.beginPath();
          for (let c = 0; c < cols; c++) for (let r = 0; r < 7; r++) {
            const x = c * pitch + pitch / 2;
            const y = r * pitch + pitch / 2;
            ctx.moveTo(x + pitch * 0.32, y);
            ctx.arc(x, y, pitch * 0.32, 0, Math.PI * 2);
          }
          ctx.fill();
          const tw = textCols(text) * pitch;
          drawDots(ctx, text, (w - tw) / 2, 0, pitch, color, { glow: l.phase === "running" ? 7 : 0 });
          if (label.current) label.current.textContent = text;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live, height]);

  return (
    <div className="inline-flex rounded-[6px] border border-line2 bg-[#0d0d11]/90 px-3 py-2 shadow-[0_10px_30px_-10px_#000]" data-testid="multiplier">
      <canvas ref={ref} aria-hidden />
      <span ref={label} className="sr-only" aria-live="off" data-testid="multiplier-text" />
    </div>
  );
}
