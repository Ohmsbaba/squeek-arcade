"use client";
import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { Hamster, type HamsterDrive } from "@/components/three/Hamster";
import { Particles, type ParticleBurst } from "@/components/three/Particles";
import { makeGearGeometry, radialTexture, Wheel, type WheelDrive } from "@/components/three/Wheel";
import type { RunLive } from "./useRunGame";

const R = 2.3;

function dotWallTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0e0e12";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#26262f";
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    ctx.beginPath();
    ctx.arc(16 + x * 32, 16 + y * 32, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Stage({ live, reduced }: { live: MutableRefObject<RunLive>; reduced: boolean }) {
  const wheel = useRef<WheelDrive>({ omega: 0, heat: 0, angle: 0 });
  const hamster = useRef<HamsterDrive>({ cadence: 0, mood: "idle" });
  const runner = useRef<THREE.Group>(null);
  const gearA = useRef<THREE.Mesh>(null);
  const gearB = useRef<THREE.Mesh>(null);
  const needle = useRef<THREE.Group>(null);
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const key = useRef<THREE.SpotLight>(null);
  const warm = useRef<THREE.PointLight>(null);
  const steam = useRef<(THREE.Sprite | null)[]>([]);
  const steamState = useRef(Array.from({ length: 6 }, (_, i) => ({ t: i / 6 })));
  const sparks = useRef<ParticleBurst>(null);
  const coins = useRef<ParticleBurst>(null);
  const prevPhase = useRef(live.current.phase);
  const sparkClock = useRef(0);
  const shake = useRef(0);
  const carried = useRef(0);
  const lastPulse = useRef(0);
  const flash = useRef(0);

  const { camera, size } = useThree();
  const wallTex = useMemo(() => dotWallTexture(), []);
  const gearGeo = useMemo(() => ({ big: makeGearGeometry(1.5, 22), small: makeGearGeometry(0.75, 11) }), []);
  const glow = useMemo(() => radialTexture(), []);
  const BULBS = 25;
  const bulbColor = useMemo(() => new THREE.Color(), []);

  // Frames the whole wheel, plus the arch on wide screens, at any stage shape.
  const baseDistance = () => {
    const aspect = size.width / Math.max(1, size.height);
    const half = Math.tan(THREE.MathUtils.degToRad(38 / 2));
    return Math.max(4.1 / half, 4.5 / (half * aspect));
  };

  useEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < BULBS; i++) {
      const a = Math.PI * (0.06 + (i / (BULBS - 1)) * 0.88);
      m.makeTranslation(Math.cos(a) * 4.05, Math.sin(a) * 4.05 + 0.15, -1.1);
      bulbs.current?.setMatrixAt(i, m);
      bulbs.current?.setColorAt(i, bulbColor.set("#3a2f10"));
    }
    if (bulbs.current) bulbs.current.instanceMatrix.needsUpdate = true;
  }, [bulbColor]);

  useFrame((state, dt) => {
    const clampDt = Math.min(dt, 0.05);
    const l = live.current;
    const t = state.clock.elapsedTime;
    // After a cash-out the wheel carries on as if running, then stops like a loss. The player's already safe.
    const phase = l.phase === "overtime" ? "running" : l.phase === "missed" ? "lost" : l.phase;
    const w = wheel.current;
    const h = hamster.current;

    // Things that happen once, at the moment the phase changes.
    if (phase !== prevPhase.current) {
      if (phase === "lost") {
        shake.current = reduced ? 0 : 0.45;
        sparks.current?.burst({ x: 0, y: -R + 0.1, z: 0.6, count: 60, color: "#ffc048", speed: 7, spread: 2.4, life: 0.8, size: 0.035 });
      }
      if (phase === "won") {
        coins.current?.burst({ x: 0, y: -0.8, z: 1.2, count: 70, color: "#f2c230", speed: 8, spread: 1.7, life: 1.4, size: 0.13, gravity: 13 });
      }
      prevPhase.current = phase;
    }

    // A real Squeek block landed during this run.
    if (l.blockPulse !== lastPulse.current) {
      lastPulse.current = l.blockPulse;
      flash.current = 1;
      shake.current = Math.max(shake.current, reduced ? 0 : 0.14);
      coins.current?.burst({ x: 0, y: 2.6, z: 0.8, count: 36, color: "#f2c230", speed: 6, spread: 2.6, up: -Math.PI / 2, life: 1.2, size: 0.1, gravity: 10 });
    }
    flash.current = Math.max(0, flash.current - clampDt * 1.6);

    // At rest, this wheel mirrors the real one: if he's running, ours turns at his speed. If he's resting, so is ours.
    const mirroring = (phase === "idle" || phase === "starting") && l.realRpm > 0;
    const mirrorOmega = Math.min(14, (l.realRpm * Math.PI * 2) / 60);

    let target = mirroring ? mirrorOmega : 0;
    let heat = 0;
    if (phase === "running") {
      const lm = Math.log(Math.max(1, l.mult));
      target = Math.min(38, 4.5 + 8.2 * lm);
      heat = Math.min(1, lm / Math.log(30));
    } else if (phase === "countdown") {
      target = 0.35;
    }
    // Spins up briskly; a stop is abrupt, a cash-out coasts.
    const rate = phase === "lost" ? 16 : phase === "won" ? 1.2 : 3.2;
    w.omega += (target - w.omega) * Math.min(1, clampDt * rate);
    w.heat += (heat - w.heat) * Math.min(1, clampDt * 3);

    h.mood = phase === "running" || mirroring ? "run" : phase === "countdown" ? "ready" : phase === "lost" ? "snack" : phase === "won" ? "cheer" : "idle";
    h.cadence = phase === "running" || mirroring ? 1.6 + Math.abs(w.omega) * 0.42 : 0;

    // He climbs the curve a little as he speeds up. On a sudden stop momentum carries him up, then he settles.
    if (runner.current) {
      const climb = phase === "running" ? 0.1 + w.heat * 0.2 : 0;
      carried.current += (climb - carried.current) * Math.min(1, clampDt * 5);
      runner.current.rotation.z = carried.current;
      if (!reduced && phase === "running") {
        runner.current.position.z = Math.sin(t * 2.2) * 0.1 * (1 - w.heat);
      }
    }

    if (gearA.current) gearA.current.rotation.z = w.angle * 0.62;
    if (gearB.current) gearB.current.rotation.z = -w.angle * 1.24 + 0.14;

    if (needle.current) {
      const target = -Math.min(1, Math.log(Math.max(1, l.mult)) / Math.log(100)) * Math.PI * 1.5 + Math.PI * 0.75;
      const jitter = reduced ? 0 : Math.sin(t * 40) * 0.015 * w.heat;
      needle.current.rotation.z += (target + jitter - needle.current.rotation.z) * Math.min(1, clampDt * 8);
    }

    // The bulbs light up the arch as the multiplier climbs, then chase.
    if (bulbs.current) {
      const lit = phase === "running" ? Math.min(BULBS, 1 + Math.log(Math.max(1, l.mult)) * 8.5) : 0;
      for (let i = 0; i < BULBS; i++) {
        const fromCentre = Math.abs(i - (BULBS - 1) / 2) * 2;
        const on = fromCentre < lit;
        const chase = phase === "running" && w.heat > 0.55 && !reduced ? (Math.sin(t * 16 - i) > 0 ? 1 : 0.45) : 1;
        if (phase === "won") bulbColor.set("#35d07f").multiplyScalar(Math.sin(t * 10 + i) > 0 ? 1.8 : 0.5);
        else if (phase === "lost") bulbColor.set(i % 4 === 0 ? "#f44a5e" : "#2a1114");
        else if (flash.current > 0.02) bulbColor.set("#fff2d8").multiplyScalar(1 + flash.current * 2.5);
        else if (on) bulbColor.set(i % 2 ? "#ffc048" : "#f2c230").multiplyScalar(1.5 * chase);
        else bulbColor.set("#3a2f10");
        bulbs.current.setColorAt(i, bulbColor);
      }
      if (bulbs.current.instanceColor) bulbs.current.instanceColor.needsUpdate = true;
    }

    if (key.current) key.current.intensity = 60 + w.heat * 70;
    if (warm.current) {
      warm.current.intensity = phase === "lost" ? 5 : 6 + w.heat * 34;
      warm.current.color.set(phase === "lost" ? "#f44a5e" : phase === "won" ? "#35d07f" : "#ffb347");
    }

    // Sparks off the axle, steam from the pipes: both follow the heat.
    sparkClock.current += clampDt;
    if (phase === "running" && w.heat > 0.3 && sparkClock.current > 0.16 / (0.3 + w.heat) && !reduced) {
      sparkClock.current = 0;
      sparks.current?.burst({ x: (Math.random() - 0.5) * 0.5, y: -R, z: 0.4 * (Math.random() - 0.5), count: 3, color: "#ffc048", speed: 3 + w.heat * 5, spread: 1.2, up: Math.PI * 0.85, life: 0.5, size: 0.022 });
    }
    steamState.current.forEach((s, i) => {
      const sprite = steam.current[i];
      if (!sprite) return;
      s.t = (s.t + clampDt * (0.3 + w.heat * 0.9)) % 1;
      sprite.position.set(-3.75 + Math.sin(s.t * 6 + i) * 0.14, -0.6 + s.t * 2.4, -0.8);
      const k = 0.55 + s.t * 1.6;
      sprite.scale.set(k, k, 1);
      (sprite.material as THREE.SpriteMaterial).opacity = (phase === "running" ? 0.06 + w.heat * 0.2 : 0.03) * (1 - s.t);
    });

    // The camera leans in as the tension rises and shakes when it's wild. None of that under reduced motion.
    const dist = baseDistance();
    shake.current = Math.max(0, shake.current - clampDt * 1.3);
    const rumble = reduced ? 0 : Math.max(shake.current, w.heat > 0.5 ? (w.heat - 0.5) * 0.09 : 0);
    const push = reduced ? 0 : w.heat * 2.4;
    const sway = reduced ? 0 : 0.38;
    camera.position.x += (1.25 + Math.sin(t * 0.25) * sway - camera.position.x) * Math.min(1, clampDt * 2.2);
    camera.position.y += (1.1 - w.heat * 0.7 - camera.position.y) * Math.min(1, clampDt * 2.2);
    camera.position.z += (dist - push - camera.position.z) * Math.min(1, clampDt * 2);
    // A narrow stage pulls the camera far back. The fog goes with it, so the wheel never fades out.
    if (state.scene.fog instanceof THREE.Fog) {
      state.scene.fog.near = dist + 3;
      state.scene.fog.far = dist + 17;
    }
    camera.lookAt(
      (Math.random() - 0.5) * rumble,
      -0.35 + (Math.random() - 0.5) * rumble,
      0,
    );
  });

  return (
    <>
      <color attach="background" args={["#0a0a0d"]} />
      <fog attach="fog" args={["#0a0a0d", 12, 26]} />
      <ambientLight intensity={0.28} />
      <spotLight ref={key} position={[3.5, 6.5, 7]} angle={0.55} penumbra={0.75} intensity={70} color="#fff0d8" decay={1.5} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight ref={warm} position={[0, 0.2, 3.2]} intensity={8} distance={12} color="#ffb347" />
      <pointLight position={[-5, 2.5, 1]} intensity={14} distance={13} color="#5b7cfa" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#fff2d8" position={[0, 4, 3]} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#5b7cfa" position={[-6, 1, 1]} rotation={[0, Math.PI / 2, 0]} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={1} color="#ffc048" position={[6, 0, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 4, 1]} />
      </Environment>

      {/* The burrow wall */}
      <mesh position={[0, 0.5, -2.4]}>
        <planeGeometry args={[30, 15]} />
        <meshStandardMaterial map={wallTex} roughness={0.9} metalness={0.2} />
      </mesh>
      {/* Floor plate */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -R - 0.42, 0]} receiveShadow>
        <planeGeometry args={[30, 14]} />
        <meshStandardMaterial color="#1a1a20" roughness={0.38} metalness={0.7} />
      </mesh>

      {/* The arch and its bulbs */}
      <mesh position={[0, 0.15, -1.2]}>
        <torusGeometry args={[4.05, 0.12, 12, 64, Math.PI]} />
        <meshStandardMaterial color="#2c2c36" metalness={0.8} roughness={0.4} />
      </mesh>
      <instancedMesh ref={bulbs} args={[undefined, undefined, BULBS]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Drivetrain behind the wheel */}
      <mesh ref={gearA} geometry={gearGeo.big} position={[-3.1, -1.05, -1.5]}>
        <meshStandardMaterial color="#8c7a3a" metalness={0.9} roughness={0.38} />
      </mesh>
      <mesh ref={gearB} geometry={gearGeo.small} position={[-1.1, -1.42, -1.5]}>
        <meshStandardMaterial color="#6a6a76" metalness={0.9} roughness={0.35} />
      </mesh>

      {/* Stand */}
      <group position={[0, 0, -1.15]}>
        <mesh position={[0, -1.3, 0]}>
          <boxGeometry args={[0.32, 2.8, 0.28]} />
          <meshStandardMaterial color="#26262e" metalness={0.75} roughness={0.45} />
        </mesh>
        <mesh position={[0, -R - 0.3, 0.2]}>
          <boxGeometry args={[3.2, 0.22, 1.8]} />
          <meshStandardMaterial color="#1b1b21" metalness={0.8} roughness={0.5} />
        </mesh>
      </group>

      {/* Steam pipe */}
      <mesh position={[-3.75, -1.8, -0.8]}>
        <cylinderGeometry args={[0.14, 0.14, 2.4, 14]} />
        <meshStandardMaterial color="#6b5a26" metalness={0.92} roughness={0.32} />
      </mesh>
      <mesh position={[-3.75, -0.58, -0.8]}>
        <cylinderGeometry args={[0.19, 0.19, 0.12, 14]} />
        <meshStandardMaterial color="#9c8236" metalness={0.92} roughness={0.28} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <sprite key={i} ref={(s) => void (steam.current[i] = s)}>
          <spriteMaterial map={glow} color="#dcdce6" transparent opacity={0} depthWrite={false} />
        </sprite>
      ))}

      {/* Pressure gauge */}
      <group position={[3.45, -0.7, -0.9]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.68, 0.68, 0.12, 36]} />
          <meshStandardMaterial color="#9c8236" metalness={0.92} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0, 0.065]}>
          <circleGeometry args={[0.58, 36]} />
          <meshStandardMaterial color="#efe8d4" roughness={0.6} />
        </mesh>
        {Array.from({ length: 13 }, (_, i) => {
          const a = Math.PI * 0.75 - (i / 12) * Math.PI * 1.5;
          return (
            <mesh key={i} position={[Math.cos(a + Math.PI / 2) * 0.47, Math.sin(a + Math.PI / 2) * 0.47, 0.07]} rotation={[0, 0, a]}>
              <boxGeometry args={[0.022, i > 9 ? 0.14 : 0.09, 0.005]} />
              <meshBasicMaterial color={i > 9 ? "#c33346" : "#26262f"} />
            </mesh>
          );
        })}
        <group ref={needle} position={[0, 0, 0.09]} rotation={[0, 0, Math.PI * 0.75]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.03, 0.46, 0.008]} />
            <meshBasicMaterial color="#c33346" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.03, 12]} />
            <meshStandardMaterial color="#26262f" />
          </mesh>
        </group>
      </group>

      {/* The seed bowl he heads for when he's done */}
      <group position={[2.75, -R - 0.32, 1]}>
        <mesh>
          <cylinderGeometry args={[0.46, 0.34, 0.2, 20]} />
          <meshStandardMaterial color="#5b7cfa" roughness={0.5} />
        </mesh>
        {[[-0.12, 0.05], [0.1, -0.1], [0.14, 0.12], [-0.05, -0.15], [0.02, 0.02]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.11, z]} rotation={[0.2 * i, i, 0.4]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshStandardMaterial color="#c98a2b" roughness={0.6} />
          </mesh>
        ))}
      </group>

      <Wheel drive={wheel} radius={R} />

      {/* He pivots around the wheel's centre, so his climb follows the curve. */}
      <group ref={runner}>
        <Hamster drive={hamster} position={[0, -R + 0.05, 0]} rotation={[0, -0.12, 0]} scale={1.05} />
      </group>

      <Particles ref={sparks} capacity={180} />
      <Particles ref={coins} capacity={80} shape="disc" />
    </>
  );
}

export default function RunScene({ live, reduced }: { live: MutableRefObject<RunLive>; reduced: boolean }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [1.2, 1.1, 12.5], fov: 38 }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
      aria-label="Squeektoshi running in the wheel"
    >
      <Stage live={live} reduced={reduced} />
    </Canvas>
  );
}
