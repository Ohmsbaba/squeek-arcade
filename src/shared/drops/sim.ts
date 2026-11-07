/**
 * The drop itself: a real rigid-body simulation in Rapier's cross-platform deterministic build.
 *
 * The fair digest sets each token's starting nudge and the small kick each peg gives. From there
 * the physics decides where tokens land, and on a multi-ball drop they knock into each other on
 * the way down. Nothing steers them toward a slot. The server runs this to settle the round, the
 * browser runs it again to draw the same fall, and anyone can run it from the revealed seed to
 * check the result. Cosmetics (art, level, trail) are not an input.
 */
import RAPIER from "@dimforge/rapier2d-deterministic-compat";
import { digestRng } from "../fairness";
import {
  BALL_RADIUS, buildPegs, buildWallBumpers, CATCH_Y, CEILING_Y, dividerXs, DIVIDER_HALF_WIDTH, DIVIDER_TOP_Y, FLOOR_Y,
  PEG_RADIUS, SAMPLE_EVERY, slotFromX, startLayout, STEP_HZ, WALL_X, type Chute,
} from "./board";

const GRAVITY = -36;
const MAX_STEPS = STEP_HZ * 45;
const SETTLE_STEPS = STEP_HZ * 0.9;
const PEG_KICK = 0.33;
const PEG_BOUNCE = 0.45;
const BALL_BOUNCE = 0.35;
/** Tokens can bridge a gap between pegs and hold each other up. A token this slow for this long is in a jam. */
const JAM_SPEED = 0.8;
const JAM_STEPS = STEP_HZ * 0.4;

// Who collides with whom: 16 bits of membership, 16 of filter.
const groups = (member: number, filter: number) => (member << 16) | filter;
const SCENERY = 0x0001;
const IN_PLAY = 0x0002;
const CAUGHT = 0x0004;

let ready: Promise<void> | null = null;
export const initPhysics = () => (ready ??= RAPIER.init());

export type DropEvent = { frame: number; ball: number; kind: "peg" | "wall" | "divider" | "floor" | "ball"; peg?: number; impact: number };
export type DropTrace = {
  balls: number;
  /** Where each token landed. */
  slots: number[];
  /** x, y, angle per token per frame: frames[(frame * balls + ball) * 3]. */
  frames: Float32Array;
  frameCount: number;
  /** The frame each token dropped into its slot. */
  catchFrames: number[];
  events: DropEvent[];
  landed: boolean;
};

type Options = { trace?: boolean };

/** Requires initPhysics() to have resolved. Fixed steps and creation order make every run identical. */
export function simulateDrop(digest: Uint8Array, chute: Chute, balls = 1, options: Options = {}): DropTrace {
  const wantTrace = options.trace ?? true;
  const rng = digestRng(digest);
  const world = new RAPIER.World({ x: 0, y: GRAVITY });
  world.timestep = 1 / STEP_HZ;
  const queue = new RAPIER.EventQueue(true);

  const kinds = new Map<number, { kind: DropEvent["kind"]; peg?: number }>();
  const fixed = (desc: RAPIER.ColliderDesc, info: { kind: DropEvent["kind"]; peg?: number }) => {
    const collider = world.createCollider(desc.setCollisionGroups(groups(SCENERY, 0xffff)));
    kinds.set(collider.handle, info);
    return collider;
  };

  buildPegs().forEach((peg, i) => {
    fixed(RAPIER.ColliderDesc.ball(PEG_RADIUS).setTranslation(peg.x, peg.y).setRestitution(PEG_BOUNCE).setFriction(0.25), { kind: "peg", peg: i });
  });
  const height = (CEILING_Y - FLOOR_Y) / 2 + 1;
  const midY = (CEILING_Y + FLOOR_Y) / 2;
  fixed(RAPIER.ColliderDesc.cuboid(0.5, height).setTranslation(-WALL_X - 0.5, midY).setRestitution(0.45).setFriction(0.1), { kind: "wall" });
  fixed(RAPIER.ColliderDesc.cuboid(0.5, height).setTranslation(WALL_X + 0.5, midY).setRestitution(0.45).setFriction(0.1), { kind: "wall" });
  fixed(RAPIER.ColliderDesc.cuboid(WALL_X + 1, 0.5).setTranslation(0, CEILING_Y + 0.5).setRestitution(0.2), { kind: "wall" });
  fixed(
    RAPIER.ColliderDesc.cuboid(WALL_X + 1, 0.5).setTranslation(0, FLOOR_Y - 0.5).setRestitution(0).setFriction(0.9)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
    { kind: "floor" },
  );
  // Wall bumpers on the rows that have no outer peg: no free lane down the side of the cabinet.
  for (const bumper of buildWallBumpers()) {
    const points = new Float32Array(bumper.points.flat());
    const hull = RAPIER.ColliderDesc.convexHull(points);
    if (hull) fixed(hull.setRestitution(0.4).setFriction(0.1), { kind: "wall" });
  }
  const dividerHalf = (DIVIDER_TOP_Y - FLOOR_Y) / 2;
  for (const x of dividerXs()) {
    fixed(
      RAPIER.ColliderDesc.cuboid(DIVIDER_HALF_WIDTH, dividerHalf).setTranslation(x, FLOOR_Y + dividerHalf).setRestitution(0.3).setFriction(0.2),
      { kind: "divider" },
    );
  }

  const tokens = startLayout(chute, balls).map((start) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.x + (rng() - 0.5) * 0.24, start.y)
        .setLinvel((rng() - 0.5) * 0.7, -0.4)
        .setAngvel((rng() - 0.5) * 7)
        .setCcdEnabled(true),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS).setRestitution(BALL_BOUNCE).setFriction(0.3).setDensity(1)
        .setCollisionGroups(groups(IN_PLAY, SCENERY | IN_PLAY))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    return { body, collider, slot: -1, catchFrame: -1, slowFor: 0, jamFor: 0, freed: false };
  });
  const byHandle = new Map(tokens.map((t, i) => [t.collider.handle, i]));

  const samples: number[] = [];
  const events: DropEvent[] = [];
  let waiting = tokens.length;
  let afterAll = 0;

  const contact = (ball: number, other: number, frame: number) => {
    const t = tokens[ball];
    const v = t.body.linvel();
    const speed = Math.sqrt(v.x * v.x + v.y * v.y);
    const hitBall = byHandle.has(other);
    const info = hitBall ? { kind: "ball" as const, peg: undefined } : kinds.get(other);
    if (!info) return;
    if (wantTrace) events.push({ frame, ball, kind: info.kind, peg: info.peg, impact: speed });
    if (info.kind === "peg" && t.slot < 0) {
      // Each peg flexes a little differently. This is where the seed keeps feeding the fall.
      t.body.applyImpulse({ x: (rng() - 0.5) * PEG_KICK * t.body.mass(), y: 0 }, true);
    }
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    if (wantTrace && step % SAMPLE_EVERY === 0) {
      for (const t of tokens) {
        const p = t.body.translation();
        samples.push(p.x, p.y, t.body.rotation());
      }
    }
    world.step(queue);

    const frame = Math.floor(step / SAMPLE_EVERY);
    queue.drainCollisionEvents((a, b, started) => {
      if (!started) return;
      const ballA = byHandle.get(a);
      const ballB = byHandle.get(b);
      if (ballA !== undefined) contact(ballA, b, frame);
      if (ballB !== undefined) contact(ballB, a, frame);
    });

    for (const t of tokens) {
      if (t.slot >= 0) continue;
      const v = t.body.linvel();
      const speed = Math.sqrt(v.x * v.x + v.y * v.y);
      // A token balanced on a peg or a wall gets knocked loose, by the seed, like a tap on the cabinet.
      t.slowFor = speed < 0.12 ? t.slowFor + 1 : 0;
      if (t.slowFor > STEP_HZ / 4) {
        t.body.applyImpulse({ x: (rng() < 0.5 ? -1 : 1) * 0.9 * t.body.mass(), y: 0.4 * t.body.mass() }, true);
        t.slowFor = 0;
      }
      // In a jam, a token stops pushing against the others and drops through on its own. Without this a
      // pile can sit on the pegs for half a minute. It changes nothing on a one-token drop.
      t.jamFor = speed < JAM_SPEED ? t.jamFor + 1 : 0;
      if (!t.freed && tokens.length > 1 && t.jamFor > JAM_STEPS) {
        t.freed = true;
        t.collider.setCollisionGroups(groups(IN_PLAY, SCENERY));
      }
      const p = t.body.translation();
      if (p.y < CATCH_Y) {
        t.slot = slotFromX(p.x);
        t.catchFrame = frame;
        waiting--;
        // Felt in the slot soaks up the fall, and a caught token gets out of the way of the next.
        t.body.setLinearDamping(4);
        t.body.setAngularDamping(3);
        t.collider.setCollisionGroups(groups(CAUGHT, SCENERY));
      }
    }
    if (waiting === 0 && ++afterAll > SETTLE_STEPS) break;
  }

  const landed = waiting === 0;
  const frames = new Float32Array(samples);
  const frameCount = frames.length / 3 / tokens.length;
  const slots = tokens.map((t) => (t.slot >= 0 ? t.slot : slotFromX(t.body.translation().x)));
  const catchFrames = tokens.map((t) => (t.catchFrame >= 0 ? t.catchFrame : Math.max(0, frameCount - 1)));
  queue.free();
  world.free();
  return { balls: tokens.length, slots, frames, frameCount, catchFrames, events, landed };
}
