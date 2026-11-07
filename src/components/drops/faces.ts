/** Canvas art with no three.js in it, so the page shell stays light. */
const FACE = [
  "..XX.......XX..",
  ".XXXX.....XXXX.",
  ".XXXXXXXXXXXXX.",
  "XXXXXXXXXXXXXXX",
  "XXX..XXXXX..XXX",
  "XXX..XXXXX..XXX",
  "XXXXXXXXXXXXXXX",
  "XXXXXXoooXXXXXX",
  "XoooXoooooXoooX",
  "XoooooooooooooX",
  ".ooooooooooooo.",
  "..ooooooooooo..",
  "....ooooooo....",
];

export function drawArcadeFace(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = "#14141a";
  ctx.fillRect(0, 0, size, size);
  const pitch = size / 19;
  const ox = (size - pitch * 15) / 2;
  const oy = (size - pitch * 13) / 2;
  FACE.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      ctx.fillStyle = ch === "X" ? "#f2c230" : "#fff2d8";
      ctx.beginPath();
      ctx.arc(ox + x * pitch + pitch / 2, oy + y * pitch + pitch / 2, pitch * 0.43, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

/** Colour by how far a slot pays. Quiet near 1x, warm as it climbs. */
export function slotColor(m: number) {
  if (m >= 100) return "#f44a5e";
  if (m >= 20) return "#ff8a3c";
  if (m >= 5) return "#ffc048";
  if (m >= 2) return "#f2c230";
  if (m >= 1) return "#35d07f";
  return "#6e7bb0";
}
