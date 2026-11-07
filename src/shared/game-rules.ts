/** Economy and progression rules. Nothing here touches odds: XP and levels are cosmetic. */

/** A new player's first day. It counts as that day's claim. */
export const STARTING_CREDITS = 10_000;
export const DAILY_CREDITS = 10_000;
export const REFILL_TO = 1_000;
export const REFILL_BELOW = 100;
export const REFILLS_PER_DAY = 3;
export const REFILL_COOLDOWN_MS = 10 * 60_000;
export const MIN_STAKE = 1;
export const MAX_STAKE = 100_000;
export const QUICK_STAKES = [100, 500, 1000, 5000] as const;
export const DEFAULT_STAKE = 100;
export const MIN_AUTO_CASHOUT = 101;
export const MAX_AUTO_CASHOUT = 100_000;
export const GUESTS_PER_IP_PER_HOUR = 20;

export const XP_PER_GAME = 10;
export const XP_WIN_BONUS = 5;
/** Daily ceiling on XP from plays alone, so leaving a tap running doesn't top the XP board. */
export const PLAY_XP_DAILY_CAP = 400;

export const dayKey = (at: Date | number = Date.now()) => new Date(at).toISOString().slice(0, 10);

/** Total XP needed to reach a level. Level 1 starts at 0. */
export const xpForLevel = (level: number) => 50 * level * (level - 1);

export function levelFromXp(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, intoLevel: xp - floor, levelSpan: next - floor, nextAt: next };
}

export type AchievementDef = { key: string; name: string; description: string; xp: number; icon: string };
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_drop", name: "First Drop", description: "Drop a token through the pegboard.", xp: 25, icon: "drop" },
  { key: "first_run", name: "First Run", description: "Finish a round of Squeek Run.", xp: 25, icon: "wheel" },
  { key: "first_cashout", name: "First Cashout", description: "Cash out before the wheel stops.", xp: 25, icon: "coin" },
  { key: "games_10", name: "10 Games Played", description: "Finish 10 rounds in the arcade.", xp: 50, icon: "ten" },
  { key: "games_100", name: "100 Games Played", description: "Finish 100 rounds in the arcade.", xp: 200, icon: "hundred" },
  { key: "wheel_survivor", name: "Wheel Survivor", description: "Cash out at 5.00x or more.", xp: 75, icon: "wheel" },
  { key: "high_multiplier", name: "High Multiplier", description: "Cash out at 25.00x or more.", xp: 200, icon: "bolt" },
  { key: "long_shot", name: "Long Shot", description: "Land a drop in a slot paying 10x or more.", xp: 150, icon: "star" },
  { key: "block_catcher", name: "Block Catcher", description: "Cash out with a real Squeek block mined during your run.", xp: 100, icon: "bolt" },
  { key: "live_runner", name: "Ran With Him", description: "Start a run while the real Squeektoshi is running.", xp: 50, icon: "wheel" },
  { key: "multi_ball", name: "Full Hopper", description: "Drop 10 tokens at once.", xp: 50, icon: "drop" },
  { key: "own_squeek", name: "My Own Squeek", description: "Drop a Squeek you hold.", xp: 50, icon: "squeek" },
  { key: "squeek_collector", name: "Squeek Collector", description: "Drop 3 different Squeeks you hold.", xp: 150, icon: "squeek" },
  { key: "arcade_regular", name: "Arcade Regular", description: "Play on 5 different days.", xp: 150, icon: "calendar" },
];

export type RoundFacts = {
  game: "RUN" | "DROPS";
  won: boolean;
  cashedOut: boolean;
  resultMult: number;
  usedSqueek: boolean;
  balls: number;
  liveRun: boolean;
  blocksMined: number;
};

export type ChallengeDef = { key: string; title: string; goal: number; xp: number; counts: (r: RoundFacts) => boolean };
export const CHALLENGE_POOL: ChallengeDef[] = [
  { key: "drops_5", title: "Drop 5 tokens", goal: 5, xp: 40, counts: (r) => r.game === "DROPS" },
  { key: "drops_15", title: "Drop 15 tokens", goal: 15, xp: 80, counts: (r) => r.game === "DROPS" },
  { key: "runs_3", title: "Finish 3 Squeek Runs", goal: 3, xp: 40, counts: (r) => r.game === "RUN" },
  { key: "runs_8", title: "Finish 8 Squeek Runs", goal: 8, xp: 80, counts: (r) => r.game === "RUN" },
  { key: "cash_2x", title: "Cash out at 2.00x or more", goal: 1, xp: 50, counts: (r) => r.game === "RUN" && r.cashedOut && r.resultMult >= 200 },
  { key: "cash_3_times", title: "Cash out 3 times", goal: 3, xp: 50, counts: (r) => r.game === "RUN" && r.cashedOut },
  { key: "drop_2x", title: "Land a drop paying 2x or more", goal: 1, xp: 60, counts: (r) => r.game === "DROPS" && r.resultMult >= 200 },
  { key: "drop_many", title: "Drop 10 tokens at once", goal: 1, xp: 50, counts: (r) => r.game === "DROPS" && r.balls >= 10 },
  { key: "catch_block", title: "Cash out with a real block mined in your run", goal: 1, xp: 80, counts: (r) => r.game === "RUN" && r.cashedOut && r.blocksMined > 0 },
  { key: "squeek_drop", title: "Drop a Squeek you hold", goal: 1, xp: 40, counts: (r) => r.game === "DROPS" && r.usedSqueek },
];

/** Three challenges a day, chosen by the date so every player sees the same ones. */
export function challengesForDay(day: string): ChallengeDef[] {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619) >>> 0;
  const pool = [...CHALLENGE_POOL];
  const picked: ChallengeDef[] = [];
  while (picked.length < 3) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    picked.push(pool.splice(h % pool.length, 1)[0]);
  }
  return picked;
}

export type CosmeticDef = { key: string; name: string; color: string; level: number };
/** Token trails, unlocked by arcade level. Looks only. */
export const COSMETICS: CosmeticDef[] = [
  { key: "gold", name: "Wheel Gold", color: "#f2c230", level: 1 },
  { key: "blue", name: "Tile Blue", color: "#5b7cfa", level: 2 },
  { key: "mint", name: "Sensor Green", color: "#35d07f", level: 3 },
  { key: "rose", name: "Seed Rose", color: "#f06bae", level: 5 },
  { key: "ember", name: "Reactor Ember", color: "#f44a5e", level: 8 },
  { key: "ivory", name: "Whisker White", color: "#f5f5f7", level: 12 },
];

export const HAMSTER_AVATARS = [
  { key: "classic", name: "Squeektoshi", fur: "#f4a64a", belly: "#fff2d8" },
  { key: "dusk", name: "Night Shift", fur: "#5b7cfa", belly: "#dfe5ff" },
  { key: "mint", name: "Sensor Tech", fur: "#35d07f", belly: "#e0fff0" },
  { key: "rose", name: "Seed Keeper", fur: "#f06bae", belly: "#fbe6f1" },
] as const;

/** A token's look from its Squeek level. The physics never sees this. */
export const LEVEL_TRAILS = ["#f2c230", "#f2c230", "#ffc048", "#5b7cfa", "#35d07f", "#f06bae", "#f44a5e", "#fdfbc8", "#f7a8c9", "#ffffff", "#ffffff"];
export const trailForLevel = (level: number) => LEVEL_TRAILS[Math.max(0, Math.min(LEVEL_TRAILS.length - 1, level))];

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,18}$/;
export const fallbackName = (shareId: string) => `Squeeker-${shareId.slice(0, 4).toUpperCase()}`;
