"use client";
import { useState } from "react";
import { sound } from "@/client/sound";

export function ShareButton({ path, title, className }: { path: string; title: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const share = async () => {
    sound.tick();
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
      window.prompt("Copy this link", url);
    }
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <button className={`chip ${className ?? ""}`} onClick={share} aria-label={`Copy link: ${title}`} data-testid="share-link">
      {state === "copied" ? "Link copied" : "Copy result link"}
    </button>
  );
}
