"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { waterFx } from "../fx/waterPools";
import { daylightOf, getFrameSnapshot, quickLife, view } from "../sceneFrame";
import { callDolphin } from "../dolphins/Dolphins";

// A bait ball: now and then by day, a small school boils at the surface ahead of
// the view. Silver fish flick out of the water and back, the water ripples, the
// gulls come to dive, and a dolphin comes to see.

export const school = { active: false, x: 0, z: 0, endsAt: 0 };

const FISH = 30;
const SPREAD = 30;
const DURATION = 24;

interface Hop {
  startAt: number;
  duration: number;
  height: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
}

export default function FishSchool() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const hops = useRef<Hop[]>([]);
  const nextSchoolAt = useRef(-1);
  const nextRippleAt = useRef(0);
  const matrix = useRef(new THREE.Matrix4());
  const quaternion = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const position = useRef(new THREE.Vector3());
  const scale = useRef(new THREE.Vector3(1, 1, 1));

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 5).scale(0.32, 0.22, 1.25), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#d6dde4", metalness: 0.9, roughness: 0.22, envMapIntensity: 1.6 }),
    []
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame((state) => {
    const instances = mesh.current;
    if (!instances) return;
    const time = state.clock.elapsedTime;
    const daylight = daylightOf(getFrameSnapshot());
    if (nextSchoolAt.current < 0) nextSchoolAt.current = time + (quickLife ? 5 : 35 + Math.random() * 25);

    if (!school.active && time >= nextSchoolAt.current && daylight > 0.5) {
      const bearing = view.bearing + view.turning * 0.45;
      const radius = 200 + Math.random() * 140;
      school.x = Math.sin(bearing) * radius;
      school.z = -Math.cos(bearing) * radius;
      school.active = true;
      school.endsAt = time + DURATION;
      hops.current = Array.from({ length: FISH }, () => ({ startAt: time + Math.random() * 3, duration: 0, height: 0, x: 0, z: 0, dx: 0, dz: 0 }));
      callDolphin(school.x, school.z);
    }
    if (school.active && time >= school.endsAt) {
      school.active = false;
      nextSchoolAt.current = time + (quickLife ? 20 : 50 + Math.random() * 40);
    }

    // The water boils where the school is.
    if (school.active && time >= nextRippleAt.current) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * SPREAD;
      waterFx.ripple(school.x + Math.cos(a) * r, school.z + Math.sin(a) * r, 2.6, 0.5);
      nextRippleAt.current = time + 0.12;
    }

    for (let i = 0; i < FISH; i++) {
      const hop = hops.current[i];
      let visible = false;
      if (school.active && hop) {
        if (time >= hop.startAt + hop.duration) {
          // A new hop: somewhere in the school, a short arc in a random direction.
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * SPREAD;
          hop.x = school.x + Math.cos(a) * r;
          hop.z = school.z + Math.sin(a) * r;
          const d = Math.random() * Math.PI * 2;
          hop.dx = Math.sin(d);
          hop.dz = -Math.cos(d);
          hop.duration = 0.4 + Math.random() * 0.3;
          hop.height = 1.4 + Math.random() * 2.4;
          hop.startAt = time + Math.random() * 1.6;
          waterFx.ripple(hop.x, hop.z, 2, 0.45);
          if (Math.random() < 0.35) waterFx.splash(hop.x, hop.z, 0.12, Math.atan2(hop.dx, -hop.dz));
        }
        const t = (time - hop.startAt) / hop.duration;
        if (t >= 0 && t <= 1) {
          visible = true;
          const travel = 5 * t;
          position.current.set(hop.x + hop.dx * travel, 4 * hop.height * t * (1 - t), hop.z + hop.dz * travel);
          // Nose along the arc.
          euler.current.set(-Math.atan2(4 * hop.height * (1 - 2 * t), 5), Math.PI - Math.atan2(hop.dx, -hop.dz), 0);
          quaternion.current.setFromEuler(euler.current);
          scale.current.setScalar(2.4);
          matrix.current.compose(position.current, quaternion.current, scale.current);
        }
      }
      if (!visible) matrix.current.makeScale(0, 0, 0);
      instances.setMatrixAt(i, matrix.current);
    }
    instances.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, FISH]} frustumCulled={false} />;
}
