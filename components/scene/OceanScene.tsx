"use client";

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Sky as SkyImpl } from "three/examples/jsm/objects/Sky.js";
import * as THREE from "three";
import Ocean from "./Ocean";
import SceneEncounters from "./SceneEncounters";
import { type SceneSnapshot, vecFromSpherical } from "./timeUtils";
import { publishSceneTone } from "./sceneTone";
import { daylightOf, getFrameSnapshot, getWeather, hazeColor, hazeDensity, lightning, updateFrameSnapshot, view } from "./sceneFrame";

const SKY_OBJECT_LAYER = 1;

const CONSTELLATION_SETS = [
  {
    stars: [
      { elevation: 7, azimuth: 357.8 },
      { elevation: 7.6, azimuth: 353.8 },
      { elevation: 8.8, azimuth: 353.3 },
      { elevation: 10.3, azimuth: 352.9 },
      { elevation: 13.2, azimuth: 357.3 },
      { elevation: 13.3, azimuth: 361.3 },
      { elevation: 15.4, azimuth: 364 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  },
  {
    stars: [
      { elevation: 8.3, azimuth: 332.3 },
      { elevation: 9.2, azimuth: 331.5 },
      { elevation: 14, azimuth: 331 },
      { elevation: 18.8, azimuth: 332 },
      { elevation: 18.4, azimuth: 334.7 },
      { elevation: 18, azimuth: 336.4 },
      { elevation: 17.3, azimuth: 337.8 },
      { elevation: 19.3, azimuth: 339.3 },
      { elevation: 20.2, azimuth: 330.3 },
      { elevation: 18, azimuth: 328 },
      { elevation: 14.1, azimuth: 327.4 },
      { elevation: 19.5, azimuth: 325 },
      { elevation: 21.7, azimuth: 330.2 },
      { elevation: 24.7, azimuth: 329.3 },
    ],
    segments: [
      [0, 1],
      [0, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [3, 8],
      [8, 9],
      [9, 10],
      [8, 11],
      [8, 12],
      [12, 13],
    ],
  },

  // Ursa Minor
  {
    stars: [
      { elevation: 16.2, azimuth: 18.5 },
      { elevation: 18.9, azimuth: 16 },
      { elevation: 21.9, azimuth: 16.2 },
      { elevation: 24.5, azimuth: 18.9 },
      { elevation: 26.8, azimuth: 22.4 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },

  // Ursa Minor
  {
    stars: [
      { elevation: 16.6, azimuth: 18.4 },
      { elevation: 21.6, azimuth: 20.6 },
      { elevation: 22.3, azimuth: 16.2 },
    ],
    segments: [
      [0, 1],
      [1, 2],
    ],
  },
  {
    stars: [
      { elevation: 15.3, azimuth: 241 },
      { elevation: 12.3, azimuth: 238.8 },
      { elevation: 15, azimuth: 237.7 },
      { elevation: 14.2, azimuth: 233.5 },
      { elevation: 14.3, azimuth: 233.1 },
      { elevation: 18.9, azimuth: 232.5 },
      { elevation: 19.9, azimuth: 226.5 },
      { elevation: 23.5, azimuth: 224.8 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ],
  },
  {
    stars: [
      { elevation: 13.2, azimuth: 163.8 },
      { elevation: 13.5, azimuth: 166.8 },
      { elevation: 14, azimuth: 173.8 },
      { elevation: 12.7, azimuth: 173.5 },
      { elevation: 10.8, azimuth: 173.2 },
      { elevation: 8.7, azimuth: 175.3 },
      { elevation: 13.6, azimuth: 174.9 },
      { elevation: 14.4, azimuth: 179 },
      { elevation: 13.8, azimuth: 184.6 },
      { elevation: 15.4, azimuth: 172.9 },
      { elevation: 16.8, azimuth: 175 },
      { elevation: 18.8, azimuth: 176.4 },
      { elevation: 20, azimuth: 178 },
      { elevation: 21, azimuth: 177.8 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [2, 6],
      [6, 7],
      [7, 8],
      [2, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [12, 13],
    ],
  },
  {
    stars: [
      { elevation: 12.8, azimuth: 140.7 },
      { elevation: 17.2, azimuth: 136.2 },
      { elevation: 18.6, azimuth: 141 },
      { elevation: 22.7, azimuth: 137.5 },
      { elevation: 22, azimuth: 134.2 },
      { elevation: 17.2, azimuth: 136.2 },
      { elevation: 12.8, azimuth: 140.7 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [2, 6],
    ],
  },
  {
    stars: [
      { elevation: 19, azimuth: 158.8 },
      { elevation: 22, azimuth: 158.5 },
      { elevation: 23.6, azimuth: 155.3 },
      { elevation: 20.7, azimuth: 150.8 },
    ],
    segments: [[0, 1], [1, 2], [2, 3]],
  },
  {
    stars: [
      { elevation: 14, azimuth: 83.6 },
      { elevation: 16.2, azimuth: 86.2 },
      { elevation: 14.5, azimuth: 90.5 },
      { elevation: 11.7, azimuth: 87.5 },
      { elevation: 13.9, azimuth: 83.6 },
      { elevation: 11.9, azimuth: 90 },
      { elevation: 11.9, azimuth: 93.8 },
      { elevation: 12.6, azimuth: 95.2 },
      { elevation: 13.1, azimuth: 98.8 },
      { elevation: 14.2, azimuth: 99.4 },
      { elevation: 16.7, azimuth: 103 },
      { elevation: 18.5, azimuth: 102.7 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [3, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
    ],
  },

  // Andromeda pt. 1
  {
    stars: [
      { elevation: 25.8, azimuth: 39.3 },
      { elevation: 21.1, azimuth: 39.3 },
      { elevation: 18.6, azimuth: 40.6 },
      { elevation: 16, azimuth: 44.7 },
      { elevation: 18.8, azimuth: 47.7 },
      { elevation: 13.2, azimuth: 40.8 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [3, 5],
    ],
  },
  // Andromeda pt. 2
  {
    stars: [
      { elevation: 17.7, azimuth: 50.1 },
      { elevation: 14.3, azimuth: 47.3 },
      { elevation: 10.8, azimuth: 41.7 },
    ],
    segments: [
      [0, 1],
      [1, 2],
    ],
  },
  {
    stars: [
      { elevation: 24.5, azimuth: 62.5 },
      { elevation: 24.4, azimuth: 64.3 },
      { elevation: 22.9, azimuth: 63.5 },
      { elevation: 19.7, azimuth: 59.8 },
      { elevation: 23.7, azimuth: 60.6 },
      { elevation: 22.9, azimuth: 63.5 },
      { elevation: 23.4, azimuth: 56.9 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [0, 4],
      [4, 5],
      [4, 6],
    ],
  },
  {
    stars: [
      { elevation: 18, azimuth: 111.3 },
      { elevation: 16.2, azimuth: 116 },
      { elevation: 14.8, azimuth: 117.2 },
      { elevation: 13.3, azimuth: 117.7 },
      { elevation: 11.3, azimuth: 116.4 },
      { elevation: 10.4, azimuth: 118.4 },
      { elevation: 5.6, azimuth: 116.5 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  },
  {
    stars: [
      { elevation: 16.4, azimuth: 204.2 },
      { elevation: 17.8, azimuth: 210.2 },
      { elevation: 15.6, azimuth: 199.8 },
      { elevation: 15.7, azimuth: 196.2 },
      { elevation: 13.1, azimuth: 207.5 },
    ],
    segments: [
      [0, 1],
      [0, 2],
      [2, 3],
      [0, 4],
    ],
  },
  {
    stars: [
      { elevation: 12.7, azimuth: 269.3 },
      { elevation: 14.4, azimuth: 262.8 },
      { elevation: 10.3, azimuth: 266 },
      { elevation: 16.7, azimuth: 259.5 },
      { elevation: 21.5, azimuth: 265.5 },
      { elevation: 21.5, azimuth: 255.8 },
      { elevation: 22.7, azimuth: 253.8 },
      { elevation: 25.3, azimuth: 257.1 },
      { elevation: 19.1, azimuth: 252 },
      { elevation: 25.8, azimuth: 253 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [3, 5],
      [5, 6],
      [6, 7],
      [6, 8],
      [6, 9],
    ],
  },
  {
    stars: [
      { elevation: 5.7, azimuth: 297.4 },
      { elevation: 9.2, azimuth: 298.4 },
      { elevation: 5.7, azimuth: 298.3 },
      { elevation: 12.5, azimuth: 301 },
      { elevation: 14.2, azimuth: 299.7 },
      { elevation: 14.5, azimuth: 299.7 },
      { elevation: 16.2, azimuth: 294.4 },
      { elevation: 16.4, azimuth: 300.2 },
      { elevation: 17.4, azimuth: 304.1 },
      { elevation: 17.8, azimuth: 308.5 },
      { elevation: 16.4, azimuth: 309.7 },
      { elevation: 15, azimuth: 306.8 },
      { elevation: 17.4, azimuth: 304.1 },
      { elevation: 12.5, azimuth: 301.1 },
      { elevation: 12.5, azimuth: 301.2 },
      { elevation: 19.6, azimuth: 307 },
      { elevation: 23.9, azimuth: 307.5 },
      { elevation: 25.2, azimuth: 311 },
      { elevation: 12.6, azimuth: 308.5 },
      { elevation: 8, azimuth: 308.2 },
      { elevation: 8, azimuth: 307.2 },
    ],
    segments: [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [11, 13],
      [13, 14],
      [9, 15],
      [15, 16],
      [16, 17],
      [10, 18],
      [18, 19],
      [18, 20],
    ],
  },
] as const;

function wrapAzimuth(value: number) {
  return ((value % 360) + 360) % 360;
}

function createSeededRandom(seedBase: number) {
  let seed = seedBase >>> 0 || 1;
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
}

function createRandomCometPath(random: () => number) {
  const startAzimuth = random() * 360;
  const sweep = (18 + random() * 40) * (random() > 0.5 ? 1 : -1);
  const startElevation = 16 + random() * 26;
  const endElevation = Math.max(6, startElevation - (10 + random() * 18));

  return {
    start: vecFromSpherical(startElevation, startAzimuth, new THREE.Vector3()).multiplyScalar(7_080),
    end: vecFromSpherical(endElevation, wrapAzimuth(startAzimuth + sweep), new THREE.Vector3()).multiplyScalar(7_080),
    duration: 1.4 + random() * 1.4,
    delay: 15.8 + random() * 15.1,
  };
}

function createCometSeeds(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    seed: ((index + 1) * 0x9e3779b9) >>> 0,
    offset: index * 0.85 + (((index * 37) % 100) / 100) * 1.6,
  }));
}

function createStarPositions(count: number, seedBase: number, phiMax = 0.46) {
  const arr = new Float32Array(count * 3);
  let seed = seedBase;

  const random = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };

  for (let i = 0; i < count; i++) {
    const theta = random() * Math.PI * 2;
    const phi = random() * Math.PI * phiMax;
    const r = 7_500 + random() * 1_200;
    arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.cos(phi);
    arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }

  return arr;
}

function createConstellationData(radius = 7_420) {
  const lineCoords: number[] = [];
  const pointCoords: number[] = [];
  const tempA = new THREE.Vector3();
  const tempB = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  for (const constellation of CONSTELLATION_SETS) {
    const points = constellation.stars.map((star) => {
      return vecFromSpherical(star.elevation, star.azimuth, new THREE.Vector3())
        .multiplyScalar(radius)
        .clone();
    });

    centroid.set(0, 0, 0);
    for (const point of points) {
      centroid.add(point);
    }
    centroid.multiplyScalar(1 / points.length);

    for (const point of points) {
      point.lerp(centroid, 0.22);
    }

    for (const point of points) {
      pointCoords.push(point.x, point.y, point.z);
    }

    for (const [from, to] of constellation.segments) {
      tempA.copy(points[from]);
      tempB.copy(points[to]);
      lineCoords.push(tempA.x, tempA.y, tempA.z, tempB.x, tempB.y, tempB.z);
    }
  }

  return {
    lines: new Float32Array(lineCoords),
    stars: new Float32Array(pointCoords),
  };
}

function applySkyUniforms(
  material: THREE.ShaderMaterial,
  scene: SceneSnapshot,
  sunPosition: THREE.Vector3,
  elapsedTime: number
) {
  const uniforms = material.uniforms;

  uniforms["time"].value = elapsedTime;
  uniforms["sunPosition"].value.copy(sunPosition);
  uniforms["rayleigh"].value = scene.rayleigh;
  uniforms["turbidity"].value = scene.turbidity;
  uniforms["mieCoefficient"].value = scene.mieCoefficient;
  uniforms["mieDirectionalG"].value = scene.mieG;

  if (uniforms["cloudCoverage"] !== undefined) {
    uniforms["cloudScale"].value = scene.cloudScale;
    uniforms["cloudSpeed"].value = scene.cloudSpeed;
    uniforms["cloudCoverage"].value = scene.cloudCoverage;
    uniforms["cloudDensity"].value = scene.cloudDensity;
    uniforms["cloudElevation"].value = scene.cloudElevation;
  }
  if (uniforms["overcast"] !== undefined) uniforms["overcast"].value = scene.overcast;
}

/**
 * An overcast deck for the sky shader: past half cover its clouds still leave
 * blue gaps and a clear band at the horizon. This blends the whole sky toward a
 * grey of its own brightness (still brighter toward the sun), a little dimmed.
 */
function addOvercast(sky: SkyImpl) {
  const material = sky.material as THREE.ShaderMaterial;
  material.uniforms.overcast = { value: 0 };
  material.fragmentShader = material.fragmentShader
    .replace("uniform float cloudCoverage;", "uniform float cloudCoverage;\nuniform float overcast;")
    .replace(
      "gl_FragColor = vec4( texColor, 1.0 );",
      `float skyLuminance = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
      texColor = mix( texColor, vec3( skyLuminance ) * vec3( 0.95, 0.97, 1.0 ) * 0.82, overcast );
      gl_FragColor = vec4( texColor, 1.0 );`
    );
  material.needsUpdate = true;
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

function buildEnvironmentKey(scene: SceneSnapshot) {
  return [
    roundToStep(scene.sunElev, 0.25).toFixed(2),
    roundToStep(scene.sunAz, 0.25).toFixed(2),
    roundToStep(scene.rayleigh, 0.05).toFixed(2),
    roundToStep(scene.turbidity, 0.05).toFixed(2),
    roundToStep(scene.mieCoefficient, 0.0001).toFixed(4),
    roundToStep(scene.mieG, 0.01).toFixed(2),
    // Coarse steps: a weather fade shouldn't rebuild the environment every frame.
    roundToStep(scene.cloudCoverage, 0.05).toFixed(2),
    roundToStep(scene.cloudDensity, 0.05).toFixed(2),
    roundToStep(scene.overcast, 0.05).toFixed(2),
  ].join("|");
}

function setSceneEnvironment(scene: THREE.Scene, texture: THREE.Texture | null) {
  scene.environment = texture;
}

/**
 * Night light for the environment map. Below the horizon the sky shader turns a
 * dark maroon, and every model takes the environment as its ambient light, so
 * after sunset the volcano, the rocks and the animals all took a red-brown cast.
 * This dome lives only in the scene the environment map is rendered from (the
 * visible sky is untouched) and fades in to a dim moonlit blue as the daylight
 * goes. PMREM renders with a far plane of 100, hence the small radius.
 */
const NIGHT_ENVIRONMENT = new THREE.Color("#1c2638");

function createNightDome() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.MeshBasicMaterial({
      color: NIGHT_ENVIRONMENT,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
}

function updateNightDome(dome: THREE.Mesh, snapshot: SceneSnapshot) {
  const night = 1 - daylightOf(snapshot);
  (dome.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(night, 0.15, 0.85) * 0.95;
}

function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Texture();
  }

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );

  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.12, "rgba(255, 245, 220, 0.98)");
  gradient.addColorStop(0.35, "rgba(255, 215, 150, 0.46)");
  gradient.addColorStop(0.7, "rgba(255, 180, 110, 0.08)");
  gradient.addColorStop(1, "rgba(255, 180, 110, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createStarGlowTexture() {
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.Texture();
  }

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );

  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.22, "rgba(225, 236, 255, 0.95)");
  gradient.addColorStop(0.58, "rgba(175, 205, 255, 0.28)");
  gradient.addColorStop(1, "rgba(175, 205, 255, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * The moon's face for a phase, drawn per pixel: a sphere lit from the right
 * (the sprite is turned so that side faces the sun), its dark side faintly lit
 * by the Earth, its limb a little darker. Redrawn only when the phase changes.
 */
function createMoonPhaseArt() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  let drawn = -1;
  return {
    texture,
    draw(phase: number) {
      if (!context || Math.abs(phase - drawn) < 0.004) return;
      drawn = phase;
      const angle = 2 * Math.PI * Math.min(phase, 1 - phase);
      const lx = Math.sin(angle);
      const lz = -Math.cos(angle);
      const image = context.createImageData(size, size);
      const radius = size * 0.23;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const x = (px - size * 0.5) / radius;
          const y = (py - size * 0.5) / radius;
          const r2 = x * x + y * y;
          if (r2 > 1.02) continue;
          const z = Math.sqrt(Math.max(0, 1 - r2));
          const lit = THREE.MathUtils.smoothstep(x * lx + z * lz, -0.05, 0.05);
          const edge = 1 - THREE.MathUtils.smoothstep(r2, 0.96, 1.02);
          const brightness = (0.78 + 0.22 * z) * (0.07 + 0.93 * lit);
          const k = (py * size + px) * 4;
          image.data[k] = 238 * brightness;
          image.data[k + 1] = 236 * brightness;
          image.data[k + 2] = 221 * brightness;
          image.data[k + 3] = 255 * edge * (0.12 + 0.88 * lit);
        }
      }
      context.putImageData(image, 0, 0);
      texture.needsUpdate = true;
    },
  };
}

function createMoonGlowTexture() {
  const size = 224;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.Texture();
  }

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );

  gradient.addColorStop(0, "rgba(222, 235, 255, 0.88)");
  gradient.addColorStop(0.28, "rgba(180, 212, 255, 0.34)");
  gradient.addColorStop(1, "rgba(180, 212, 255, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function CelestialLayer({ children }: { children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.traverse((object) => {
      object.layers.set(SKY_OBJECT_LAYER);
    });
  }, []);

  return <group ref={groupRef}>{children}</group>;
}

const starVertex = /* glsl */ `
  uniform float uSize;
  uniform float uTime;
  uniform float uTwinkle;
  varying float vTwinkle;
  void main() {
    // Each star twinkles at its own rhythm, from a hash of its position.
    float phase = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    vTwinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (1.2 + phase * 2.6) + phase * 6.2832));
    gl_PointSize = uSize * (0.8 + phase * 0.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    // A soft round disc, brightest at the center: no square points.
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, pow(core, 1.8) * uOpacity * vTwinkle);
  }
`;

function StarPoints({ positions, color, size }: { positions: Float32Array; color: string; size: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uSize: { value: size },
      uTime: { value: 0 },
      uTwinkle: { value: 0.35 },
    }),
    [color, size]
  );
  const reduceMotion = useReducedMotion();

  useFrame((state, delta) => {
    const material = pointsRef.current?.material as THREE.ShaderMaterial | undefined;
    if (!material) return;
    const scene = getFrameSnapshot();
    const glow = THREE.MathUtils.clamp(scene.starsOpacity * 1.25, 0, 1);
    const u = material.uniforms;
    u.uOpacity.value = THREE.MathUtils.lerp(u.uOpacity.value, glow, Math.min(1, delta * 1.8));
    u.uTime.value = state.clock.elapsedTime;
    u.uTwinkle.value = reduceMotion ? 0.08 : 0.35;
    u.uSize.value = (size + glow * size * 0.5) * state.viewport.dpr;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={starVertex}
        fragmentShader={starFragment}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

function Starfield() {
  const basePositions = useMemo(() => createStarPositions(3_500, 1_337), []);
  const brightPositions = useMemo(() => createStarPositions(240, 3_211, 0.42), []);
  return (
    <>
      <StarPoints positions={basePositions} color="#dde8ff" size={2.6} />
      <StarPoints positions={brightPositions} color="#f4f8ff" size={4.4} />
    </>
  );
}

function Constellations() {
  const lineMatRef = useRef<THREE.LineBasicMaterial>(null);
  const pointMatRef = useRef<THREE.PointsMaterial>(null);
  const constellationData = useMemo(() => createConstellationData(), []);

  useFrame((state, delta) => {
    if (!lineMatRef.current || !pointMatRef.current) {
      return;
    }

    const safeDelta = Math.min(delta, 1 / 30);
    const scene = getFrameSnapshot();
    const starVisibility = THREE.MathUtils.clamp(scene.starsOpacity * 0.7, 0, 1);
    const pulse = 0.95 + Math.sin(state.clock.elapsedTime * 1.9) * 0.1;
    const constellationVisibility = THREE.MathUtils.clamp(scene.starsOpacity * 0.72, 0, 1);
    lineMatRef.current.opacity = THREE.MathUtils.lerp(
      lineMatRef.current.opacity,
      constellationVisibility * 0.22,
      safeDelta * 2
    );
    pointMatRef.current.opacity = THREE.MathUtils.lerp(
      pointMatRef.current.opacity,
      Math.min(0.62, starVisibility * 0.62 * pulse),
      safeDelta * 2.1
    );
    pointMatRef.current.size = THREE.MathUtils.lerp(
      pointMatRef.current.size,
      0.92 + constellationVisibility * 0.16,
      safeDelta * 2.1
    );
  });

  return (
    <>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[constellationData.lines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          fog={false}
          ref={lineMatRef}
          color="#7fe6ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[constellationData.stars, 3]} />
        </bufferGeometry>
        <pointsMaterial
          fog={false}
          ref={pointMatRef}
          color="#dfffff"
          size={0.95}
          transparent
          opacity={0}
          sizeAttenuation={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}

function Comet({
  seed,
  offset,
}: {
  seed: number;
  offset: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Sprite>(null);
  const headMatRef = useRef<THREE.SpriteMaterial>(null);
  const trailMatRef = useRef<THREE.LineBasicMaterial>(null);
  const trailAttrRef = useRef<THREE.BufferAttribute>(null);
  const glowTexture = useMemo(() => createStarGlowTexture(), []);
  const trailPositions = useMemo(() => new Float32Array(6), []);
  const random = useMemo(() => createSeededRandom(seed), [seed]);
  const pathRef = useRef<ReturnType<typeof createRandomCometPath> | null>(null);
  const cycleStartRef = useRef(offset);
  const _headPos = useRef(new THREE.Vector3());
  const _tailPos = useRef(new THREE.Vector3());

  if (pathRef.current === null) {
    pathRef.current = createRandomCometPath(random);
  }

  useEffect(() => {
    return () => {
      glowTexture.dispose();
    };
  }, [glowTexture]);

  useFrame((state) => {
    if (
      !groupRef.current ||
      !headRef.current ||
      !headMatRef.current ||
      !trailMatRef.current ||
      !trailAttrRef.current
    ) {
      return;
    }

    const scene = getFrameSnapshot();
    const nightVisibility = THREE.MathUtils.clamp(scene.starsOpacity * 1.5, 0, 1);
    const path = pathRef.current ?? createRandomCometPath(random);
    pathRef.current = path;
    const elapsed = state.clock.elapsedTime;
    const localTime = elapsed - cycleStartRef.current;
    const cycle = path.delay + path.duration;

    if (localTime > cycle) {
      cycleStartRef.current = elapsed;
      pathRef.current = createRandomCometPath(random);
      groupRef.current.visible = false;
      return;
    }

    if (nightVisibility <= 0.05 || localTime < path.delay) {
      groupRef.current.visible = false;
      return;
    }

    const progress = (localTime - path.delay) / path.duration;
    const easedProgress = THREE.MathUtils.smootherstep(progress, 0, 1);
    const tailProgress = Math.max(0, easedProgress - 0.032);
    const fade = 0.8 + Math.sin(progress * Math.PI) * 0.2;

    _headPos.current.copy(path.start).lerp(path.end, easedProgress);
    _tailPos.current.copy(path.start).lerp(path.end, tailProgress);
    headRef.current.position.copy(_headPos.current);
    headRef.current.scale.setScalar(18 + fade * 8);

    const trailPositions = trailAttrRef.current.array as Float32Array;
    trailPositions[0] = _tailPos.current.x;
    trailPositions[1] = _tailPos.current.y;
    trailPositions[2] = _tailPos.current.z;
    trailPositions[3] = _headPos.current.x;
    trailPositions[4] = _headPos.current.y;
    trailPositions[5] = _headPos.current.z;
    trailAttrRef.current.needsUpdate = true;

    headMatRef.current.opacity = Math.min(1, fade * 1.35 * nightVisibility);
    trailMatRef.current.opacity = fade * 0.96 * nightVisibility;
    groupRef.current.visible = true;
  });

  return (
    <group ref={groupRef} visible={false} renderOrder={9}>
      <line>
        <bufferGeometry>
          <bufferAttribute
            ref={trailAttrRef}
            attach="attributes-position"
            args={[trailPositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          fog={false}
          ref={trailMatRef}
          color="#eff8ff"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </line>
      <sprite ref={headRef}>
        <spriteMaterial
          fog={false}
          ref={headMatRef}
          map={glowTexture}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

function CometField() {
  const cometSeeds = useMemo(() => createCometSeeds(8), []);
  // Shooting stars are motion for its own sake: none under reduced motion.
  if (useReducedMotion()) return null;

  return (
    <>
      {cometSeeds.map((comet) => (
        <Comet
          key={comet.seed}
          seed={comet.seed}
          offset={comet.offset}
        />
      ))}
    </>
  );
}

function Moon() {
  const groupRef = useRef<THREE.Group>(null);
  const crescentRef = useRef<THREE.Sprite>(null);
  const crescentMatRef = useRef<THREE.SpriteMaterial>(null);
  const glowMatRef = useRef<THREE.SpriteMaterial>(null);
  const phaseArt = useMemo(() => createMoonPhaseArt(), []);
  const crescentTexture = phaseArt.texture;
  const glowTexture = useMemo(() => createMoonGlowTexture(), []);
  const _pos = useRef(new THREE.Vector3());
  const _sun = useRef(new THREE.Vector3());
  const _moon = useRef(new THREE.Vector3());

  useEffect(() => {
    return () => {
      crescentTexture.dispose();
      glowTexture.dispose();
    };
  }, [crescentTexture, glowTexture]);

  useFrame((state, delta) => {
    if (!groupRef.current || !crescentRef.current || !crescentMatRef.current || !glowMatRef.current)
      return;
    const safeDelta = Math.min(delta, 1 / 30);
    const scene = getFrameSnapshot();
    vecFromSpherical(scene.moonElev, scene.moonAz, _pos.current);
    groupRef.current.position.copy(_pos.current).multiplyScalar(4_200);

    phaseArt.draw(scene.moonPhase);
    // Clouds hide the moon.
    const moonVisibility = THREE.MathUtils.clamp(scene.moonOpacity * 1.05, 0.8, 1) * (1 - 0.92 * getWeather().cloud);
    const glowVisibility = THREE.MathUtils.clamp(
      scene.nightFactor * 0.75 + scene.twilightFactor * 0.08,
      0,
      1
    );
    // Turn the lit side toward the sun: the sun's direction, seen from the moon,
    // in the camera's view (wherever the sun is, even below the horizon).
    vecFromSpherical(scene.sunElev, scene.sunAz, _sun.current).transformDirection(state.camera.matrixWorldInverse);
    _moon.current.copy(_pos.current).transformDirection(state.camera.matrixWorldInverse);
    _sun.current.addScaledVector(_moon.current, -_sun.current.dot(_moon.current));
    const orientation = Math.atan2(_sun.current.y, _sun.current.x);

    crescentRef.current.scale.setScalar(150 + glowVisibility * 50);
    crescentMatRef.current.rotation = orientation;
    crescentMatRef.current.opacity = THREE.MathUtils.lerp(
      crescentMatRef.current.opacity,
      moonVisibility,
      safeDelta * 2
    );
    glowMatRef.current.opacity = THREE.MathUtils.lerp(
      glowMatRef.current.opacity,
      // A soft halo: the texture's own gradient, not a saturated disc.
      glowVisibility * 0.45,
      safeDelta * 1
    );
    groupRef.current.visible = glowVisibility > 0.02;
  });

  return (
    <group ref={groupRef} visible={false} renderOrder={8}>
      <sprite scale={[280, 280, 1]}>
        <spriteMaterial
          fog={false}
          ref={glowMatRef}
          map={glowTexture}
          color="#cdc398"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={crescentRef}>
        <spriteMaterial
          fog={false}
          ref={crescentMatRef}
          map={crescentTexture}
          color="#ebe7d6"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

function SunGlow() {
  const groupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Sprite>(null);
  const coreRef = useRef<THREE.Sprite>(null);
  const haloMatRef = useRef<THREE.SpriteMaterial>(null);
  const coreMatRef = useRef<THREE.SpriteMaterial>(null);
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const _pos = useRef(new THREE.Vector3());

  useEffect(() => {
    return () => {
      glowTexture.dispose();
    };
  }, [glowTexture]);

  useFrame((_, delta) => {
    if (!groupRef.current || !haloMatRef.current || !coreMatRef.current) return;
    const safeDelta = Math.min(delta, 1 / 30);
    const scene = getFrameSnapshot();
    vecFromSpherical(scene.sunElev, scene.sunAz, _pos.current);
    groupRef.current.position.copy(_pos.current).multiplyScalar(4_350);

    const visibleFactor = THREE.MathUtils.clamp((scene.sunElev + 3) / 10, 0, 1);
    const haloOpacity = scene.sunHaloOpacity * visibleFactor;
    const coreOpacity = THREE.MathUtils.clamp(0.16 + visibleFactor * 0.34, 0, 0.5);

    if (haloRef.current) {
      haloRef.current.scale.setScalar(scene.sunHaloScale);
    }

    if (coreRef.current) {
      coreRef.current.scale.setScalar(scene.sunCoreScale);
    }

    haloMatRef.current.color.setHex(scene.sunGlowColorHex);
    haloMatRef.current.opacity = THREE.MathUtils.lerp(
      haloMatRef.current.opacity,
      haloOpacity,
      safeDelta * 3
    );
    coreMatRef.current.color.setHex(scene.sunColorHex);
    coreMatRef.current.opacity = THREE.MathUtils.lerp(
      coreMatRef.current.opacity,
      coreOpacity,
      safeDelta * 3
    );

    groupRef.current.visible = visibleFactor > 0.001;
  });

  return (
    <group ref={groupRef} renderOrder={10}>
      <sprite ref={haloRef}>
        <spriteMaterial
          fog={false}
          ref={haloMatRef}
          map={glowTexture}
          color="#fff1c8"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={coreRef}>
        <spriteMaterial
          fog={false}
          ref={coreMatRef}
          map={glowTexture}
          color="#fff7dc"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

// The view turns slowly and endlessly: a full turn in about four minutes. A drag
// pauses it; it picks up again, easing in, a few seconds after the drag ends.
// Under reduced motion it never turns on its own.
const TURNS_PER_MINUTE = 0.25;
const RESUME_AFTER = 5; // seconds

function LookControls() {
  const controls = useRef<OrbitControlsImpl>(null);
  const dragging = useRef(false);
  const resumeAt = useRef(0);
  const speed = useRef(0);
  const reduceMotion = useReducedMotion();

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(delta, 0.1);
    const now = performance.now() / 1000;
    const target = reduceMotion || dragging.current || now < resumeAt.current ? 0 : TURNS_PER_MINUTE;
    speed.current += (target - speed.current) * (1 - Math.exp(-dt * 0.8));
    c.autoRotate = speed.current > 0.0005;
    // OrbitControls turns a fixed angle per update: scale it by the frame time,
    // so the speed is the same at 60 and 120 frames a second.
    c.autoRotateSpeed = speed.current * dt * 60;
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableZoom={false}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.45}
      minPolarAngle={Math.PI * 0.16}
      maxPolarAngle={Math.PI * 0.525}
      target={[0, 8, 0]}
      onStart={() => {
        dragging.current = true;
        speed.current = 0;
      }}
      onEnd={() => {
        dragging.current = false;
        resumeAt.current = performance.now() / 1000 + RESUME_AFTER;
      }}
    />
  );
}

/** Computes the scene's state once per frame, before anything reads it. */
function SceneClock() {
  useFrame((_, delta) => {
    updateFrameSnapshot(delta);
  }, -10);
  return null;
}

/** Where the view looks and which way it turns, for life that wants to be seen. */
function ViewTracker() {
  const direction = useRef(new THREE.Vector3());
  useFrame((state) => {
    state.camera.getWorldDirection(direction.current);
    const bearing = Math.atan2(direction.current.x, -direction.current.z);
    const change = Math.atan2(Math.sin(bearing - view.bearing), Math.cos(bearing - view.bearing));
    if (Math.abs(change) > 1e-4) view.turning = change > 0 ? 1 : -1;
    view.bearing = bearing;
  });
  return null;
}

/**
 * Haze tinted by the sky, thickening with distance: the far volcano and islands
 * sit in the air instead of on it. The sky and the sea keep their own colors.
 */
function Haze() {
  const fog = useRef<THREE.FogExp2>(null);
  useFrame(() => {
    if (!fog.current) return;
    hazeColor(getFrameSnapshot(), fog.current.color);
    fog.current.density = hazeDensity();
  });
  return <fogExp2 ref={fog} attach="fog" args={["#d3e2ec", 0.00006]} />;
}

export default function OceanScene({ showModels = true }: { showModels?: boolean }) {
  const { gl, scene: threeScene, camera } = useThree();

  const sky = useMemo(() => {
    const s = new SkyImpl();
    s.scale.setScalar(10_000);
    addOvercast(s);
    const u = (s.material as THREE.ShaderMaterial).uniforms;
    const scene = getFrameSnapshot();
    u["mieCoefficient"].value = scene.mieCoefficient;
    u["turbidity"].value = scene.turbidity;
    u["rayleigh"].value = scene.rayleigh;
    u["mieDirectionalG"].value = scene.mieG;

    if (u["cloudScale"] !== undefined) {
      u["cloudScale"].value = scene.cloudScale;
      u["cloudSpeed"].value = scene.cloudSpeed;
      u["cloudCoverage"].value = scene.cloudCoverage;
      u["cloudDensity"].value = scene.cloudDensity;
      u["cloudElevation"].value = scene.cloudElevation;
    }

    vecFromSpherical(scene.sunElev, scene.sunAz, u["sunPosition"].value);
    return s;
  }, []);

  const envSky = useMemo(() => {
    const s = new SkyImpl();
    s.scale.setScalar(10_000);
    addOvercast(s);
    return s;
  }, []);
  const pmremGenerator = useMemo(() => new THREE.PMREMGenerator(gl), [gl]);
  const nightDome = useMemo(() => createNightDome(), []);
  const envScene = useMemo(() => {
    const s = new THREE.Scene();
    s.add(envSky);
    s.add(nightDome);
    return s;
  }, [envSky, nightDome]);
  const envTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const envKeyRef = useRef("");
  const skyTimeRef = useRef(0);
  const _sunPos = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.layers.enable(SKY_OBJECT_LAYER);

    return () => {
      envTargetRef.current?.dispose();
      pmremGenerator.dispose();
    };
  }, [camera, pmremGenerator]);

  useEffect(
    () => () => {
      nightDome.geometry.dispose();
      (nightDome.material as THREE.Material).dispose();
    },
    [nightDome]
  );

  useFrame((state, delta) => {
    const scene = getFrameSnapshot();
    const safeDelta = Math.min(delta, 1 / 30);
    const envKey = buildEnvironmentKey(scene);

    skyTimeRef.current += safeDelta;

    vecFromSpherical(scene.sunElev, scene.sunAz, _sunPos.current);
    applySkyUniforms(
      sky.material as THREE.ShaderMaterial,
      scene,
      _sunPos.current,
      skyTimeRef.current
    );
    applySkyUniforms(
      envSky.material as THREE.ShaderMaterial,
      scene,
      _sunPos.current,
      skyTimeRef.current
    );

    if (envKey !== envKeyRef.current || !envTargetRef.current) {
      envKeyRef.current = envKey;
      updateNightDome(nightDome, scene);
      envTargetRef.current?.dispose();
      envTargetRef.current = pmremGenerator.fromScene(envScene);
      setSceneEnvironment(threeScene, envTargetRef.current.texture);
    }

    state.gl.toneMappingExposure = scene.exposure * (1 + lightning.flash * 0.9);
    publishSceneTone(scene);
  });

  return (
    <>
      <SceneClock />
      <ViewTracker />
      <Haze />
      <primitive object={sky} />
      <SunGlow />
      <CelestialLayer>
        <Starfield />
        <Constellations />
        <CometField />
      </CelestialLayer>
      <Moon />
      {/* The sea has its own boundary, so it doesn't wait for the models. */}
      <Suspense fallback={null}>
        <Ocean />
      </Suspense>
      {showModels ? <SceneEncounters /> : null}
      <LookControls />
    </>
  );
}
