"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { attract, createPod, stepPod, type Dolphin, type DolphinEvents, type World } from "./brain";
import { waterFx } from "../fx/waterPools";
import { daylightOf, getFrameSnapshot } from "../sceneFrame";
import { motionPrefs } from "../motionPrefs";
import { createSeededRandom, randomSeed } from "../random";
import { OBSTACLES } from "../landscape";

const URL = "/models/dolphin.glb";
const COUNT = 3;
const SCALE = 10;
/** The model faces its local +x; headings are measured from −z. */
const MODEL_YAW = Math.PI / 2;

// The current pod, so a tap on the water (TouchWater) or a fish school can call
// a dolphin over.
let livePod: Dolphin[] | null = null;
export function callDolphin(x: number, z: number) {
  return livePod ? attract(livePod, x, z) !== null : false;
}

const events: DolphinEvents = {
  exit: (d) => waterFx.splash(d.x, d.z, d.kind === "breach" ? 1.5 : d.kind === "porpoise" ? 0.7 : 1, d.heading),
  entry: (d) => waterFx.splash(d.x, d.z, d.kind === "breach" ? 2 : d.kind === "porpoise" ? 0.8 : 1.2, d.heading),
  breath: (d) => waterFx.breath(d.x, d.y, d.z),
  wake: (d) => waterFx.wake(d.x, d.z),
};

export default function Dolphins() {
  const { scene, animations } = useGLTF(URL, false);
  const groups = useRef<Array<THREE.Group | null>>([]);
  const mixers = useRef<THREE.AnimationMixer[]>([]);
  const actions = useRef<THREE.AnimationAction[]>([]);
  const pod = useRef<Dolphin[] | null>(null);
  const world = useRef<World>({
    time: 0,
    daylight: 1,
    reducedMotion: false,
    obstacles: OBSTACLES,
    minRadius: 140,
    maxRadius: 2000,
  });
  const random = useRef<() => number>(createSeededRandom(1));
  const sparkAt = useRef<number[]>([0, 0, 0]);

  const models = useMemo(
    () =>
      Array.from({ length: COUNT }, () => {
        const clone = cloneSkeleton(scene) as THREE.Group;
        clone.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const material = (mesh.material as THREE.MeshStandardMaterial).clone();
          if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
          material.envMapIntensity = 1.1;
          material.roughness = 0.55;
          material.metalness = 0.05;
          mesh.material = material;
        });
        return clone;
      }),
    [scene]
  );

  useEffect(() => {
    random.current = createSeededRandom(randomSeed());
    pod.current = createPod(COUNT, world.current, random.current);
    livePod = pod.current;
    mixers.current = models.map((model) => new THREE.AnimationMixer(model));
    actions.current = mixers.current.map((mixer, i) => {
      const action = mixer.clipAction(animations[0]);
      action.play();
      mixer.setTime((i * 0.37) % (animations[0]?.duration || 1));
      return action;
    });
    for (const group of groups.current) if (group) group.rotation.order = "YXZ";
    return () => {
      mixers.current.forEach((mixer) => mixer.stopAllAction());
      livePod = null;
    };
  }, [models, animations]);

  useFrame((_, delta) => {
    const dolphins = pod.current;
    if (!dolphins) return;
    const dt = Math.min(delta, 0.05);
    const snapshot = getFrameSnapshot();
    const w = world.current;
    w.time += dt;
    w.daylight = daylightOf(snapshot);
    w.reducedMotion = motionPrefs.reduced;
    stepPod(dolphins, w, dt, random.current, events);

    const night = 1 - w.daylight;
    dolphins.forEach((d, i) => {
      const group = groups.current[i];
      if (!group) return;
      group.position.set(d.x, d.y, d.z);
      group.rotation.set(-d.pitch, d.heading + MODEL_YAW, d.bank);

      // The tail beats with speed, and all but stops in the air.
      const action = actions.current[i];
      if (action) action.timeScale = d.phase === "airborne" ? 0.12 : THREE.MathUtils.clamp(d.speed / 34, 0.6, 1.9);
      mixers.current[i]?.update(dt);

      // At night the water glows where a dolphin stirs it near the surface.
      if (night > 0.35 && d.y > -4 && w.time >= sparkAt.current[i]) {
        waterFx.spark(d.x, d.z, 4);
        sparkAt.current[i] = w.time + 0.07;
      }
    });
  });

  return (
    <>
      {models.map((model, i) => (
        <group
          key={i}
          ref={(group) => {
            groups.current[i] = group;
          }}
          scale={SCALE}
        >
          <primitive object={model} />
        </group>
      ))}
    </>
  );
}

useGLTF.preload(URL, false);
