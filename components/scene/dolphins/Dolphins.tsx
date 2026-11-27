"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createPod, stepPod, type Dolphin, type DolphinEvents, type World } from "./brain";
import { waterFx } from "../fx/waterPools";
import { daylightOf, getFrameSnapshot, view } from "../sceneFrame";
import { motionPrefs } from "../motionPrefs";
import { createSeededRandom, randomSeed } from "../random";
import { OBSTACLES } from "../landscape";

const URL = "/models/dolphin.glb";
const COUNT = 3;
const SCALE = 10;
/**
 * The model faces its local +z (checked by rendering it beside labelled axes).
 * A heading h points along (sin h, −cos h); a +z-facing model turned by ψ
 * points along (sin ψ, cos ψ), so ψ = π − h. Pitch is about local x: nose up
 * is negative; bank is about local z, the body's own axis.
 */
function yawFor(heading: number) {
  return Math.PI - heading;
}

/** Which dolphins are shown: only between sunrise and sunset (a leap under way finishes). */
const shown: boolean[] = [];

const events: DolphinEvents = {
  exit: (d) => shown[d.id] && waterFx.splash(d.x, d.z, d.kind === "breach" ? 1.5 : d.kind === "porpoise" ? 0.7 : 1, d.heading),
  entry: (d) => shown[d.id] && waterFx.splash(d.x, d.z, d.kind === "breach" ? 2 : d.kind === "porpoise" ? 0.8 : 1.2, d.heading),
  breath: (d) => shown[d.id] && waterFx.breath(d.x, d.y, d.z),
  wake: (d) => shown[d.id] && waterFx.wake(d.x - Math.sin(d.heading) * 8, d.z + Math.cos(d.heading) * 8),
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
    // Near enough that a leap reads: a 20-unit dolphin 2,000 units out is a speck.
    minRadius: 150,
    maxRadius: 800,
    view: { bearing: 0, x: 0, z: 0 },
  });
  const random = useRef<() => number>(createSeededRandom(1));

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
    };
  }, [models, animations]);

  useFrame((state, delta) => {
    const dolphins = pod.current;
    if (!dolphins) return;
    const dt = Math.min(delta, 0.05);
    const snapshot = getFrameSnapshot();
    const w = world.current;
    w.time += dt;
    w.daylight = daylightOf(snapshot);
    w.reducedMotion = motionPrefs.reduced;
    if (w.view) {
      w.view.bearing = view.bearing;
      w.view.x = state.camera.position.x;
      w.view.z = state.camera.position.z;
    }
    stepPod(dolphins, w, dt, random.current, events);

    dolphins.forEach((d, i) => {
      const group = groups.current[i];
      if (!group) return;
      if (d.phase !== "airborne") shown[d.id] = snapshot.sunElev > 0.5;
      group.visible = shown[d.id] ?? false;
      group.position.set(d.x, d.y, d.z);
      group.rotation.set(-d.pitch, yawFor(d.heading), d.bank);

      // The tail beats with speed, and all but stops in the air.
      const action = actions.current[i];
      if (action) action.timeScale = d.phase === "airborne" ? 0.12 : THREE.MathUtils.clamp(d.speed / 34, 0.6, 1.9);
      mixers.current[i]?.update(dt);
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
