"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { waterFx } from "../fx/waterPools";
import { daylightOf, getFrameSnapshot, view } from "../sceneFrame";
import { motionPrefs } from "../motionPrefs";
import { school } from "./FishSchool";

// Gulls, built in code: a body and two wings, three instanced meshes in all.
// By day they circle ahead of the view, flapping and gliding; when a fish school
// boils they circle over it and dive. They roost at night.

const BIRDS = 8;

/** One wing reaching along +x, forward along +z; the tip is dark. */
function createWingGeometry(side: 1 | -1) {
  const points = [
    [0.25, 0, 0.55],
    [0.25, 0, -0.55],
    [2.5, 0.25, 0.15],
    [4.3, 0, -0.55],
  ].map(([x, y, z]) => [x * side, y, z]);
  const position = new Float32Array([
    ...points[0], ...points[1], ...points[2],
    ...points[1], ...points[3], ...points[2],
  ]);
  const grey = [0.78, 0.8, 0.83];
  const tip = [0.16, 0.17, 0.19];
  const color = new Float32Array([...grey, ...grey, ...grey, ...grey, ...tip, ...grey]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.computeVertexNormals();
  return geometry;
}

interface Bird {
  angle: number;
  angularSpeed: number;
  radius: number;
  altitude: number;
  phase: number;
  diving: number; // seconds into a dive, or -1
  diveX: number;
  diveZ: number;
  splashed: boolean;
}

export default function Birds() {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const leftWings = useRef<THREE.InstancedMesh>(null);
  const rightWings = useRef<THREE.InstancedMesh>(null);
  const birds = useRef<Bird[]>(
    Array.from({ length: BIRDS }, (_, i) => ({
      angle: (i / BIRDS) * Math.PI * 2,
      angularSpeed: (0.22 + (i % 3) * 0.08) * (i % 2 === 0 ? 1 : -1),
      radius: 70 + (i % 4) * 28,
      altitude: 45 + (i % 5) * 16,
      phase: i * 1.7,
      diving: -1,
      diveX: 0,
      diveZ: 0,
      splashed: false,
    }))
  );
  const center = useRef(new THREE.Vector3(0, 0, -380));
  const scratch = useRef({
    body: new THREE.Matrix4(),
    wing: new THREE.Matrix4(),
    flap: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    euler: new THREE.Euler(0, 0, 0, "YXZ"),
    scale: new THREE.Vector3(),
    zero: new THREE.Matrix4().makeScale(0, 0, 0),
  });

  const bodyGeometry = useMemo(() => new THREE.OctahedronGeometry(1, 1).scale(0.42, 0.38, 1.5), []);
  const leftGeometry = useMemo(() => createWingGeometry(-1), []);
  const rightGeometry = useMemo(() => createWingGeometry(1), []);
  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f2f4f6", roughness: 0.7 }), []);
  const wingMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }),
    []
  );

  useEffect(
    () => () => {
      [bodyGeometry, leftGeometry, rightGeometry, bodyMaterial, wingMaterial].forEach((item) => item.dispose());
    },
    [bodyGeometry, leftGeometry, rightGeometry, bodyMaterial, wingMaterial]
  );

  useFrame((state, delta) => {
    const body = bodies.current;
    const left = leftWings.current;
    const right = rightWings.current;
    if (!body || !left || !right) return;
    const s = scratch.current;
    const dt = Math.min(delta, 0.05);
    const time = state.clock.elapsedTime;
    const daylight = daylightOf(getFrameSnapshot());
    // Roosting at night: they shrink away as the light goes.
    const presence = THREE.MathUtils.smoothstep(daylight, 0.15, 0.45);

    // Where they circle: over the fish when they boil, else ahead of the view.
    if (school.active) {
      center.current.set(school.x, 0, school.z);
    } else {
      const bearing = view.bearing + view.turning * 0.35;
      const target = s.position.set(Math.sin(bearing) * 360, 0, -Math.cos(bearing) * 360);
      center.current.lerp(target, Math.min(1, dt * 0.05));
    }

    birds.current.forEach((bird, i) => {
      if (presence <= 0.01) {
        body.setMatrixAt(i, s.zero);
        left.setMatrixAt(i, s.zero);
        right.setMatrixAt(i, s.zero);
        return;
      }
      bird.angle += bird.angularSpeed * dt;
      let x = center.current.x + Math.cos(bird.angle) * bird.radius;
      let z = center.current.z + Math.sin(bird.angle) * bird.radius;
      let y = bird.altitude + Math.sin(time * 0.6 + bird.phase) * 4;
      // Flying along the circle: velocity (−sin θ, cos θ) times the turn's sign.
      const turn = Math.sign(bird.angularSpeed);
      const heading = Math.atan2(-turn * Math.sin(bird.angle), -turn * Math.cos(bird.angle));
      let pitch = 0;
      const bank = -turn * 0.35;
      let flap = Math.sin(time * 7 + bird.phase) * (Math.sin(time * 0.35 + bird.phase) > 0.2 ? 0.55 : 0.06);

      // Diving on the fish: fold, plunge, splash, climb back.
      if (school.active && bird.diving < 0 && !motionPrefs.reduced && Math.random() < dt * 0.09) {
        bird.diving = 0;
        bird.splashed = false;
        bird.diveX = school.x + (Math.random() - 0.5) * 40;
        bird.diveZ = school.z + (Math.random() - 0.5) * 40;
      }
      if (bird.diving >= 0) {
        bird.diving += dt;
        const down = Math.min(1, bird.diving / 1.3);
        const up = Math.max(0, (bird.diving - 1.5) / 2.4);
        const k = up > 0 ? 1 - up : down * down;
        x += (bird.diveX - x) * k;
        z += (bird.diveZ - z) * k;
        y = y * (1 - k) + 0.5 * k;
        // A model facing +z: positive pitch is nose down.
        pitch = up > 0 ? -0.6 : 1.1 * down;
        flap = up > 0 ? Math.sin(time * 9) * 0.6 : -1.1;
        if (!bird.splashed && bird.diving >= 1.3) {
          waterFx.splash(bird.diveX, bird.diveZ, 0.3);
          bird.splashed = true;
        }
        if (up >= 1) bird.diving = -1;
      }

      s.position.set(x, y, z);
      // The model's forward is +z: turn it to face the heading.
      s.euler.set(pitch, Math.PI - heading, bank);
      s.quaternion.setFromEuler(s.euler);
      s.scale.setScalar(1.7 * presence);
      s.body.compose(s.position, s.quaternion, s.scale);
      body.setMatrixAt(i, s.body);
      // Wings hinge on the body's forward axis.
      s.flap.makeRotationZ(flap);
      left.setMatrixAt(i, s.wing.multiplyMatrices(s.body, s.flap));
      s.flap.makeRotationZ(-flap);
      right.setMatrixAt(i, s.wing.multiplyMatrices(s.body, s.flap));
    });
    body.instanceMatrix.needsUpdate = true;
    left.instanceMatrix.needsUpdate = true;
    right.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[bodyGeometry, bodyMaterial, BIRDS]} frustumCulled={false} />
      <instancedMesh ref={leftWings} args={[leftGeometry, wingMaterial, BIRDS]} frustumCulled={false} />
      <instancedMesh ref={rightWings} args={[rightGeometry, wingMaterial, BIRDS]} frustumCulled={false} />
    </>
  );
}
