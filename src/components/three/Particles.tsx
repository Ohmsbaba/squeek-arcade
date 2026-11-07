"use client";
/** A small pool of bright, ballistic bits for sparks, coins and landing bursts. */
import { useFrame } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";

export type ParticleBurst = {
  burst: (opts: { x: number; y: number; z?: number; count: number; color: string; speed?: number; spread?: number; up?: number; life?: number; size?: number; gravity?: number }) => void;
};

type P = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; g: number; spin: number };

export const Particles = forwardRef<ParticleBurst, { capacity?: number; shape?: "disc" | "spark" }>(function Particles({ capacity = 220, shape = "spark" }, ref) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const pool = useMemo<P[]>(() => Array.from({ length: capacity }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.05, g: 9, spin: 0 })), [capacity]);
  const cursor = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useImperativeHandle(ref, () => ({
    burst: ({ x, y, z = 0, count, color: c, speed = 4, spread = Math.PI * 2, up = Math.PI / 2, life = 0.9, size = 0.06, gravity = 9 }) => {
      color.set(c);
      for (let i = 0; i < count; i++) {
        const idx = cursor.current;
        cursor.current = (cursor.current + 1) % capacity;
        const p = pool[idx];
        const a = up + (Math.random() - 0.5) * spread;
        const s = speed * (0.35 + Math.random() * 0.75);
        p.x = x; p.y = y; p.z = z;
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s;
        p.vz = (Math.random() - 0.5) * speed * 0.5;
        p.max = p.life = life * (0.6 + Math.random() * 0.6);
        p.size = size * (0.6 + Math.random() * 0.8);
        p.g = gravity;
        p.spin = Math.random() * 12;
        mesh.current?.setColorAt(idx, color);
      }
      if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    },
  }));

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < capacity; i++) {
      const p = pool[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = Math.max(0, p.life / p.max);
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.spin * p.life, p.spin * 0.6 * p.life, 0);
        dummy.scale.setScalar(p.size * (0.3 + k * 0.7));
      } else {
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, capacity]} frustumCulled={false}>
      {shape === "disc" ? <cylinderGeometry args={[1, 1, 0.25, 12]} /> : <sphereGeometry args={[1, 6, 5]} />}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
});
