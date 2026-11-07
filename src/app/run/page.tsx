import type { Metadata } from "next";
import { RunGame } from "@/components/run/RunGame";

export const metadata: Metadata = { title: "Squeek Run", description: "The wheel speeds up, the multiplier climbs, and it can stop at any moment. Cash out first." };

export default function Page() {
  return <RunGame />;
}
