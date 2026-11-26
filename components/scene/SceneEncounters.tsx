"use client";

import { Suspense, useCallback, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { vecFromSpherical } from "./timeUtils";
import { getFrameSnapshot } from "./sceneFrame";
import { Landmark, PLACEMENTS, ReefPalms, Volcano } from "./landscape";
import Dolphins from "./dolphins/Dolphins";
import WaterFx from "./fx/WaterFx";
import Gulls from "./life/Gulls";

// Everything that lives in the scene besides the sky and the sea: the light,
// the landscape, and the life. Each model loads on its own boundary; the
// loading panel covers the wait.

function EncounterLightRig() {
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const glareLightRef = useRef<THREE.DirectionalLight>(null);
  const fillLightRef = useRef<THREE.DirectionalLight>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const _sunVector = useRef(new THREE.Vector3());
  const _moonVector = useRef(new THREE.Vector3());
  const _glareOffset = useRef(new THREE.Vector3());

  useFrame(() => {
    if (
      !sunLightRef.current ||
      !glareLightRef.current ||
      !fillLightRef.current ||
      !moonLightRef.current ||
      !hemiLightRef.current ||
      !ambientLightRef.current ||
      !targetRef.current
    )
      return;

    const scene = getFrameSnapshot();

    vecFromSpherical(Math.max(scene.sunElev, 4), scene.sunAz, _sunVector.current);
    sunLightRef.current.position.copy(_sunVector.current).multiplyScalar(360);
    sunLightRef.current.target = targetRef.current;
    sunLightRef.current.color.setHex(scene.lightColorHex);
    sunLightRef.current.intensity = THREE.MathUtils.lerp(0.26, 1.95, 1 - scene.nightFactor);

    _glareOffset.current.set(120, 58, 190);
    glareLightRef.current.position
      .copy(_sunVector.current)
      .multiplyScalar(280)
      .add(_glareOffset.current);
    glareLightRef.current.target = targetRef.current;
    glareLightRef.current.color.setHex(scene.sunColorHex);
    glareLightRef.current.intensity = THREE.MathUtils.lerp(0.05, 0.94, 1 - scene.nightFactor);

    fillLightRef.current.position.set(220, 145, 260);
    fillLightRef.current.target = targetRef.current;
    fillLightRef.current.color.setHex(scene.lightColorHex);
    fillLightRef.current.intensity = THREE.MathUtils.lerp(0.18, 0.92, 1 - scene.nightFactor);

    vecFromSpherical(Math.max(scene.moonElev, 6), scene.moonAz, _moonVector.current);
    moonLightRef.current.position.copy(_moonVector.current).multiplyScalar(340);
    moonLightRef.current.target = targetRef.current;
    moonLightRef.current.color.setHex(0xbfd6ff);
    moonLightRef.current.intensity = THREE.MathUtils.lerp(0.06, 0.46, scene.nightFactor);

    hemiLightRef.current.intensity = THREE.MathUtils.lerp(0.24, 0.54, 1 - scene.nightFactor * 0.5);
    hemiLightRef.current.color.setHex(0xe1ecff);
    hemiLightRef.current.groundColor.setHex(0x092236);

    ambientLightRef.current.color.setHex(scene.lightColorHex);
    ambientLightRef.current.intensity = THREE.MathUtils.lerp(
      0.12,
      0.34,
      1 - scene.nightFactor * 0.4
    );
  });

  return (
    <>
      <object3D ref={targetRef} position={[0, 8, -110]} />
      <directionalLight ref={sunLightRef} intensity={1} color="#f7fbff" />
      <directionalLight ref={glareLightRef} intensity={0.7} color="#ffd0a4" />
      <directionalLight ref={fillLightRef} intensity={0.4} color="#e6efff" />
      <directionalLight ref={moonLightRef} intensity={0.4} color="#bfd6ff" />
      <hemisphereLight ref={hemiLightRef} intensity={0.45} color="#e1ecff" groundColor="#092236" />
      <ambientLight ref={ambientLightRef} intensity={0.2} color="#edf4ff" />
    </>
  );
}

function Arrival({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

export default function SceneEncounters() {
  const [reef, setReef] = useState<THREE.Object3D | null>(null);
  // The rocks gulls can perch on, as they arrive.
  const [rocks, setRocks] = useState<THREE.Object3D[]>([]);
  const addRock = useCallback((rock: THREE.Object3D) => {
    setRocks((current) => (current.includes(rock) ? current : [...current, rock]));
  }, []);

  return (
    <>
      <EncounterLightRig />

      <Arrival>
        <Landmark placement={PLACEMENTS.promontory} />
      </Arrival>
      <Arrival>
        <Landmark placement={PLACEMENTS.reef} onModel={setReef}>
          <ReefPalms reef={reef} />
        </Landmark>
      </Arrival>
      <Arrival>
        <Landmark placement={PLACEMENTS.cliffRock} onModel={addRock} />
      </Arrival>
      <Arrival>
        <Landmark placement={PLACEMENTS.seaStacks} onModel={addRock} />
      </Arrival>
      <Arrival>
        <Landmark placement={PLACEMENTS.seaStacksSmall} onModel={addRock} />
      </Arrival>
      <Arrival>
        <Volcano />
      </Arrival>

      <Arrival>
        <Dolphins />
      </Arrival>
      <Arrival>
        <Gulls rocks={rocks} />
      </Arrival>
      <WaterFx />
    </>
  );
}
