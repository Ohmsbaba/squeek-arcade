"use client";
/** The pegboard without WebGL: the same trace, drawn on a 2D canvas. */
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { sound } from "@/client/sound";
import { slotLabel } from "@/client/format";
import { BALL_RADIUS, buildPegs, CHUTES, DIVIDER_TOP_Y, dividerXs, FLOOR_Y, PEG_RADIUS, slotCenterX, startLayout, START_Y, TRACE_HZ, WALL_X, type Chute } from "@/shared/drops/board";
import { drawArcadeFace, slotColor } from "./faces";
import type { DropsLive } from "./useDropsGame";

export default function DropsFallback({ live, chute, setChute, table, previewArt, balls }: { live: MutableRefObject<DropsLive>; chute: Chute; setChute: (c: Chute) => void; table: number[]; previewArt: string; balls: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pegs = useMemo(() => buildPegs(), []);
  const hits = useRef(new Float32Array(pegs.length));
  const faces = useRef(new Map<string, CanvasImageSource>());
  const propsRef = useRef({ chute, table, balls });
  propsRef.current = { chute, table, balls };

  const face = (art: string): CanvasImageSource => {
    let f = faces.current.get(art);
    if (!f) {
      if (art === "arcade") {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        drawArcadeFace(c.getContext("2d")!, 128);
        f = c;
      } else {
        const img = new Image();
        img.src = art;
        f = img;
      }
      faces.current.set(art, f);
    }
    return f;
  };

  useEffect(() => {
    let raf = 0;
    const cursors = new Map<string, number>();
    const draw = () => {
      const canvas = ref.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        if (canvas.width !== Math.round(W * dpr)) {
          canvas.width = Math.round(W * dpr);
          canvas.height = Math.round(H * dpr);
        }
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#0e0e12";
        ctx.fillRect(0, 0, W, H);
        const worldH = START_Y + 1.2 - FLOOR_Y + 0.9;
        const scale = Math.min(W / (WALL_X * 2 + 0.4), H / worldH);
        const ox = W / 2;
        const oy = (H - worldH * scale) / 2 + (START_Y + 1.2) * scale;
        const sx = (x: number) => ox + x * scale;
        const sy = (y: number) => oy - y * scale;
        ctx.strokeStyle = "#34343f";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx(-WALL_X), sy(START_Y + 1.2), WALL_X * 2 * scale, (START_Y + 1.2 - FLOOR_Y) * scale);
        pegs.forEach((p, i) => {
          hits.current[i] = Math.max(0, hits.current[i] - 0.05);
          ctx.fillStyle = hits.current[i] > 0 ? "#f2c230" : "#8d8f9b";
          ctx.beginPath();
          ctx.arc(sx(p.x), sy(p.y), Math.max(1.5, PEG_RADIUS * scale), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = "#8d8f9b";
        for (const x of dividerXs()) ctx.fillRect(sx(x) - 1, sy(DIVIDER_TOP_Y), 2, (DIVIDER_TOP_Y - FLOOR_Y) * scale);
        ctx.textAlign = "center";
        ctx.font = `600 ${Math.max(8, scale * 0.3)}px monospace`;
        propsRef.current.table.forEach((m, i) => {
          ctx.fillStyle = slotColor(m);
          ctx.fillText(slotLabel(m), sx(slotCenterX(i)), sy(FLOOR_Y - 0.45));
        });
        for (const c of CHUTES) {
          ctx.fillStyle = c === propsRef.current.chute ? "#f2c230" : "#34343f";
          ctx.beginPath();
          ctx.arc(sx(c), sy(START_Y + 0.75), Math.max(2, scale * 0.09), 0, Math.PI * 2);
          ctx.fill();
        }
        const coin = (x: number, y: number, a: number, art: string) => {
          const r = BALL_RADIUS * scale;
          ctx.save();
          ctx.translate(sx(x), sy(y));
          ctx.rotate(-a);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.clip();
          try {
            ctx.drawImage(face(art), -r, -r, r * 2, r * 2);
          } catch {
            ctx.fillStyle = "#f2c230";
            ctx.fill();
          }
          ctx.restore();
          ctx.strokeStyle = "#c9a23a";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx(x), sy(y), r, 0, Math.PI * 2);
          ctx.stroke();
        };
        for (const p of startLayout(propsRef.current.chute, propsRef.current.balls)) coin(p.x, p.y, 0, previewArt);
        const now = performance.now();
        for (const d of [...live.current.drops]) {
          const tr = d.trace;
          const n = tr.balls;
          const f = Math.min(tr.frameCount - 1, ((now - d.startedAt) / 1000) * TRACE_HZ * d.rate);
          const i0 = Math.floor(f);
          for (let ball = 0; ball < n; ball++) {
            const caughtFor = (f - tr.catchFrames[ball]) / TRACE_HZ;
            if (caughtFor < 0.7) coin(tr.frames[(i0 * n + ball) * 3], tr.frames[(i0 * n + ball) * 3 + 1], tr.frames[(i0 * n + ball) * 3 + 2], d.arts[ball]);
            if (caughtFor >= 0 && !d.caught[ball]) live.current.onBallLand(d, ball);
          }
          let cur = cursors.get(d.id) ?? 0;
          while (cur < tr.events.length && tr.events[cur].frame <= f) {
            const e = tr.events[cur++];
            if (e.kind === "peg" && e.peg !== undefined) {
              hits.current[e.peg] = 1;
              sound.peg(pegs[e.peg].row, e.impact);
            }
          }
          cursors.set(d.id, cur);
          if (d.landed && !d.finished && ((now - d.startedAt) / 1000) * d.rate > tr.frameCount / TRACE_HZ) {
            d.finished = true;
            live.current.onFinish(d);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live, pegs, previewArt]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full touch-none"
      role="img"
      aria-label="Pegboard"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const scale = Math.min(rect.width / (WALL_X * 2 + 0.4), rect.height / (START_Y + 1.2 - FLOOR_Y + 0.9));
        const x = (e.clientX - rect.left - rect.width / 2) / scale;
        const pickY = e.clientY - rect.top;
        if (pickY > rect.height * 0.25) return;
        const c = Math.max(-3, Math.min(3, Math.round(x))) as Chute;
        setChute(c);
      }}
    />
  );
}
