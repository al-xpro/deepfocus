"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { waterFx } from "../fx/waterPools";
import { quickLife, view } from "../sceneFrame";
import { motionPrefs } from "../motionPrefs";

// A rare whale: every three to five minutes, far out and just ahead of where
// the view is turning, a blue whale surfaces twice to blow, and sometimes
// breaches. Rare enough to feel like luck. (blue_whale.glb, CC BY: CREDITS.md)

const URL = "/models/blue_whale.glb";
/** About seven dolphins long. The model's skinned size is measured at runtime. */
const LENGTH = 140;
/** The model faces its local −z; headings are measured from −z too. */
const MODEL_YAW = 0;
const FIRST_AFTER: [number, number] = [45, 75];
const EVERY: [number, number] = [180, 300];

interface Visit {
  start: number;
  x: number;
  z: number;
  heading: number;
  breach: boolean;
  blown: Set<number>;
  splashed: boolean;
}

function between([min, max]: [number, number]) {
  return min + (max - min) * Math.random();
}

/** Depth over the visit: two surfacings to blow, then a dive or a breach. */
function depthAt(t: number, breach: boolean) {
  const surface = (from: number, to: number) => {
    if (t < from || t > to) return -1;
    const k = (t - from) / (to - from);
    return Math.sin(k * Math.PI);
  };
  const s = Math.max(surface(0, 7), surface(11, 18));
  if (s >= 0) return -34 + s * 31; // the back breaks the surface at the top
  if (breach && t >= 21 && t <= 26.5) {
    // Out of the water on a high, slow arc.
    const k = (t - 21) / 5.5;
    return -40 + 120 * k - 105 * k * k;
  }
  return -60;
}

export default function Whale() {
  const { scene, animations } = useGLTF(URL, false);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const measured = useRef(false);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const visit = useRef<Visit | null>(null);
  const nextVisitAt = useRef(-1);
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene) as THREE.Group;
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
      material.envMapIntensity = 1;
      material.roughness = 0.6;
      mesh.material = material;
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    mixer.current = new THREE.AnimationMixer(model);
    if (animations[0]) {
      // The swim lives in the bones' rotations. The clip's translation tracks
      // (root motion from the original FBX, in other units) throw the rig far
      // out of place, so they're left out.
      const clip = animations[0].clone();
      clip.tracks = clip.tracks.filter((track) => !track.name.endsWith(".position"));
      mixer.current.clipAction(clip).play();
    }
    if (group.current) group.current.rotation.order = "YXZ";
    return () => {
      mixer.current?.stopAllAction();
    };
  }, [model, animations]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g || !body.current) return;
    // Sized from the skinned model as drawn (its mesh alone gives a very
    // different size), so the whale is LENGTH units long whatever its units.
    if (!measured.current) {
      body.current.scale.setScalar(1);
      model.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(model, true).getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      if (longest > 0) {
        body.current.scale.setScalar(LENGTH / longest);
        measured.current = true;
      }
    }
    const time = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    if (nextVisitAt.current < 0) nextVisitAt.current = time + (quickLife ? 9 : between(FIRST_AFTER));

    if (!visit.current && time >= nextVisitAt.current) {
      const bearing = view.bearing + view.turning * 0.6;
      const distance = between([1400, 2200]);
      visit.current = {
        start: time,
        x: Math.sin(bearing) * distance,
        z: -Math.cos(bearing) * distance,
        heading: bearing + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1),
        breach: !motionPrefs.reduced && (quickLife || Math.random() < 0.35),
        blown: new Set(),
        splashed: false,
      };
    }

    const v = visit.current;
    if (!v) {
      g.visible = false;
      return;
    }
    const t = time - v.start;
    if (t > 30) {
      visit.current = null;
      nextVisitAt.current = time + (quickLife ? 45 : between(EVERY));
      g.visible = false;
      return;
    }

    // Swims slowly along its heading.
    const travel = t * 9;
    const x = v.x + Math.sin(v.heading) * travel;
    const z = v.z - Math.cos(v.heading) * travel;
    const y = depthAt(t, v.breach);
    g.visible = y > -55;
    g.position.set(x, y, z);

    let pitch = 0;
    let roll = 0;
    if (v.breach && t >= 21 && t <= 26.5) {
      const k = (t - 21) / 5.5;
      pitch = 1.15 * (1 - 2 * k); // nose up out of the water, over and down
      roll = k * 1.4; // turning onto its side to land
    }
    g.rotation.set(pitch, v.heading + MODEL_YAW, roll);

    // Two blows at the top of each surfacing.
    for (const at of [3.2, 14.2]) {
      if (t >= at && !v.blown.has(at)) {
        v.blown.add(at);
        waterFx.spout(x + Math.sin(v.heading) * 20, z - Math.cos(v.heading) * 20, 30);
      }
    }
    // The breach meets the water on its side: the biggest splash there is.
    if (v.breach && !v.splashed && t >= 26) {
      v.splashed = true;
      waterFx.splash(x, z, 3.2, v.heading);
      waterFx.ripple(x, z, 40, 1);
    }

    mixer.current?.update(dt * 0.6);
  });

  return (
    <group ref={group} visible={false}>
      <group ref={body}>
        <primitive object={model} />
      </group>
    </group>
  );
}

useGLTF.preload(URL, false);
