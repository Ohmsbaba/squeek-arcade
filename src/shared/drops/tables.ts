import data from "./tables.json";
import { BALL_COUNTS, CHUTES, type BallCount, type Chute } from "./board";

type Grid = Record<string, Record<string, number[]>>;

export const DROPS_RETURN = data.targetReturn;
export const CALIBRATION_BALLS = data.ballsPerCombination;
export const isChute = (value: unknown): value is Chute => CHUTES.includes(value as Chute);
export const isBallCount = (value: unknown): value is BallCount => BALL_COUNTS.includes(value as BallCount);
/** What each slot pays from this chute with this many tokens, as a decimal multiplier. */
export const tableFor = (chute: Chute, balls: number): number[] => (data.tables as Grid)[String(balls)][String(chute)];
/** The slot's multiplier in hundredths. */
export const slotMult = (chute: Chute, balls: number, slot: number): number => Math.round(tableFor(chute, balls)[slot] * 100);
export const chanceFor = (chute: Chute, balls: number): number[] => (data.probabilities as Grid)[String(balls)][String(chute)];
