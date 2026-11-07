"use client";
import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { Particles, type ParticleBurst } from "@/components/three/Particles";
import { radialTexture } from "@/components/three/Wheel";
import {
  BALL_RADIUS, buildPegs, buildWallBumpers, CHUTES, DIVIDER_HALF_WIDTH, DIVIDER_TOP_Y, dividerXs, FLOOR_Y, PEG_RADIUS, slotCenterX, SLOTS, startLayout, START_Y, TRACE_HZ, WALL_X, type Chute,
} from "@/shared/drops/board";
import { sound } from "@/client/sound";
import { arcadeTokenTexture, dotBackplate, drawSlotLabel, loadTokenTexture, slotColor } from "./textures";
import type { ActiveDrop, DropsLive } from "./useDropsGame";

const CENTER_Y = (START_Y + FLOOR_Y) / 2;
const TRAIL = 14;
const MAX_TOKENS = 30;

type Props = {
  live: MutableRefObject<DropsLive>;
  chute: Chute;
  setChute: (c: Chute) => void;
  table: number[];
  /** One per token waiting in the chute. */
  previewArts: string[];
  previewTrail: string;
  balls: number;
  reduced: boolean;
};

const textures = new Map<string, Promise<THREE.Texture>>();
function textureFor(art: string) {
  if (art === "arcade") return Promise.resolve(arcadeTokenTexture() as THREE.Texture);
  let t = textures.get(art);
  if (!t) {
    t = loadTokenTexture(art).catch(() => arcadeTokenTexture());
    textures.set(art, t);
  }
  return t;
}

/** A token waiting in the chute, wearing the art it'll fall with. */
function PreviewCoin({ art, position, geometry }: { art: string; position: [number, number, number]; geometry: THREE.BufferGeometry }) {
  const face = useRef<THREE.MeshStandardMaterial>(null);
  useEffect(() => {
    let dead = false;
    void textureFor(art).then((t) => {
      if (!dead && face.current) {
        face.current.map = t;
        face.current.needsUpdate = true;
      }
    });
    return () => {
      dead = true;
    };
  }, [art]);
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]} geometry={geometry}>
      <meshStandardMaterial attach="material-0" color="#c9a23a" metalness={0.95} roughness={0.28} />
      <meshStandardMaterial ref={face} attach="material-1" color="#ffffff" roughness={0.42} />
      <meshStandardMaterial attach="material-2" color="#3a3a44" />
    </mesh>
  );
}

/** One coin: art on both faces, brass rim. Reused from a pool so rapid drops don't allocate. */
function useCoinGeometry() {
  return useMemo(() => new THREE.CylinderGeometry(BALL_RADIUS, BALL_RADIUS, 0.13, 40), []);
}

type TokenSlot = { group: THREE.Group; faceMat: THREE.MeshStandardMaterial; rimMat: THREE.MeshStandardMaterial; trail: THREE.InstancedMesh; glow: THREE.Sprite; owner: ActiveDrop | null; ball: number; eventCursor: number };

function Board({ live, chute, setChute, table, previewArts, previewTrail, balls, reduced }: Props) {
  const { camera, size } = useThree();
  const pegs = useMemo(() => buildPegs(), []);
  const bumpers = useMemo(() => buildWallBumpers(), []);
  const dividers = useMemo(() => dividerXs(), []);
  const pegMesh = useRef<THREE.InstancedMesh>(null);
  const pegHeat = useRef(new Float32Array(pegs.length));
  const pegColor = useMemo(() => new THREE.Color(), []);
  const pegBase = useMemo(() => new THREE.Color("#e4e5ee"), []);
  const pegHot = useRef(new THREE.Color("#f2c230"));
  const sparks = useRef<ParticleBurst>(null);
  const coins = useRef<ParticleBurst>(null);
  const slotLights = useRef<(THREE.Mesh | null)[]>([]);
  const slotHeat = useRef(new Float32Array(SLOTS));
  const slotTex = useRef<THREE.CanvasTexture[]>([]);
  const carriage = useRef<THREE.Group>(null);
  const carriageX = useRef<number>(chute);
  const previewBob = useRef<THREE.Group>(null);
  const sweep = useRef<THREE.PointLight>(null);
  const followY = useRef(CENTER_Y);
  const followX = useRef(0);
  const landKick = useRef(0);
  const coinGeo = useCoinGeometry();
  const glowTex = useMemo(() => radialTexture(), []);
  const backplate = useMemo(() => dotBackplate(), []);
  const bumperGeos = useMemo(
    () =>
      bumpers.map((b) => {
        const s = new THREE.Shape(b.points.map(([x, y]) => new THREE.Vector2(x, y)));
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.34, bevelEnabled: false });
        g.translate(0, 0, -0.17);
        return g;
      }),
    [bumpers],
  );

  const tokenRoot = useRef<THREE.Group>(null);
  const pool = useRef<TokenSlot[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Build the pool once.
  useEffect(() => {
    const root = tokenRoot.current;
    if (!root || pool.current.length) return;
    const trailGeo = new THREE.CircleGeometry(1, 16);
    for (let i = 0; i < MAX_TOKENS; i++) {
      const group = new THREE.Group();
      group.visible = false;
      const rimMat = new THREE.MeshStandardMaterial({ color: "#c9a23a", metalness: 0.95, roughness: 0.28 });
      const faceMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.42, metalness: 0.05 });
      const coin = new THREE.Mesh(coinGeo, [rimMat, faceMat, faceMat]);
      coin.rotation.x = Math.PI / 2;
      group.add(coin);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(1.5, 1.5, 1);
      group.add(glow);
      const trail = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), TRAIL);
      trail.frustumCulled = false;
      trail.visible = false;
      root.add(trail);
      root.add(group);
      pool.current.push({ group, faceMat, rimMat, trail, glow, owner: null, ball: 0, eventCursor: 0 });
    }
  }, [coinGeo, glowTex]);

  // Slot faces follow the chute: each chute has its own table, all at the same long-run return.
  useEffect(() => {
    table.forEach((m, i) => {
      let tex = slotTex.current[i];
      if (!tex) {
        tex = new THREE.CanvasTexture(document.createElement("canvas"));
        tex.colorSpace = THREE.SRGBColorSpace;
        slotTex.current[i] = tex;
        const mesh = slotLights.current[i];
        if (mesh) {
          (mesh.material as THREE.MeshStandardMaterial).map = tex;
          (mesh.material as THREE.MeshStandardMaterial).emissiveMap = tex;
          (mesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      }
      drawSlotLabel(tex.image as HTMLCanvasElement, m);
      tex.needsUpdate = true;
    });
  }, [table]);

  useEffect(() => {
    const m = pegMesh.current;
    if (!m) return;
    pegs.forEach((p, i) => {
      dummy.position.set(p.x, p.y, 0);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, pegBase);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [pegs, dummy, pegBase]);

  useFrame((state, dt) => {
    const clamp = Math.min(dt, 0.05);
    const now = performance.now();
    const t = state.clock.elapsedTime;

    // Claim a coin for every token that doesn't have one.
    for (const d of live.current.drops) {
      for (let ball = 0; ball < d.trace.balls; ball++) {
        if (pool.current.some((s) => s.owner === d && s.ball === ball)) continue;
        const slot = pool.current.find((s) => !s.owner);
        if (!slot) continue;
        slot.owner = d;
        slot.ball = ball;
        slot.eventCursor = 0;
        slot.group.visible = true;
        slot.group.scale.setScalar(1);
        slot.faceMat.map = null;
        slot.faceMat.needsUpdate = true;
        const b = ball;
        void textureFor(d.arts[b]).then((tex) => {
          if (slot.owner === d && slot.ball === b) {
            slot.faceMat.map = tex;
            slot.faceMat.needsUpdate = true;
          }
        });
        slot.rimMat.color.set(d.levels[b] >= 4 ? d.trails[b] : "#c9a23a");
        (slot.trail.material as THREE.MeshBasicMaterial).color.set(d.trails[b]);
        (slot.glow.material as THREE.SpriteMaterial).color.set(d.trails[b]);
        slot.trail.visible = !reduced;
      }
    }

    let lowest = Infinity;
    let lowestX = 0;
    let falling = 0;
    const seenDrops = new Set<ActiveDrop>();
    for (const slot of pool.current) {
      const d = slot.owner;
      if (!d) continue;
      seenDrops.add(d);
      const tr = d.trace;
      const ball = slot.ball;
      const n = tr.balls;
      const f = Math.min(tr.frameCount - 1, ((now - d.startedAt) / 1000) * TRACE_HZ * d.rate);
      const i0 = Math.floor(f);
      const i1 = Math.min(tr.frameCount - 1, i0 + 1);
      const k = f - i0;
      const at = (frame: number, axis: number) => tr.frames[(frame * n + ball) * 3 + axis];
      const x = at(i0, 0) + (at(i1, 0) - at(i0, 0)) * k;
      const y = at(i0, 1) + (at(i1, 1) - at(i0, 1)) * k;
      slot.group.position.set(x, y, 0);
      slot.group.rotation.z = at(i0, 2);
      const caught = f >= tr.catchFrames[ball];
      if (!caught) {
        falling++;
        if (y < lowest) {
          lowest = y;
          lowestX = x;
        }
      }
      const glowMat = slot.glow.material as THREE.SpriteMaterial;
      glowMat.opacity = d.levels[ball] >= 2 ? Math.min(0.5, 0.12 + d.levels[ball] * 0.05) : 0.1;

      // Trail: the token's own recent positions from the trace.
      if (!reduced) {
        for (let t2 = 0; t2 < TRAIL; t2++) {
          const fp = Math.max(0, i0 - t2 * 2);
          const fade = 1 - t2 / TRAIL;
          dummy.position.set(at(fp, 0), at(fp, 1), -0.09);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(caught ? 0 : BALL_RADIUS * (0.25 + fade * 0.6));
          dummy.updateMatrix();
          slot.trail.setMatrixAt(t2, dummy.matrix);
        }
        slot.trail.instanceMatrix.needsUpdate = true;
      }

      // Everything the physics hit, played back as it happens.
      while (slot.eventCursor < tr.events.length && tr.events[slot.eventCursor].frame <= f) {
        const e = tr.events[slot.eventCursor++];
        if (e.ball !== ball) continue;
        if (e.kind === "peg" && e.peg !== undefined) {
          pegHeat.current[e.peg] = 1;
          pegHot.current.set(d.trails[ball]);
          sound.peg(pegs[e.peg].row, e.impact);
          if (!reduced && e.impact > 3) sparks.current?.burst({ x: pegs[e.peg].x, y: pegs[e.peg].y, z: 0.1, count: 3, color: d.trails[ball], speed: 2.2, life: 0.32, size: 0.022, gravity: 5 });
        } else if (e.kind === "ball") {
          sound.knock();
          if (!reduced) sparks.current?.burst({ x, y, z: 0.15, count: 2, color: "#fff2d8", speed: 2.6, life: 0.25, size: 0.02, gravity: 4 });
        }
      }

      // It's in the slot: this is the reveal, one token at a time.
      if (caught && !d.caught[ball]) {
        const res = d.settled.round;
        const s = res.slots[ball] ?? tr.slots[ball];
        slotHeat.current[s] = 1;
        landKick.current = Math.max(landKick.current, n > 1 ? 0.35 : 1);
        const m = table[s] ?? 1;
        const color = slotColor(m);
        const count = reduced ? 0 : Math.min(n > 1 ? 30 : 70, 8 + Math.round(Math.log2(Math.max(1, m * 2)) * 11));
        sparks.current?.burst({ x: slotCenterX(s), y: FLOOR_Y + 0.5, z: 0.3, count, color, speed: 3 + Math.min(7, m / 2), spread: 1.3, life: 0.9, size: 0.035 });
        if (m >= 2 && !reduced) coins.current?.burst({ x: slotCenterX(s), y: FLOOR_Y + 0.7, z: 0.4, count: Math.min(40, Math.round(m * 3)), color: "#f2c230", speed: 6 + Math.min(6, m / 3), spread: 1, life: 1.3, size: 0.09, gravity: 14 });
        live.current.onBallLand(d, ball);
      }
      // A caught token settles, then sinks away so the slot stays clear.
      if (caught) {
        const since = (f - tr.catchFrames[ball]) / TRACE_HZ;
        slot.group.scale.setScalar(Math.max(0.001, 1 - Math.max(0, since - 0.35) * 2.6));
      }
    }
    // A drop is done when its last frame has played.
    for (const d of seenDrops) {
      if (d.finished) continue;
      const elapsed = ((now - d.startedAt) / 1000) * d.rate;
      if (d.landed && elapsed > d.trace.frameCount / TRACE_HZ) {
        d.finished = true;
        for (const slot of pool.current) {
          if (slot.owner !== d) continue;
          slot.owner = null;
          slot.group.visible = false;
          slot.group.scale.setScalar(1);
          slot.trail.visible = false;
        }
        live.current.onFinish(d);
      }
    }

    // Peg heat decays back to steel.
    const m = pegMesh.current;
    if (m) {
      let changed = false;
      const heat = pegHeat.current;
      for (let i = 0; i < heat.length; i++) {
        if (heat[i] > 0) {
          heat[i] = Math.max(0, heat[i] - clamp * 2.6);
          pegColor.copy(pegBase).lerp(pegHot.current, heat[i]).multiplyScalar(1 + heat[i] * 2.4);
          m.setColorAt(i, pegColor);
          changed = true;
        }
      }
      if (changed && m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    slotLights.current.forEach((mesh, i) => {
      if (!mesh) return;
      slotHeat.current[i] = Math.max(0, slotHeat.current[i] - clamp * 0.9);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.75 + slotHeat.current[i] * 3.5 + (reduced ? 0 : Math.sin(t * 1.6 + i * 0.7) * 0.06);
    });

    // The chute carriage slides to the chosen spot, with a token waiting in it.
    carriageX.current += (chute - carriageX.current) * Math.min(1, clamp * 12);
    if (carriage.current) carriage.current.position.x = carriageX.current;
    if (previewBob.current) {
      previewBob.current.position.y = reduced ? 0 : Math.sin(t * 2.4) * 0.05;
      previewBob.current.rotation.y = reduced ? 0 : Math.sin(t * 0.9) * 0.35;
    }
    if (sweep.current) {
      sweep.current.position.x = reduced ? 0 : Math.sin(t * 0.35) * 5;
    }

    // A camera that frames the whole board on any screen, drifts down with the fall, and settles.
    landKick.current = Math.max(0, landKick.current - clamp * 2);
    const aspect = size.width / Math.max(1, size.height);
    const boardH = START_Y + 1.1 - FLOOR_Y + 0.5;
    const boardW = WALL_X * 2 + 1;
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
    const fitH = boardH / 2 / Math.tan(fov / 2);
    const fitW = boardW / 2 / (Math.tan(fov / 2) * aspect);
    const dist = Math.max(fitH, fitW) + 0.7;
    const active = lowest !== Infinity && !reduced;
    // One token in the air gets the close-up, so you can see whose Squeek it is. A crowd gets the whole board.
    const closeUp = active && falling === 1;
    const zoom = closeUp ? 0.68 : 1;
    const zoomed = dist * zoom;
    // Stay on the board: the closer in, the further the view can travel without showing past its edges.
    const roomY = (boardH / 2) * (1 - zoom);
    const roomX = (boardW / 2) * (1 - zoom);
    const targetFollow = active ? THREE.MathUtils.clamp(lowest, CENTER_Y - roomY, CENTER_Y + roomY) : CENTER_Y;
    const targetX = active ? THREE.MathUtils.clamp(lowestX, -roomX, roomX) : 0;
    followY.current += (targetFollow - followY.current) * Math.min(1, clamp * 3.2);
    followX.current += (targetX - followX.current) * Math.min(1, clamp * 3.2);
    const kick = reduced ? 0 : landKick.current;
    const drift = reduced ? 0 : Math.sin(t * 0.2) * 0.4;
    camera.position.x += (followX.current + drift - camera.position.x) * Math.min(1, clamp * 2.6);
    camera.position.y += (followY.current + 0.4 - camera.position.y) * Math.min(1, clamp * 3);
    camera.position.z += (zoomed - kick * 0.25 - camera.position.z) * Math.min(1, clamp * 2.2);
    camera.lookAt(followX.current, followY.current, 0);
  });

  const pickChute = (e: ThreeEvent<PointerEvent>, c: Chute) => {
    e.stopPropagation();
    if (c !== chute) {
      sound.tick();
      setChute(c);
    }
  };

  const height = START_Y + 1.3 - FLOOR_Y;

  return (
    <>
      <color attach="background" args={["#0a0a0d"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 10]} intensity={1.8} color="#fff2d8" />
      <pointLight ref={sweep} position={[0, -3, 3.5]} intensity={7} distance={12} color="#7c97fb" />
      <pointLight position={[0, FLOOR_Y + 0.4, 2.4]} intensity={10} distance={8} color="#ffc048" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#fff2d8" position={[0, 4, 4]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#5b7cfa" position={[-6, -2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#ffc048" position={[6, -4, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[8, 4, 1]} />
      </Environment>

      {/* Backplate */}
      <mesh position={[0, CENTER_Y, -0.32]}>
        <planeGeometry args={[WALL_X * 2, height]} />
        <meshStandardMaterial map={backplate} roughness={0.75} metalness={0.25} />
      </mesh>

      {/* Cabinet frame */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WALL_X + 0.17), CENTER_Y, 0]}>
          <boxGeometry args={[0.34, height + 0.5, 0.95]} />
          <meshStandardMaterial color="#3a3a45" metalness={0.65} roughness={0.42} />
        </mesh>
      ))}
      <mesh position={[0, START_Y + 1.45, 0]}>
        <boxGeometry args={[WALL_X * 2 + 0.68, 0.34, 0.95]} />
        <meshStandardMaterial color="#3a3a45" metalness={0.65} roughness={0.42} />
      </mesh>
      <mesh position={[0, FLOOR_Y - 0.2, 0]}>
        <boxGeometry args={[WALL_X * 2 + 0.68, 0.4, 0.95]} />
        <meshStandardMaterial color="#3a3a45" metalness={0.65} roughness={0.42} />
      </mesh>
      {/* Brass trim along the frame */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WALL_X + 0.01), CENTER_Y, 0.42]}>
          <boxGeometry args={[0.03, height, 0.03]} />
          <meshStandardMaterial color="#c9a23a" metalness={1} roughness={0.25} />
        </mesh>
      ))}

      <instancedMesh ref={pegMesh} args={[undefined, undefined, pegs.length]}>
        <cylinderGeometry args={[PEG_RADIUS, PEG_RADIUS, 0.5, 14]} />
        <meshStandardMaterial metalness={0.35} roughness={0.32} emissive="#2a2a32" />
      </instancedMesh>

      {bumperGeos.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#9a9aa8" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* Slot dividers */}
      {dividers.map((x) => (
        <mesh key={x} position={[x, (DIVIDER_TOP_Y + FLOOR_Y) / 2, 0]}>
          <boxGeometry args={[DIVIDER_HALF_WIDTH * 2, DIVIDER_TOP_Y - FLOOR_Y, 0.5]} />
          <meshStandardMaterial color="#c8cad6" metalness={0.5} roughness={0.35} />
        </mesh>
      ))}

      {/* Slot faces: small lit displays set into the floor of each slot */}
      {Array.from({ length: SLOTS }, (_, i) => (
        <mesh key={i} ref={(m) => void (slotLights.current[i] = m)} position={[slotCenterX(i), FLOOR_Y - 0.2, 0.49]}>
          <planeGeometry args={[0.95, 0.37]} />
          <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0.8} color="#111" toneMapped={false} />
        </mesh>
      ))}

      {/* Chute rail and carriage */}
      <mesh position={[0, START_Y + 0.72, -0.05]}>
        <boxGeometry args={[WALL_X * 2, 0.08, 0.1]} />
        <meshStandardMaterial color="#6b5a26" metalness={0.95} roughness={0.3} />
      </mesh>
      {CHUTES.map((c) => (
        <mesh key={c} position={[c, START_Y + 0.25, 0.4]} onPointerDown={(e) => pickChute(e, c)} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
          <planeGeometry args={[0.98, 1.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {CHUTES.map((c) => (
        <mesh key={c} position={[c, START_Y + 0.72, 0.02]}>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 10]} />
          <meshBasicMaterial color={c === chute ? "#f2c230" : "#4a4a55"} toneMapped={false} />
        </mesh>
      ))}
      <group ref={carriage} position={[chute, START_Y, 0]}>
        <mesh position={[0, balls > 5 ? 1.02 : 0.62, 0]}>
          <boxGeometry args={[Math.max(0.92, Math.min(balls, 5) * 0.68), 0.2, 0.42]} />
          <meshStandardMaterial color="#c9a23a" metalness={0.95} roughness={0.28} />
        </mesh>
        <group ref={previewBob}>
          {startLayout(0, balls).map((p, i) => (
            <PreviewCoin key={i} art={previewArts[i % previewArts.length]} position={[p.x, p.y - START_Y + 0.06, 0]} geometry={coinGeo} />
          ))}
          <sprite position={[0, 0.06, 0]} scale={[1.4 + balls * 0.2, 1.4, 1]}>
            <spriteMaterial map={glowTex} color={previewTrail} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
          </sprite>
        </group>
      </group>

      <group ref={tokenRoot} />
      <Particles ref={sparks} capacity={200} />
      <Particles ref={coins} capacity={70} shape="disc" />
    </>
  );
}

export default function DropsScene(props: Props) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, CENTER_Y, 19], fov: 36 }} gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }} aria-label="Pegboard">
      <Board {...props} />
    </Canvas>
  );
}
