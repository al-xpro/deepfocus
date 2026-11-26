"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createSoftTexture, preloadModel, useClonedModel, type MaterialTuning } from "./models";
import { frontArcPosition, createSeededRandom } from "./random";
import { daylightOf, getFrameSnapshot } from "./sceneFrame";
import type { Obstacle } from "./dolphins/brain";

// The landscape around the camera: where each model sits, the footprints the
// dolphins avoid, the distant active volcano with its plume, and palms on the
// reef's beach. Nature only.

const PROMONTORY_TUNING: MaterialTuning = { envMapIntensity: 1.1, roughness: 0.92, metalness: 0, colorBoost: 1.1 };
const REEF_TUNING: MaterialTuning = { envMapIntensity: 1.1, roughness: 0.95, metalness: 0, colorBoost: 1.1 };
const CLIFF_TUNING: MaterialTuning = { envMapIntensity: 1.1, roughness: 0.9, metalness: 0, colorBoost: 1.25 };
const SEA_STACK_TUNING: MaterialTuning = { envMapIntensity: 1.1, roughness: 0.88, metalness: 0, colorBoost: 1.3 };
const VOLCANO_TUNING: MaterialTuning = { envMapIntensity: 0.9, roughness: 0.95, metalness: 0, colorBoost: 1 };

/**
 * `radius` and `angle` place a model on the water (0° straight ahead of the
 * starting view, 90° to its right). `halfExtent` is half the model's widest
 * horizontal size at scale 1 (measured), so the dolphins' obstacles come from
 * the real footprint.
 */
export interface Placement {
  url: string;
  tuning: MaterialTuning;
  radius: number;
  angle: number;
  y: number;
  scale: number;
  rotationY: number;
  halfExtent: number;
}

export const PLACEMENTS = {
  promontory: { url: "/models/promontory.glb", tuning: PROMONTORY_TUNING, radius: 2000, angle: 20, y: -14, scale: 2, rotationY: -0.2, halfExtent: 190 },
  reef: { url: "/models/rock_reef.glb", tuning: REEF_TUNING, radius: 900, angle: 150, y: -3, scale: 1, rotationY: 1, halfExtent: 175 },
  cliffRock: { url: "/models/cliff_rock.glb", tuning: CLIFF_TUNING, radius: 200, angle: 200, y: -2, scale: 1, rotationY: 0, halfExtent: 12 },
  seaStacks: { url: "/models/group_of_cliff_1.glb", tuning: SEA_STACK_TUNING, radius: 170, angle: 210, y: 0, scale: 0.01, rotationY: 0, halfExtent: 1200 },
  seaStacksSmall: { url: "/models/group_of_cliff_2.glb", tuning: SEA_STACK_TUNING, radius: 230, angle: 180, y: 0, scale: 0.01, rotationY: 1, halfExtent: 1370 },
  // An active volcano far out on the horizon, past the reach of everything else.
  volcano: { url: "/models/volcano.glb", tuning: VOLCANO_TUNING, radius: 9000, angle: 275, y: -2, scale: 22, rotationY: 0.6, halfExtent: 50 },
} satisfies Record<string, Placement>;

/** The volcano's summit, in model units above its base (measured). */
const VOLCANO_SUMMIT = 23.5;

/** Room the dolphins keep around a model's footprint. */
const OBSTACLE_MARGIN = 40;

export const OBSTACLES: Obstacle[] = Object.values(PLACEMENTS).map((placement) => {
  const position = frontArcPosition(placement.radius, placement.angle, placement.y);
  return { x: position.x, z: position.z, radius: placement.halfExtent * placement.scale + OBSTACLE_MARGIN };
});

export function placementPosition(placement: Placement) {
  return frontArcPosition(placement.radius, placement.angle, placement.y);
}

/** A model in its place. `around` renders in world space beside it (palms, the plume). */
export function Landmark({
  placement,
  onModel,
  children,
}: {
  placement: Placement;
  onModel?: (model: THREE.Object3D) => void;
  children?: ReactNode;
}) {
  const { model } = useClonedModel(placement.url, placement.tuning);
  const position = useMemo(() => placementPosition(placement), [placement]);

  useEffect(() => {
    onModel?.(model);
  }, [model, onModel]);

  return (
    <>
      <group position={position}>
        <group scale={placement.scale} rotation={[0, placement.rotationY, 0]}>
          <primitive object={model} />
        </group>
      </group>
      {children}
    </>
  );
}

// ── The volcano ─────────────────────────────────────────────────────────────

/** The lava glows faintly by day and clearly at night, with a slow flicker. */
export function Volcano() {
  const model = useRef<THREE.Object3D | null>(null);
  const lava = useRef<THREE.MeshStandardMaterial[]>([]);

  useFrame((state) => {
    if (lava.current.length === 0 && model.current) {
      model.current.traverse((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (material?.emissiveMap) lava.current.push(material);
      });
    }
    const night = 1 - daylightOf(getFrameSnapshot());
    const t = state.clock.elapsedTime;
    const flicker = 0.85 + 0.1 * Math.sin(t * 1.7) + 0.05 * Math.sin(t * 5.3);
    for (const material of lava.current) material.emissiveIntensity = (0.35 + 2.6 * night) * flicker;
  });

  const base = placementPosition(PLACEMENTS.volcano);
  const summit = useMemo(
    () => new THREE.Vector3(base.x, base.y + VOLCANO_SUMMIT * PLACEMENTS.volcano.scale - 20, base.z),
    [base.x, base.y, base.z]
  );

  return (
    <Landmark placement={PLACEMENTS.volcano} onModel={(m) => (model.current = m)}>
      <Plume origin={summit} />
    </Landmark>
  );
}

const PUFFS = 18;
const PUFF_LIFE = 34; // seconds from the crater to gone
const WIND = new THREE.Vector3(1, 0, 0.35).normalize();
const LAVA_GLOW = new THREE.Color("#ff6a2a");

/**
 * The plume: puffs that leave the crater, rise and slow, widen and drift with
 * the wind, then fade. Lit by the scene's light (it changes on the same frame as
 * the sky); at night the lowest puffs catch the lava's glow from below.
 */
function Plume({ origin }: { origin: THREE.Vector3 }) {
  const texture = useMemo(() => createSoftTexture(true), []);
  const sprites = useRef<Array<THREE.Sprite | null>>([]);
  const smoke = useRef(new THREE.Color());
  const tint = useRef(new THREE.Color());

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state) => {
    const snapshot = getFrameSnapshot();
    const daylight = daylightOf(snapshot);
    const night = 1 - daylight;
    // Normalized against the exposure so it reads as grey smoke at any hour.
    const brightness = (1.25 / Math.max(snapshot.exposure, 0.05)) * Math.max(daylight, 0.07);
    smoke.current.setHex(snapshot.lightColorHex).lerp(WHITE, 0.4).multiplyScalar(brightness * 0.82);

    const time = state.clock.elapsedTime;
    sprites.current.forEach((sprite, i) => {
      if (!sprite) return;
      const age = (time + (i * PUFF_LIFE) / PUFFS) % PUFF_LIFE;
      const t = age / PUFF_LIFE;
      const rise = 1050 * (1 - Math.exp(-age / 10));
      const drift = age * 22;
      sprite.position.set(
        origin.x + WIND.x * drift + Math.sin(i * 2.3 + time * 0.05) * 25,
        origin.y + rise,
        origin.z + WIND.z * drift
      );
      const size = 160 + 980 * Math.sqrt(t);
      sprite.scale.set(size, size * 0.8, 1);
      const material = sprite.material;
      material.opacity = THREE.MathUtils.smoothstep(t, 0, 0.06) * (1 - THREE.MathUtils.smoothstep(t, 0.55, 1)) * 0.62;
      // The lava lights the plume from below at night.
      const glow = night * Math.pow(1 - t, 4) * 1.6;
      tint.current.copy(smoke.current).lerp(LAVA_GLOW, Math.min(1, glow));
      material.color.copy(tint.current);
    });
  });

  return (
    <>
      {Array.from({ length: PUFFS }, (_, i) => (
        <sprite
          key={i}
          ref={(sprite) => {
            sprites.current[i] = sprite;
          }}
        >
          <spriteMaterial map={texture} transparent depthWrite={false} fog />
        </sprite>
      ))}
    </>
  );
}

const WHITE = new THREE.Color(0xffffff);

// ── Palms on the reef ───────────────────────────────────────────────────────

/** One palm, built in code: a curved trunk and a crown of arching fronds. */
function createPalmGeometry() {
  const colorize = (geometry: THREE.BufferGeometry, hex: string) => {
    const color = new THREE.Color(hex);
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  };

  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0.5, 6, 0),
    new THREE.Vector3(1.6, 12, 0),
    new THREE.Vector3(3.2, 17.5, 0),
  ]);
  const trunk = colorize(new THREE.TubeGeometry(trunkCurve, 10, 0.55, 6, false), "#7a5c3e");
  const top = trunkCurve.getPoint(1);

  const fronds: THREE.BufferGeometry[] = [];
  const random = createSeededRandom(9);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.PlaneGeometry(1.8, 9, 1, 6);
    const position = leaf.getAttribute("position");
    for (let k = 0; k < position.count; k++) {
      const x = position.getX(k);
      const t = (position.getY(k) + 4.5) / 9;
      position.setXYZ(k, t * 8.5, t * 1.4 - t * t * 4.6, x * (1 - t * 0.75));
    }
    leaf.computeVertexNormals();
    leaf.rotateY((i / 9) * Math.PI * 2 + random() * 0.4);
    leaf.translate(top.x, top.y, top.z);
    fronds.push(colorize(leaf, i % 2 === 0 ? "#3f7d39" : "#4c8c40"));
  }
  const merged = mergeGeometries([trunk, ...fronds], false);
  trunk.dispose();
  fronds.forEach((f) => f.dispose());
  return merged;
}

const PALMS = 7;

/**
 * A few palms on the reef's beach, for the feel of a Hawaiian island. Placed by
 * casting rays down onto the reef itself, so they stand on its real surface.
 */
export function ReefPalms({ reef }: { reef: THREE.Object3D | null }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createPalmGeometry(), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
    []
  );

  useEffect(() => {
    const instances = mesh.current;
    if (!reef || !instances) return;
    reef.updateWorldMatrix(true, true);
    const center = placementPosition(PLACEMENTS.reef);
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const random = createSeededRandom(4);
    const spots: THREE.Vector3[] = [];
    for (let attempt = 0; attempt < 400 && spots.length < PALMS; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = 20 + random() * 150;
      const x = center.x + Math.cos(angle) * distance;
      const z = center.z + Math.sin(angle) * distance;
      raycaster.set(new THREE.Vector3(x, 400, z), down);
      const hit = raycaster.intersectObject(reef, true)[0];
      // On land, above the waterline, and not crowded.
      if (!hit || hit.point.y < 1.2) continue;
      if (spots.some((spot) => spot.distanceTo(hit.point) < 22)) continue;
      spots.push(hit.point.clone());
    }
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    for (let i = 0; i < PALMS; i++) {
      const spot = spots[i];
      if (!spot) {
        matrix.makeScale(0, 0, 0);
      } else {
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2);
        const scale = 0.85 + random() * 0.4;
        matrix.compose(spot, rotation, new THREE.Vector3(scale, scale, scale));
      }
      instances.setMatrixAt(i, matrix);
    }
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
  }, [reef]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  return <instancedMesh ref={mesh} args={[geometry, material, PALMS]} />;
}

for (const placement of Object.values(PLACEMENTS)) preloadModel(placement.url);
