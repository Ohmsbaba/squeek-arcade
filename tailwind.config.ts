import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0b0d",
        raised: "#131317",
        panel: "#1a1a20",
        line: "#26262f",
        line2: "#34343f",
        dim: "#6e6e7a",
        gray: "#82828f",
        lit: "#b4b4c0",
        paper: "#ededf0",
        gold: "#f2c230",
        amber: "#ffc048",
        brass: "#a8862e",
        tile: "#5b7cfa",
        tile2: "#4460cf",
        mint: "#35d07f",
        reactor: "#f44a5e",
        rose: "#f06bae",
        cream: "#fff2d8",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        data: ["var(--font-data)", "monospace"],
        voice: ["var(--font-voice)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
