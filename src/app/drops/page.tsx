import type { Metadata } from "next";
import { DropsGame } from "@/components/drops/DropsGame";

export const metadata: Metadata = { title: "Squeek Drops", description: "Drop your Squeek through a physics pegboard. Every bounce is real, and where it lands is what it pays." };

export default function Page() {
  return <DropsGame />;
}
