"use client";
/**
 * The arcade floor: two machines in the burrow, each playing its own game. The wheel and the pegs
 * here are the real game parts at a smaller scale. Choosing one walks the camera into its screen.
 */
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useArcade } from "@/client/store";
import { Hamster, type HamsterDrive } from "@/components/three/Hamster";
import { radialTexture, Wheel, type WheelDrive } from "@/components/three/Wheel";
import { drawDots, textCols } from "@/components/ui/dotfont";
import { arcadeTokenTexture } from "@/components/drops/textures";

function marqueeTexture(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 110;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0a0a0d";
  ctx.fillRect(0, 0, c.width, c.height);
  const pitch = Math.min(11, (c.width - 40) / textCols(text));
  drawDots(ctx, text, (c.width - textCols(text) * pitch) / 2, (c.height - pitch * 7) / 2, pitch, color, { radius: 0.44 });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Cabinet({ position, title, color, hover, children, rotate = 0 }: { position: [number, number, number]; title: string; color: string; hover: React.MutableRefObject<number>; children: React.ReactNode; rotate?: number }) {
  const marquee = useMemo(() => marqueeTexture(title, color), [title, color]);
  const light = useRef<THREE.PointLight>(null);
  const root = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (light.current) light.current.intensity += ((6 + hover.current * 14) - light.current.intensity) * Math.min(1, dt * 6);
    if (root.current) root.current.position.y = position[1] + hover.current * 0.06;
  });
  return (
    <group ref={root} position={position} rotation={[0, rotate, 0]}>
      <RoundedBox args={[3.3, 5.5, 1.5]} radius={0.09} smoothness={3} position={[0, 0, -0.45]}>
        <meshStandardMaterial color="#30303a" metalness={0.55} roughness={0.48} />
      </RoundedBox>
      {/* Screen recess */}
      <mesh position={[0, 0.2, 0.31]}>
        <planeGeometry args={[2.85, 3.7]} />
        <meshStandardMaterial color="#14141a" roughness={0.85} />
      </mesh>
      {/* Bezel */}
      {[[0, 2.08, 2.97, 0.1], [0, -1.68, 2.97, 0.1], [-1.47, 0.2, 0.1, 3.86], [1.47, 0.2, 0.1, 3.86]].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.35]}>
          <boxGeometry args={[w, h, 0.1]} />
          <meshStandardMaterial color="#b3923a" metalness={0.95} roughness={0.32} />
        </mesh>
      ))}
      {/* Marquee */}
      <mesh position={[0, 2.5, 0.31]}>
        <planeGeometry args={[2.85, 0.6]} />
        <meshBasicMaterial map={marquee} toneMapped={false} />
      </mesh>
      {/* Control deck with buttons */}
      <mesh position={[0, -2.25, 0.5]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[3.2, 0.1, 0.9]} />
        <meshStandardMaterial color="#26262e" metalness={0.75} roughness={0.42} />
      </mesh>
      {[-0.7, 0, 0.7].map((x, i) => (
        <mesh key={x} position={[x, -2.19, 0.54]} rotation={[-0.5, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.17, 0.09, 20]} />
          <meshStandardMaterial color={i === 1 ? color : "#3a3a46"} emissive={i === 1 ? color : "#000"} emissiveIntensity={0.6} roughness={0.35} />
        </mesh>
      ))}
      <pointLight ref={light} position={[0, 0.3, 2.6]} color="#fff4e0" distance={8} intensity={6} />
      <mesh position={[0, -2.75, -0.3]}>
        <boxGeometry args={[3.5, 0.3, 1.9]} />
        <meshStandardMaterial color="#17171d" metalness={0.7} roughness={0.5} />
      </mesh>
      <group position={[0, 0.2, 0.33]}>{children}</group>
    </group>
  );
}

function MiniPegboard() {
  const pegs = useMemo(() => {
    const out: [number, number][] = [];
    for (let r = 0; r < 9; r++) {
      const n = r % 2 === 0 ? 7 : 8;
      for (let i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * 0.34, 1.5 - r * 0.33]);
    }
    return out;
  }, []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const tokens = useRef<(THREE.Mesh | null)[]>([]);
  const state = useRef([0, 1, 2].map((i) => ({ x: (i - 1) * 0.5, y: 1.9 - i * 1.3, vx: 0.2 * (i - 1), vy: 0, a: 0 })));
  useEffect(() => {
    const d = new THREE.Object3D();
    pegs.forEach(([x, y], i) => {
      d.position.set(x, y, 0.02);
      d.rotation.x = Math.PI / 2;
      d.updateMatrix();
      mesh.current?.setMatrixAt(i, d.matrix);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [pegs]);
  const face = useMemo(() => arcadeTokenTexture(), []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.033);
    state.current.forEach((t, i) => {
      t.vy -= 6 * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.a -= t.vx * dt * 6;
      // A cheap decoration: little bounces off the pegs. The real game runs the full physics.
      for (const [px, py] of pegs) {
        const dx = t.x - px;
        const dy = t.y - py;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.15 && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          const dot = t.vx * nx + t.vy * ny;
          if (dot < 0) {
            t.vx -= 1.5 * dot * nx;
            t.vy -= 1.5 * dot * ny;
          }
          t.x = px + nx * 0.15;
          t.y = py + ny * 0.15;
          t.vx += (Math.random() - 0.5) * 0.18;
        }
      }
      if (Math.abs(t.x) > 1.27) {
        t.x = Math.sign(t.x) * 1.27;
        t.vx *= -0.6;
      }
      if (t.y < -1.65) {
        t.y = 1.95;
        t.x = (Math.random() - 0.5) * 1.4;
        t.vx = (Math.random() - 0.5) * 0.4;
        t.vy = 0;
      }
      const m = tokens.current[i];
      if (m) {
        m.position.set(t.x, t.y, 0.06);
        m.rotation.z = t.a;
      }
    });
  });
  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, pegs.length]}>
        <cylinderGeometry args={[0.035, 0.035, 0.1, 8]} />
        <meshStandardMaterial color="#d8d8e2" emissive="#55555f" metalness={0.45} roughness={0.35} />
      </instancedMesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => void (tokens.current[i] = m)}>
          <circleGeometry args={[0.13, 24]} />
          <meshBasicMaterial map={face} toneMapped={false} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const colors = ["#f44a5e", "#ffc048", "#f2c230", "#6e7bb0", "#f2c230", "#ffc048", "#f44a5e"];
        return (
          <mesh key={i} position={[(i - 3) * 0.39, -1.71, 0.02]}>
            <planeGeometry args={[0.35, 0.16]} />
            <meshBasicMaterial color={colors[i]} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function MiniWheel() {
  const wheel = useRef<WheelDrive>({ omega: 6.5, heat: 0.2, angle: 0 });
  const hamster = useRef<HamsterDrive>({ cadence: 4, mood: "run" });
  return (
    <group scale={0.5} position={[0, 0.1, 0.45]}>
      <Wheel drive={wheel} radius={2.3} width={1.5} />
      <Hamster drive={hamster} position={[0, -2.25, 0]} rotation={[0, -0.25, 0]} />
    </group>
  );
}

function Floor({ hover, reduced }: { hover: React.MutableRefObject<{ drops: number; run: number; target: "drops" | "run" | null }>; reduced: boolean }) {
  const { camera, size } = useThree();
  const portal = useArcade((s) => s.portal);
  const drops = useRef(0);
  const run = useRef(0);
  const dropsRef = useMemo(() => ({ get current() { return drops.current; } }), []) as React.MutableRefObject<number>;
  const runRef = useMemo(() => ({ get current() { return run.current; } }), []) as React.MutableRefObject<number>;
  const tunnel = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const glow = useMemo(() => radialTexture(), []);

  useEffect(() => {
    const on = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", on);
    return () => window.removeEventListener("pointermove", on);
  }, []);

  const portrait = size.width < size.height * 0.9;
  const dropsPos = useMemo<[number, number, number]>(() => (portrait ? [-1.86, 0, 0] : [-2.5, 0, 0]), [portrait]);
  const runPos = useMemo<[number, number, number]>(() => (portrait ? [1.86, 0, 0] : [2.5, 0, 0]), [portrait]);

  useFrame((state, dt) => {
    const clamp = Math.min(dt, 0.05);
    drops.current += ((hover.current.target === "drops" ? 1 : 0) - drops.current) * Math.min(1, clamp * 7);
    run.current += ((hover.current.target === "run" ? 1 : 0) - run.current) * Math.min(1, clamp * 7);
    const aspect = size.width / Math.max(1, size.height);
    const half = Math.tan(THREE.MathUtils.degToRad(32 / 2));
    const span = portrait ? 4.1 : 5.4;
    const dist = Math.max(4.1 / half, span / (half * aspect));
    let tx = (reduced ? 0 : pointer.current.x * 0.35) + (drops.current - run.current) * -0.35;
    let ty = 0.32 - (reduced ? 0 : pointer.current.y * 0.1);
    let tz = dist;
    let ease = 2.6;
    if (portal) {
      // The walk into the machine.
      const p = portal === "drops" ? dropsPos : runPos;
      tx = p[0];
      ty = 0.2;
      tz = 3.6;
      ease = 3.4;
    }
    camera.position.x += (tx - camera.position.x) * Math.min(1, clamp * ease);
    camera.position.y += (ty - camera.position.y) * Math.min(1, clamp * ease);
    camera.position.z += (tz - camera.position.z) * Math.min(1, clamp * ease);
    camera.lookAt(portal ? (portal === "drops" ? dropsPos[0] : runPos[0]) : camera.position.x * 0.3, portal ? 0.1 : 0.12, 0);
    if (tunnel.current && !reduced) tunnel.current.rotation.z = state.clock.elapsedTime * 0.04;
  });

  return (
    <>
      <color attach="background" args={["#0a0a0d"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 6, 7]} intensity={1.5} color="#fff2d8" />
      <pointLight position={[0, 1, -3.4]} intensity={40} distance={13} color="#5b7cfa" />
      <pointLight position={[0, -2.2, 4]} intensity={10} distance={10} color="#ffc048" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2} color="#fff2d8" position={[0, 5, 3]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#5b7cfa" position={[-7, 0, 1]} rotation={[0, Math.PI / 2, 0]} scale={[6, 5, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#ffc048" position={[7, 0, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 5, 1]} />
      </Environment>

      {/* A huge wheel set into the burrow wall: the whole arcade lives inside one. */}
      <group ref={tunnel} position={[0, 0.8, -5.5]}>
        <mesh>
          <torusGeometry args={[6.7, 0.2, 14, 96]} />
          <meshStandardMaterial color="#8a7430" emissive="#2a230c" metalness={0.8} roughness={0.42} />
        </mesh>
        <mesh>
          <torusGeometry args={[5.5, 0.08, 10, 96]} />
          <meshStandardMaterial color="#5a5a68" metalness={0.75} roughness={0.5} />
        </mesh>
        {Array.from({ length: 32 }, (_, i) => {
          const a = (i / 32) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 6.1, Math.sin(a) * 6.1, 0]} rotation={[0, 0, a]}>
              <boxGeometry args={[1.25, 0.1, 0.1]} />
              <meshStandardMaterial color="#5a5a68" metalness={0.75} roughness={0.5} />
            </mesh>
          );
        })}
      </group>
      <sprite position={[0, 1, -6.5]} scale={[15, 15, 1]}>
        <spriteMaterial map={glow} color="#4460cf" transparent opacity={0.34} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.9, 0]}>
        <planeGeometry args={[60, 30]} />
        <meshStandardMaterial color="#1b1b21" metalness={0.6} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0, -8]}>
        <planeGeometry args={[60, 30]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.95} />
      </mesh>

      <Cabinet position={[dropsPos[0], 0, 0]} title="SQUEEK DROPS" color="#f2c230" hover={dropsRef} rotate={portrait ? 0 : 0.1}>
        <MiniPegboard />
      </Cabinet>
      <Cabinet position={[runPos[0], 0, 0]} title="SQUEEK RUN" color="#5b7cfa" hover={runRef} rotate={portrait ? 0 : -0.1}>
        <MiniWheel />
      </Cabinet>
    </>
  );
}

export default function LobbyScene({ hover, reduced }: { hover: React.MutableRefObject<{ drops: number; run: number; target: "drops" | "run" | null }>; reduced: boolean }) {
  return (
    <Canvas dpr={[1, 1.6]} camera={{ position: [0, 0.3, 16], fov: 32 }} gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }} aria-hidden>
      <Floor hover={hover} reduced={reduced} />
    </Canvas>
  );
}
