"use client";
/**
 * Squeektoshi, built from primitives: a white-orange Syrian hamster, per the docs. He runs because
 * he wants to, so when the wheel stops he isn't hurt or scared. He goes for a snack.
 */
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

export type HamsterDrive = {
  /** Leg cycles per second. */
  cadence: number;
  mood: "idle" | "ready" | "run" | "snack" | "cheer";
};

const FUR = "#ee9a3f";
const CREAM = "#fff3df";
const PINK = "#f6a9bd";
const DARK = "#1b1214";

export function Hamster({ drive, ...props }: { drive: MutableRefObject<HamsterDrive> } & ThreeElements["group"]) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const paws = useRef<(THREE.Mesh | null)[]>([]);
  const seed = useRef<THREE.Mesh>(null);
  const eyes = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const clock = useRef(0);
  const pose = useRef({ sit: 0, hop: 0 });

  const geo = useMemo(() => ({ big: new THREE.SphereGeometry(1, 32, 24), small: new THREE.SphereGeometry(1, 14, 10) }), []);
  const mats = useMemo(
    () => ({
      fur: new THREE.MeshStandardMaterial({ color: FUR, roughness: 0.85 }),
      cream: new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.9 }),
      pink: new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.2, metalness: 0.1 }),
      seed: new THREE.MeshStandardMaterial({ color: "#c98a2b", roughness: 0.5 }),
      white: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      whisker: new THREE.MeshBasicMaterial({ color: "#fff8ea", transparent: true, opacity: 0.7 }),
    }),
    [],
  );

  useFrame((_, dt) => {
    const d = drive.current;
    clock.current += dt;
    phase.current += dt * d.cadence * Math.PI * 2;
    const t = clock.current;
    const p = pose.current;
    const running = d.mood === "run";
    p.sit += ((d.mood === "snack" ? 1 : 0) - p.sit) * Math.min(1, dt * 7);
    p.hop += ((d.mood === "cheer" ? 1 : 0) - p.hop) * Math.min(1, dt * 9);

    const stride = running ? 0.2 + Math.min(0.12, d.cadence * 0.01) : d.mood === "ready" ? 0.03 : 0;
    const phi = phase.current;
    const legs: [number, number, number, number][] = [
      // x, z, base y, phase offset. A gallop: the two pairs reach together.
      [0.38, 0.2, 0.09, 0],
      [0.38, -0.2, 0.09, 0.35],
      [-0.34, 0.24, 0.1, Math.PI],
      [-0.34, -0.24, 0.1, Math.PI + 0.35],
    ];
    legs.forEach(([x, z, y, off], i) => {
      const paw = paws.current[i];
      if (!paw) return;
      const a = phi + off;
      const front = i < 2;
      if (p.sit > 0.05 && front) {
        // Front paws come up to hold the seed.
        const up = p.sit;
        paw.position.set(THREE.MathUtils.lerp(x, 0.62, up), THREE.MathUtils.lerp(y, 0.68, up), THREE.MathUtils.lerp(z, z * 0.45, up));
      } else {
        paw.position.set(x + Math.cos(a) * stride, y + Math.max(0, Math.sin(a)) * stride * 0.7, z);
      }
    });

    if (body.current) {
      const breathe = Math.sin(t * 2.4) * 0.012;
      const bob = running ? Math.abs(Math.sin(phi)) * 0.05 : 0;
      const hop = p.hop * Math.abs(Math.sin(t * 8)) * 0.42;
      body.current.position.y = bob + breathe + hop + p.sit * 0.06;
      // Leans into the run, sits back to eat.
      body.current.rotation.z = (running ? -0.1 - Math.min(0.1, d.cadence * 0.008) + Math.sin(phi) * 0.05 : 0) + p.sit * 0.55;
      body.current.scale.set(1, 1 + breathe, 1);
    }
    if (head.current) {
      const nibble = d.mood === "snack" ? Math.sin(t * 22) * 0.025 : 0;
      head.current.rotation.z = (running ? 0.16 + Math.sin(phi * 1.0) * 0.05 : 0) - p.sit * 0.45 + nibble;
      head.current.rotation.y = d.mood === "idle" || d.mood === "snack" ? 0.55 + Math.sin(t * 0.7) * 0.15 : 0.12;
      head.current.position.y = 0.72 + nibble;
    }
    if (seed.current) {
      seed.current.visible = p.sit > 0.6;
      seed.current.position.set(0.72, 0.7, 0);
    }
    if (eyes.current) {
      // A slow blink.
      const blink = (t % 3.7) < 0.1 ? 0.15 : 1;
      eyes.current.scale.y = blink;
    }
  });

  return (
    <group {...props}>
      <group ref={body}>
        <mesh geometry={geo.big} material={mats.fur} scale={[0.68, 0.48, 0.47]} position={[-0.04, 0.46, 0]} castShadow />
        <mesh geometry={geo.big} material={mats.cream} scale={[0.52, 0.34, 0.42]} position={[0.14, 0.33, 0]} />
        {/* White saddle patch */}
        <mesh geometry={geo.small} material={mats.cream} scale={[0.25, 0.1, 0.22]} position={[-0.2, 0.88, 0]} rotation={[0, 0, 0.1]} />
        {/* Tail nub */}
        <mesh geometry={geo.small} material={mats.pink} scale={[0.08, 0.05, 0.05]} position={[-0.72, 0.42, 0]} />
        <group ref={head} position={[0.58, 0.72, 0]}>
          <mesh geometry={geo.big} material={mats.fur} scale={[0.37, 0.34, 0.35]} castShadow />
          <mesh geometry={geo.big} material={mats.cream} scale={[0.24, 0.17, 0.25]} position={[0.2, -0.12, 0]} />
          {/* Cheeks, generously stuffed */}
          <mesh geometry={geo.small} material={mats.cream} scale={[0.17, 0.15, 0.16]} position={[0.06, -0.1, 0.27]} />
          <mesh geometry={geo.small} material={mats.cream} scale={[0.17, 0.15, 0.16]} position={[0.06, -0.1, -0.27]} />
          {/* Ears */}
          {[1, -1].map((s) => (
            <group key={s} position={[-0.06, 0.28, s * 0.2]} rotation={[s * 0.3, 0, 0]}>
              <mesh geometry={geo.small} material={mats.fur} scale={[0.1, 0.13, 0.05]} />
              <mesh geometry={geo.small} material={mats.pink} scale={[0.07, 0.09, 0.03]} position={[0.03, 0, 0]} />
            </group>
          ))}
          {/* Eyes */}
          <group ref={eyes} position={[0, 0.05, 0]}>
            {[1, -1].map((s) => (
              <group key={s} position={[0.26, 0, s * 0.2]}>
                <mesh geometry={geo.small} material={mats.dark} scale={0.058} />
                <mesh geometry={geo.small} material={mats.white} scale={0.018} position={[0.04, 0.025, s * 0.02]} />
              </group>
            ))}
          </group>
          {/* Nose */}
          <mesh geometry={geo.small} material={mats.pink} scale={[0.04, 0.03, 0.04]} position={[0.42, -0.07, 0]} />
          {/* Whiskers */}
          {[1, -1].flatMap((s) =>
            [0.2, 0, -0.2].map((tilt) => (
              <mesh key={`${s}${tilt}`} material={mats.whisker} position={[0.3, -0.08 + tilt * 0.12, s * 0.28]} rotation={[s * 1.15, 0, tilt]}>
                <cylinderGeometry args={[0.003, 0.003, 0.34, 4]} />
              </mesh>
            )),
          )}
        </group>
      </group>
      {/* Paws sit outside the body group so they stay planted on the rungs while it bobs. */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(m) => void (paws.current[i] = m)} geometry={geo.small} material={mats.pink} scale={[0.11, 0.06, 0.08]} />
      ))}
      <mesh ref={seed} geometry={geo.small} material={mats.seed} scale={[0.1, 0.06, 0.06]} visible={false} />
    </group>
  );
}
