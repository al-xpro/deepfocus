import * as THREE from "three";

/** A small, fast seeded random generator (mulberry32). */
export function createSeededRandom(seed: number) {
  let t = seed >>> 0 || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function randomSeed() {
  const values = new Uint32Array(1);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(values);
    return values[0];
  }
  return 2_654_435_761;
}

export function randomRange(random: () => number, min: number, max: number) {
  return min + (max - min) * random();
}

/**
 * A point on the water, `radius` units from the camera's pivot, at a bearing in
 * degrees: 0° straight ahead of the starting view, 90° to its right.
 */
export function frontArcPosition(radius: number, angleDeg: number, y: number) {
  const theta = THREE.MathUtils.degToRad(angleDeg);
  return new THREE.Vector3(Math.sin(theta) * radius, y, -Math.cos(theta) * radius);
}
