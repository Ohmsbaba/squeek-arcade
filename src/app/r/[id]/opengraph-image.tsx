import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { mult } from "@/client/format";
import { sharedRound } from "@/server/players";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Squeek Arcade result";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const found = await sharedRound((await params).id);
  const font = await readFile(join(process.cwd(), "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff"));
  const r = found?.round;
  const isRun = r?.game === "RUN";
  const big = r ? mult(isRun && r.status === "LOST" ? r.crashMult : r.resultMult) : "-";
  const line = !r ? "Round not found" : isRun ? (r.status === "WON" ? "Cashed out before the wheel stopped" : "The wheel stopped first") : r.balls > 1 ? `${r.balls} tokens dropped, best shown` : `Slot ${(r.slot ?? 0) + 1} of 11`;
  const color = r?.status === "WON" ? "#35d07f" : "#f2c230";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0b0b0d", color: "#ededf0", padding: 64, fontFamily: "Barlow", backgroundImage: "radial-gradient(#1f1f27 2px, transparent 2px)", backgroundSize: "28px 28px" }}>
        <div style={{ display: "flex", fontSize: 44, color: "#f2c230", letterSpacing: 2 }}>SQUEEK ARCADE</div>
        <div style={{ display: "flex", fontSize: 34, color: "#82828f", marginTop: 6 }}>{isRun ? "SQUEEK RUN" : "SQUEEK DROPS"}</div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 240, color, lineHeight: 1 }}>{big}</div>
        <div style={{ display: "flex", fontSize: 44 }}>{line}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#82828f", marginTop: 14 }}>
          <span>{found?.player.name ?? ""}</span>
          <span>Free points. Provably fair.</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Barlow", data: font, weight: 600, style: "normal" }] },
  );
}
