"use client";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { useArcade } from "@/client/store";
import type { PublicRound } from "@/client/types";

export function useHistory(game: "RUN" | "DROPS" | undefined, bump: number, take = 12) {
  const myId = useArcade((s) => s.me?.id);
  const [rounds, setRounds] = useState<PublicRound[] | null>(null);
  useEffect(() => {
    if (!myId) return;
    let dead = false;
    api<{ rounds: PublicRound[] }>(`/api/history?take=${take}${game ? `&game=${game}` : ""}`)
      .then((r) => !dead && setRounds(r.rounds))
      .catch(() => !dead && setRounds((old) => old ?? []));
    return () => {
      dead = true;
    };
  }, [game, bump, take, myId]);
  return rounds;
}
