import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { mult } from "@/client/format";
import { publicProfile } from "@/server/players";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Squeek Arcade player";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const p = await publicProfile((await params).id);
  const font = await readFile(join(process.cwd(), "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff"));
  const cell = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, border: "2px solid #26262f", padding: 22, marginRight: 16, background: "#131317" }}>
      <span style={{ fontSize: 28, color: "#82828f" }}>{label}</span>
      <span style={{ fontSize: 74, color: "#f2c230" }}>{value}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0b0b0d", color: "#ededf0", padding: 64, fontFamily: "Barlow", backgroundImage: "radial-gradient(#1f1f27 2px, transparent 2px)", backgroundSize: "28px 28px" }}>
        <div style={{ display: "flex", fontSize: 44, color: "#f2c230", letterSpacing: 2 }}>SQUEEK ARCADE</div>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 120, lineHeight: 1 }}>{p?.name ?? "Player not found"}</div>
          <div style={{ display: "flex", fontSize: 44, color: "#7c97fb", marginTop: 8 }}>{p ? `Arcade level ${p.progress.level}` : ""}</div>
        </div>
        {p && (
          <div style={{ display: "flex" }}>
            {cell("GAMES", String(p.stats.gamesPlayed))}
            {cell("BEST RUN", p.stats.bestRunMult ? mult(p.stats.bestRunMult) : "-")}
            {cell("BEST DROP", p.stats.bestDropMult ? mult(p.stats.bestDropMult) : "-")}
            {cell("BADGES", String(p.achievements.length))}
          </div>
        )}
      </div>
    ),
    { ...size, fonts: [{ name: "Barlow", data: font, weight: 600, style: "normal" }] },
  );
}
