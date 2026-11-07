"use client";
/**
 * The wheel: an open-fronted running wheel with a rim magnet and a sensor arm, after the WHEELY9000,
 * where each magnet passage is one unit of work. The sensor lamp here fires on every pass too.
 */
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

export type WheelDrive = {
  /** Radians per second. Positive runs the bottom of the wheel backwards, under the hamster. */
  omega: number;
  /** 0 to 1. Drives the blur and the lights. */
  heat: number;
  angle: number;
};

const RUNGS = 44;

export function Wheel({ drive, radius = 2.3, width = 1.5, ...props }: { drive: MutableRefObject<WheelDrive>; radius?: number; width?: number } & ThreeElements["group"]) {
  const spin = useRef<THREE.Group>(null);
  const rungs = useRef<THREE.InstancedMesh>(null);
  const blur = useRef<THREE.Mesh>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const lampGlow = useRef<THREE.Sprite>(null);
  const flash = useRef(0);
  const lastTurn = useRef(0);

  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8a8c98", metalness: 0.85, roughness: 0.32 }), []);
  const brass = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c9a23a", metalness: 0.95, roughness: 0.3 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#23232b", metalness: 0.7, roughness: 0.5 }), []);
  const glowTex = useMemo(() => radialTexture(), []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    for (let i = 0; i < RUNGS; i++) {
      const a = (i / RUNGS) * Math.PI * 2;
      m.compose(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0), q, new THREE.Vector3(1, 1, 1));
      rungs.current?.setMatrixAt(i, m);
    }
    if (rungs.current) rungs.current.instanceMatrix.needsUpdate = true;
  }, [radius]);

  useFrame((_, dt) => {
    const d = drive.current;
    d.angle -= d.omega * dt;
    if (spin.current) spin.current.rotation.z = d.angle;
    if (blur.current) {
      const m = blur.current.material as THREE.MeshBasicMaterial;
      m.opacity = THREE.MathUtils.smoothstep(Math.abs(d.omega), 14, 34) * 0.5;
      blur.current.visible = m.opacity > 0.01;
    }
    // One lamp flash per magnet passage.
    const turn = Math.floor(Math.abs(d.angle) / (Math.PI * 2));
    if (turn !== lastTurn.current) {
      lastTurn.current = turn;
      flash.current = 1;
    }
    flash.current = Math.max(0, flash.current - dt * (4 + Math.abs(d.omega) * 0.6));
    const intensity = 0.25 + flash.current * 5;
    if (lamp.current) lamp.current.emissiveIntensity = intensity;
    if (lampGlow.current) {
      (lampGlow.current.material as THREE.SpriteMaterial).opacity = flash.current * 0.8;
    }
  });

  return (
    <group {...props}>
      <group ref={spin}>
        {[width / 2, -width / 2].map((z) => (
          <mesh key={z} position={[0, 0, z]} material={steel} castShadow>
            <torusGeometry args={[radius, 0.07, 14, 96]} />
          </mesh>
        ))}
        <instancedMesh ref={rungs} args={[undefined, undefined, RUNGS]} material={brass} castShadow>
          <cylinderGeometry args={[0.028, 0.028, width, 8]} />
        </instancedMesh>
        {/* Spokes on the back side only: the front stays open so you can see him run. */}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[0, 0, -width / 2]} rotation={[0, 0, (i / 6) * Math.PI * 2]} material={steel}>
            <boxGeometry args={[radius * 2, 0.07, 0.05]} />
          </mesh>
        ))}
        <mesh position={[0, 0, -width / 2]} rotation={[Math.PI / 2, 0, 0]} material={brass}>
          <cylinderGeometry args={[0.32, 0.32, 0.16, 28]} />
        </mesh>
        {/* The rim magnet */}
        <mesh position={[0, radius + 0.04, width / 2 + 0.02]} material={dark}>
          <boxGeometry args={[0.2, 0.14, 0.14]} />
        </mesh>
        <mesh position={[0, radius + 0.04, width / 2 + 0.1]}>
          <boxGeometry args={[0.18, 0.1, 0.02]} />
          <meshStandardMaterial color="#f44a5e" emissive="#f44a5e" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Fast-spin blur over the rungs */}
      <mesh ref={blur} visible={false} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius + 0.02, radius + 0.02, width, 64, 1, true]} />
        <meshBasicMaterial color="#b89a4a" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Axle */}
      <mesh position={[0, 0, -width / 2 - 0.42]} rotation={[Math.PI / 2, 0, 0]} material={dark}>
        <cylinderGeometry args={[0.13, 0.13, 0.9, 16]} />
      </mesh>

      {/* Sensor arm reaching over the rim */}
      <group position={[radius * 0.72, radius * 0.72, width / 2 + 0.05]}>
        <mesh material={dark} rotation={[0, 0, Math.PI / 4]} position={[0.28, 0.28, 0]}>
          <boxGeometry args={[0.72, 0.09, 0.09]} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshStandardMaterial ref={lamp} color="#35d07f" emissive="#35d07f" emissiveIntensity={0.3} />
        </mesh>
        <sprite ref={lampGlow} scale={[1.1, 1.1, 1]}>
          <spriteMaterial map={glowTex} color="#35d07f" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      </group>
    </group>
  );
}

let cachedGlow: THREE.Texture | null = null;
export function radialTexture() {
  if (cachedGlow) return cachedGlow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  cachedGlow = new THREE.CanvasTexture(c);
  return cachedGlow;
}

/** A spur gear as an extruded outline. */
export function makeGearGeometry(radius: number, teeth: number, depth = 0.14) {
  const shape = new THREE.Shape();
  const inner = radius * 0.86;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const pts: [number, number][] = [
      [inner, a0], [radius, a0 + step * 0.12], [radius, a0 + step * 0.42], [inner, a0 + step * 0.54],
    ];
    pts.forEach(([r, a], j) => {
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.22, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const w = new THREE.Path();
    w.absarc(Math.cos(a) * radius * 0.55, Math.sin(a) * radius * 0.55, radius * 0.14, 0, Math.PI * 2, true);
    shape.holes.push(w);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return g;
}
