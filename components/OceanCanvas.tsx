"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Preload, useProgress } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import OceanScene from "./scene/OceanScene";
import { setSceneTimeOverride } from "./scene/sceneParams";
import { motionPrefs } from "./scene/motionPrefs";

function SceneLoadReporter({
  onProgressChange,
  onReadyChange,
}: {
  onProgressChange?: (progress: number) => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const { active, progress, loaded, total } = useProgress();
  const [readyLatched, setReadyLatched] = useState(false);

  useEffect(() => {
    onProgressChange?.(progress);
  }, [onProgressChange, progress]);

  useEffect(() => {
    if (readyLatched) return;
    const isReady = total > 0 && loaded >= total && progress >= 99.9 && !active;
    if (!isReady) return;

    const timeout = window.setTimeout(() => {
      setReadyLatched(true);
      onReadyChange?.(true);
    }, 650);
    return () => clearTimeout(timeout);
  }, [active, loaded, onReadyChange, progress, readyLatched, total]);

  return null;
}

/**
 * The 3D scene, full screen behind the page. The sky and the sea draw at once;
 * the models fade in as they arrive, and `onProgressChange` reports the
 * download so the page can show a progress line.
 */
export default function OceanCanvas({
  timeOverrideHour = null,
  showModels = true,
  onProgressChange,
  onReadyChange,
}: {
  timeOverrideHour?: number | null;
  /** False for a lighter scene: sky, sea and stars, no models (the 404 page). */
  showModels?: boolean;
  onProgressChange?: (progress: number) => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setSceneTimeOverride(timeOverrideHour);
  }, [timeOverrideHour]);

  useEffect(() => {
    motionPrefs.reduced = Boolean(reduceMotion);
  }, [reduceMotion]);

  return (
    <Canvas
      dpr={[1, 1.5]}
      className="animate-fade-in"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "auto",
        zIndex: 0,
      }}
      camera={{
        fov: 55,
        near: 1,
        far: 20_000,
        position: [0, 22, 90],
      }}
      onCreated={({ camera }) => camera.lookAt(0, 8, 0)}
      gl={{
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.1,
        outputColorSpace: THREE.SRGBColorSpace,
        powerPreference: "high-performance",
        antialias: true,
      }}
    >
      <Preload all />
      <SceneLoadReporter onProgressChange={onProgressChange} onReadyChange={onReadyChange} />
      <OceanScene showModels={showModels} />
    </Canvas>
  );
}
