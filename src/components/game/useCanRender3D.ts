"use client";
import { useEffect, useState } from "react";
import { hasWebGL } from "@/client/env";
import { useArcade } from "@/client/store";

/** Null until checked in the browser, then false for Lite mode or no WebGL. */
export function useCanRender3D() {
  const lite = useArcade((s) => s.lite);
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => setGl(hasWebGL()), []);
  if (gl === null) return null;
  return gl && !lite;
}
