"use client";
/** The same game for devices without WebGL, and for anyone who picks Lite mode. Drawn with SVG. */
import { useEffect, useRef, type MutableRefObject } from "react";
import type { RunLive } from "./useRunGame";

export default function RunFallback({ live, reduced }: { live: MutableRefObject<RunLive>; reduced: boolean }) {
  const wheel = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const state = useRef({ angle: 0, omega: 0 });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const raw = live.current;
      const l = { ...raw, phase: raw.phase === "overtime" ? "running" : raw.phase === "missed" ? "lost" : raw.phase };
      const mirror = l.phase === "idle" || l.phase === "starting" ? Math.min(14, (l.realRpm * Math.PI * 2) / 60) : 0;
      const target = l.phase === "running" ? Math.min(30, 4 + 7 * Math.log(Math.max(1, l.mult))) : mirror;
      const rate = l.phase === "lost" ? 14 : l.phase === "won" ? 1.3 : 3;
      state.current.omega += (target - state.current.omega) * Math.min(1, dt * rate);
      state.current.angle -= state.current.omega * dt;
      wheel.current?.setAttribute("transform", `rotate(${(state.current.angle * 180) / Math.PI} 200 170)`);
      if (body.current) {
        const bob = l.phase === "running" && !reduced ? Math.abs(Math.sin(now / (70 - Math.min(45, state.current.omega * 1.6)))) * 5 : 0;
        const hop = l.phase === "won" && !reduced ? Math.abs(Math.sin(now / 120)) * 16 : 0;
        body.current.setAttribute("transform", `translate(0 ${-bob - hop})`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, reduced]);

  return (
    <svg viewBox="0 0 400 340" className="h-full w-full" role="img" aria-label="Squeektoshi running in the wheel">
      <defs>
        <pattern id="wall" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="8" r="1.4" fill="#26262f" />
        </pattern>
      </defs>
      <rect width="400" height="340" fill="#0e0e12" />
      <rect width="400" height="340" fill="url(#wall)" />
      <rect x="120" y="300" width="160" height="10" fill="#26262f" />
      <rect x="194" y="170" width="12" height="134" fill="#26262f" />
      <g ref={wheel}>
        <circle cx="200" cy="170" r="125" fill="none" stroke="#8a8c98" strokeWidth="7" />
        <circle cx="200" cy="170" r="113" fill="none" stroke="#c9a23a" strokeWidth="9" strokeDasharray="3 12" />
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} x1="200" y1="170" x2={200 + Math.cos((i * Math.PI) / 3) * 122} y2={170 + Math.sin((i * Math.PI) / 3) * 122} stroke="#3a3a46" strokeWidth="4" />
        ))}
        <circle cx="200" cy="170" r="12" fill="#c9a23a" />
        <rect x="192" y="38" width="16" height="10" fill="#f44a5e" />
      </g>
      <g ref={body}>
        <ellipse cx="195" cy="255" rx="42" ry="28" fill="#ee9a3f" />
        <ellipse cx="205" cy="263" rx="30" ry="18" fill="#fff3df" />
        <circle cx="235" cy="242" r="21" fill="#ee9a3f" />
        <circle cx="244" cy="250" r="13" fill="#fff3df" />
        <circle cx="228" cy="224" r="6" fill="#ee9a3f" />
        <circle cx="228" cy="224" r="3" fill="#f6a9bd" />
        <circle cx="241" cy="238" r="3" fill="#1b1214" />
        <circle cx="255" cy="247" r="2.4" fill="#f6a9bd" />
      </g>
    </svg>
  );
}
