"use client";
import { create } from "zustand";
import { api, ApiError } from "./api";
import { sound } from "./sound";
import type { ChallengeDone, Commit, Me, Settled, Unlock } from "./types";

type Toast = { id: number; kind: "achievement" | "challenge" | "info" | "error"; title: string; body?: string; xp?: number };

type State = {
  me: Me | null;
  error: string | null;
  /** Credits still falling: a drop is settled on the server before its token lands on screen. */
  held: number;
  toasts: Toast[];
  lite: boolean;
  /** Set during the lobby's walk into a machine. */
  portal: "drops" | "run" | null;
  load: () => Promise<void>;
  setMe: (me: Me) => void;
  setCommit: (commit: Commit) => void;
  applySettled: (s: Pick<Settled, "balance" | "unlocked" | "challengesCompleted" | "commit" | "xpGained">) => void;
  setBalance: (balance: number) => void;
  hold: (amount: number) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
  setLite: (lite: boolean) => void;
  setPortal: (p: "drops" | "run" | null) => void;
};

let toastId = 1;

export const useArcade = create<State>((set, get) => ({
  me: null,
  error: null,
  held: 0,
  toasts: [],
  lite: false,
  portal: null,
  load: async () => {
    try {
      const me = await api<Me>("/api/me");
      set({ me, error: null });
    } catch (error) {
      set({ error: error instanceof ApiError ? error.message : "The arcade can't load right now." });
    }
  },
  setMe: (me) => set({ me }),
  setCommit: (commit) => set((s) => (s.me ? { me: { ...s.me, commit } } : {})),
  setBalance: (balance) => set((s) => (s.me ? { me: { ...s.me, balance } } : {})),
  hold: (amount) => set((s) => ({ held: Math.max(0, s.held + amount) })),
  applySettled: (r) => {
    set((s) => (s.me ? { me: { ...s.me, balance: r.balance, commit: r.commit, xp: s.me.xp + r.xpGained } } : {}));
    announce(get().toast, r.unlocked, r.challengesCompleted);
    // Levels, stats and streaks are simplest re-read from the source.
    void get().load();
  },
  toast: (t) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), t.kind === "achievement" ? 5200 : 3600);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setLite: (lite) => {
    localStorage.setItem("sa_lite", lite ? "1" : "0");
    set({ lite });
  },
  setPortal: (portal) => set({ portal }),
}));

function announce(toast: State["toast"], unlocked: Unlock[], done: ChallengeDone[]) {
  for (const a of unlocked) {
    toast({ kind: "achievement", title: a.name, body: a.description, xp: a.xp });
    sound.achievement();
  }
  for (const c of done) toast({ kind: "challenge", title: "Daily challenge done", body: c.title, xp: c.xp });
}

const CLIENT_SEED_KEY = "sa_client_seed";
export function clientSeed(): string {
  let seed = localStorage.getItem(CLIENT_SEED_KEY);
  if (!seed) {
    seed = randomClientSeed();
    localStorage.setItem(CLIENT_SEED_KEY, seed);
  }
  return seed;
}
export const setClientSeed = (seed: string) => localStorage.setItem(CLIENT_SEED_KEY, seed);
export function randomClientSeed() {
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("");
}
