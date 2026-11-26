"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { waterFx } from "./fx/waterPools";
import { callDolphin } from "./dolphins/Dolphins";

/** Under this much movement, and this quick, a press is a tap, not a drag. */
const TAP_DISTANCE = 8;
const TAP_TIME = 500;

/**
 * Touch the water: a tap on the sea sends a ripple, and the nearest dolphin may
 * come to look and leap there. A drag still turns the view.
 */
export default function TouchWater() {
  const { gl, camera } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const water = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointer = new THREE.Vector2();
    const hit = new THREE.Vector3();
    let down: { x: number; y: number; time: number } | null = null;

    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY, time: performance.now() };
    };
    const onUp = (event: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const quick = performance.now() - down.time < TAP_TIME;
      down = null;
      if (moved > TAP_DISTANCE || !quick) return;
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(water, hit)) return;
      if (hit.length() > 2600) return;
      waterFx.ripple(hit.x, hit.z, 10, 1);
      waterFx.splash(hit.x, hit.z, 0.22);
      callDolphin(hit.x, hit.z);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera]);

  return null;
}
