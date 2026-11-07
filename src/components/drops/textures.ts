"use client";
import * as THREE from "three";
import { slotLabel } from "@/client/format";
import { drawDots, textCols } from "@/components/ui/dotfont";
import { drawArcadeFace, slotColor } from "./faces";

export { drawArcadeFace, slotColor };

/** The token face. Squeek art loads through Image into a canvas, so it can never run or reach the page. */
export function loadTokenTexture(url: string): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 384;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d")!;
      // Any dimensions work: cover-crop to a square, then the coin's circular face trims the corners.
      const w = img.naturalWidth || size;
      const h = img.naturalHeight || size;
      const scale = Math.max(size / w, size / h);
      ctx.fillStyle = "#0e0e12";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      resolve(t);
    };
    img.onerror = () => reject(new Error("art failed to load"));
    img.src = url;
  });
}

let arcadeFace: THREE.CanvasTexture | null = null;
/** The default token for anyone without a Squeek: a dot-grid hamster of our own. */
export function arcadeTokenTexture() {
  if (arcadeFace) return arcadeFace;
  const size = 384;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  drawArcadeFace(c.getContext("2d")!, size);
  arcadeFace = new THREE.CanvasTexture(c);
  arcadeFace.colorSpace = THREE.SRGBColorSpace;
  return arcadeFace;
}



/** A slot's face, as a small dot-matrix display. */
export function drawSlotLabel(c: HTMLCanvasElement, m: number) {
  const W = 256;
  const H = 100;
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0c0c10";
  ctx.fillRect(0, 0, W, H);
  const color = slotColor(m);
  ctx.fillStyle = color + "22";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.fillRect(0, H - 6, W, 6);
  const label = slotLabel(m);
  const cols = textCols(label);
  const pitch = Math.min(12, (W - 14) / cols);
  drawDots(ctx, label, (W - cols * pitch) / 2, (H - 6 - pitch * 7) / 2, pitch, color, { radius: 0.5 });
}

export function dotBackplate() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 640;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#17171d";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 32; x++) {
    const fade = 0.35 + 0.65 * (y / 40);
    ctx.fillStyle = `rgba(91,124,250,${0.16 + fade * 0.2})`;
    ctx.beginPath();
    ctx.arc(8 + x * 16, 8 + y * 16, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
