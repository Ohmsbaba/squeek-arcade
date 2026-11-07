/** The pegboard's geometry. The physics world and every renderer are built from these numbers. */
export const STEP_HZ = 120;
export const SAMPLE_EVERY = 2;
export const TRACE_HZ = STEP_HZ / SAMPLE_EVERY;
export const ROWS = 12;
export const SLOTS = 11;
export const ROW_GAP = 0.85;
export const WALL_X = 5.5;
export const PEG_RADIUS = 0.09;
export const BALL_RADIUS = 0.3;
export const START_Y = 1.25;
export const LAST_ROW_Y = -(ROWS - 1) * ROW_GAP;
export const DIVIDER_TOP_Y = LAST_ROW_Y - 0.5;
export const FLOOR_Y = LAST_ROW_Y - 1.65;
export const CATCH_Y = DIVIDER_TOP_Y - 0.42;
export const DIVIDER_HALF_WIDTH = 0.045;
export const CEILING_Y = START_Y + 1.2;
export const CHUTES = [-3, -2, -1, 0, 1, 2, 3] as const;
export type Chute = (typeof CHUTES)[number];
/** How many tokens leave the chute together. */
export const BALL_COUNTS = [1, 3, 5, 10] as const;
export type BallCount = (typeof BALL_COUNTS)[number];
const PER_ROW = 5;
const COLUMN_GAP = 0.66;
const ROW_RISE = 0.62;

/** Where each token starts: side by side above the chute, the second row staggered behind the first. */
export function startLayout(chute: number, balls: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let row = 0; row * PER_ROW < balls; row++) {
    const n = Math.min(PER_ROW, balls - row * PER_ROW);
    for (let i = 0; i < n; i++) {
      out.push({ x: chute + (i - (n - 1) / 2) * COLUMN_GAP + (row % 2) * 0.17, y: START_Y + row * ROW_RISE });
    }
  }
  return out;
}

export type Peg = { x: number; y: number; row: number };

export function buildPegs(): Peg[] {
  const pegs: Peg[] = [];
  for (let row = 0; row < ROWS; row++) {
    const y = -row * ROW_GAP;
    if (row % 2 === 0) for (let x = -4; x <= 4; x++) pegs.push({ x, y, row });
    else for (let x = -4.5; x <= 4.5; x++) pegs.push({ x, y, row });
  }
  return pegs;
}

/** Wedges on the walls at the rows whose outermost peg stands 1.5 away from the wall. */
export function buildWallBumpers(): { y: number; side: -1 | 1; points: [number, number][] }[] {
  const out: { y: number; side: -1 | 1; points: [number, number][] }[] = [];
  for (let row = 0; row < ROWS; row += 2) {
    const y = -row * ROW_GAP;
    for (const side of [-1, 1] as const) {
      out.push({ y, side, points: [[side * WALL_X, y + 0.42], [side * (WALL_X - 0.5), y], [side * WALL_X, y - 0.2]] });
    }
  }
  return out;
}

export const slotCenterX = (slot: number) => slot - (SLOTS - 1) / 2;
export const slotFromX = (x: number) => Math.max(0, Math.min(SLOTS - 1, Math.round(x + (SLOTS - 1) / 2)));
export const dividerXs = () => Array.from({ length: SLOTS - 1 }, (_, i) => i - (SLOTS - 2) / 2);
