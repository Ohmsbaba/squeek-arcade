"use client";
import { useEffect, useRef } from "react";
import { drawDots, textCols } from "./dotfont";

type Props = {
  text: string;
  height: number;
  color?: string;
  /** Unlit dots behind the characters, like a real display. */
  grid?: boolean;
  gridColor?: string;
  padCols?: number;
  className?: string;
  label?: string;
  fit?: boolean;
};

/** Crisp dot-matrix text at any size. The arcade's signature. */
export function DotText({ text, height, color = "#f2c230", grid = false, gridColor = "#22222a", padCols = 0, className, label, fit }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const pitch = height / 7;
      let cols = textCols(text) + padCols * 2;
      let cssW = cols * pitch;
      let cssH = height;
      const parent = canvas.parentElement;
      if (fit && parent && parent.clientWidth > 0 && cssW > parent.clientWidth) {
        const k = parent.clientWidth / cssW;
        cssW *= k;
        cssH *= k;
      }
      const p = cssH / 7;
      canvas.width = Math.ceil(cssW * dpr);
      canvas.height = Math.ceil(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      if (grid) {
        ctx.fillStyle = gridColor;
        ctx.beginPath();
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < 7; r++) {
            ctx.moveTo(c * p + p / 2 + p * 0.3, r * p + p / 2);
            ctx.arc(c * p + p / 2, r * p + p / 2, p * 0.3, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
      drawDots(ctx, text, padCols * p, 0, p, color);
    };
    draw();
    if (!fit) return;
    const ro = new ResizeObserver(draw);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [text, height, color, grid, gridColor, padCols, fit]);
  return <canvas ref={ref} role="img" aria-label={label ?? text} className={className} />;
}
