"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { createSoftTexture, preloadModel, useClonedModel, type MaterialTuning } from "./models";
import { frontArcPosition, createSeededRandom } from "./random";
import { daylightOf, getFrameSnapshot, hazeColor } from "./sceneFrame";
import type { Obstacle } from "./dolphins/brain";

// The landscape around the camera: where each model sits, the footprints the
// dolphins avoid, the distant active volcano with its plume, and palms on the
// reef's beach. Nature only.

const PROMONTORY_TUNING: MaterialTuning = { envMapIntensity: 1.1, roughness: 0.92, metalness: 0, colorBoost: 1.1 };
const REEF_TUNING: MaterialTuning = { envMapIntensity: 1.1, roughness: 0.95, metalness: 0, colorBoost: 1.1 };
const CLIFF_TUNING: MaterialTuning = { envMapIntensity: 1.5, roughness: 0.85, metalness: 0, colorBoost: 1.9 };
const SEA_STACK_TUNING: MaterialTuning = { envMapIntensity: 1.5, roughness: 0.82, metalness: 0, colorBoost: 2.0 };
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
  // An active volcano very far out, a small silhouette in the haze.
  volcano: { url: "/models/volcano.glb", tuning: VOLCANO_TUNING, radius: 14000, angle: 275, y: -2, scale: 22, rotationY: 0.6, halfExtent: 50 },
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

const CRATER_GLOW = new THREE.Color("#ff7a3a");

/**
 * An active volcano far out: a plume by day, and at night a small, dim glow
 * over the crater with a slow flicker, the only fire visible at this distance.
 * The cone itself takes the light like any rock.
 */
export function Volcano() {
  const glow = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => createSoftTexture(), []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state) => {
    const sprite = glow.current;
    if (!sprite) return;
    const night = 1 - daylightOf(getFrameSnapshot());
    const t = state.clock.elapsedTime;
    const flicker = 0.85 + 0.1 * Math.sin(t * 1.7) + 0.05 * Math.sin(t * 5.3);
    sprite.visible = night > 0.05;
    sprite.material.opacity = 0.4 * night * night * flicker;
  });

  const base = placementPosition(PLACEMENTS.volcano);
  const summit = useMemo(
    () => new THREE.Vector3(base.x, base.y + VOLCANO_SUMMIT * PLACEMENTS.volcano.scale - 20, base.z),
    [base.x, base.y, base.z]
  );

  return (
    <Landmark placement={PLACEMENTS.volcano}>
      {/* Centered on the crater: the cone hides its lower half, so it reads as light over the rim. */}
      <sprite ref={glow} position={summit} scale={[240, 120, 1]} visible={false}>
        <spriteMaterial
          map={texture}
          color={CRATER_GLOW}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
          toneMapped={false}
        />
      </sprite>
      <Plume origin={summit} />
    </Landmark>
  );
}

const PUFFS = 14;
const PUFF_LIFE = 40; // seconds from the crater to gone
const WIND = new THREE.Vector3(1, 0, 0.35).normalize();

/**
 * The plume: a thin column of puffs that leave the crater, rise and slow, widen
 * a little and lean with the wind, then thin out. Its color is the distant air
 * itself (the haze), a shade lighter by day: it sits in the sky at every hour
 * instead of glowing.
 */
function Plume({ origin }: { origin: THREE.Vector3 }) {
  const texture = useMemo(() => createSoftTexture(true), []);
  const sprites = useRef<Array<THREE.Sprite | null>>([]);
  const smoke = useRef(new THREE.Color());

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state) => {
    const snapshot = getFrameSnapshot();
    const daylight = daylightOf(snapshot);
    // A shade lighter than the air by day (pale steam), the air itself at night.
    hazeColor(snapshot, smoke.current).multiplyScalar(0.95 + 0.15 * daylight);

    const time = state.clock.elapsedTime;
    sprites.current.forEach((sprite, i) => {
      if (!sprite) return;
      const age = (time + (i * PUFF_LIFE) / PUFFS) % PUFF_LIFE;
      const t = age / PUFF_LIFE;
      const rise = 620 * (1 - Math.exp(-age / 14));
      const drift = age * 9 * t;
      sprite.position.set(origin.x + WIND.x * drift, origin.y + rise, origin.z + WIND.z * drift);
      const size = 70 + 260 * Math.sqrt(t);
      sprite.scale.set(size, size * 0.85, 1);
      sprite.material.opacity =
        THREE.MathUtils.smoothstep(t, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(t, 0.45, 1)) * (0.35 + 0.2 * daylight);
      sprite.material.color.copy(smoke.current);
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
          {/* Not tone mapped: the sky is drawn in high range, and a tone-mapped haze color
              reads as a dull grey column against it. */}
          <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </>
  );
}


// ── Palms on the reef ───────────────────────────────────────────────────────

const PALM_URL = "/models/palm_trees.glb";
const PALMS = 6;
/** The model is in centimetres, about 24.5 m tall. */
const PALM_SCALE = 0.0105;

const wind = { uTime: { value: 0 }, uStrength: { value: 1 } };

/**
 * Wind in the palms, in the vertex shader: the trunk leans gently, more toward
 * the top; the fronds sway and flutter. The model's trees stand along their
 * local z (in centimetres), so height is position.z. Each palm gets its own
 * phase from where it stands.
 */
function addWind(material: THREE.Material, frond: boolean) {
  if (material.userData.wind) return;
  material.userData.wind = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uStrength = wind.uStrength;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uStrength;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float h = clamp(position.z / 2450.0, 0.0, 1.0);
        float phase = modelMatrix[3][0] * 0.031 + modelMatrix[3][2] * 0.017;
        float gust = 0.65 + 0.35 * sin(uTime * 0.37 + phase);
        float lean = sin(uTime * 1.1 + phase) * 22.0 * h * h * gust;
        transformed.x += lean * uStrength;
        transformed.y += cos(uTime * 0.9 + phase) * 9.0 * h * h * gust * uStrength;
        ${frond
          ? "transformed.z += sin(uTime * 3.4 + position.x * 0.012 + position.y * 0.01 + phase) * 26.0 * h * gust * uStrength;\n        transformed.x += sin(uTime * 2.7 + position.y * 0.015 + phase) * 14.0 * h * gust * uStrength;"
          : ""}`
      );
  };
  material.needsUpdate = true;
}

/**
 * A few palms on the reef's beach (ElectroNick's "Palm Trees", CC BY), standing
 * on the reef's real surface (rays cast down onto it) and moving in the wind.
 */
export function ReefPalms({ reef }: { reef: THREE.Object3D | null }) {
  const { scene } = useGLTF(PALM_URL, false);
  const group = useRef<THREE.Group>(null);
  const reduceMotion = useReducedMotion();

  // The file holds two trees: use each on its own, centered on its base.
  const trees = useMemo(() => {
    const found = ["Palm_tree_001_v2", "Palm_tree_002_v2"]
      .map((name) => scene.getObjectByName(name))
      .filter((node): node is THREE.Object3D => Boolean(node));
    return found.map((node) => {
      const tree = node.clone(true);
      tree.position.set(0, 0, 0);
      tree.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
        material.envMapIntensity = 1.1;
        // Far away, the texture's small mip levels average the thin leaflets' alpha
        // below the cutoff and the fronds vanish: keep more of them, edges smoothed.
        if (material.alphaTest > 0) {
          material.alphaTest = 0.15;
          material.alphaToCoverage = true;
        }
        addWind(material, /frond/i.test(material.name));
      });
      return tree;
    });
  }, [scene]);

  useEffect(() => {
    const holder = group.current;
    if (!reef || !holder || trees.length === 0) return;
    reef.updateWorldMatrix(true, true);
    const center = placementPosition(PLACEMENTS.reef);
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const random = createSeededRandom(4);
    const spots: THREE.Vector3[] = [];
    for (let attempt = 0; attempt < 500 && spots.length < PALMS; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = 20 + random() * 150;
      raycaster.set(new THREE.Vector3(center.x + Math.cos(angle) * distance, 400, center.z + Math.sin(angle) * distance), down);
      const hit = raycaster.intersectObject(reef, true)[0];
      // On land, above the waterline, and not crowded.
      if (!hit || hit.point.y < 1.2) continue;
      if (spots.some((spot) => spot.distanceTo(hit.point) < 20)) continue;
      spots.push(hit.point.clone());
    }
    const placed = spots.map((spot, i) => {
      const palm = trees[i % trees.length].clone(true);
      palm.position.copy(spot);
      palm.rotation.y = random() * Math.PI * 2;
      palm.scale.setScalar(PALM_SCALE * (0.85 + random() * 0.35));
      holder.add(palm);
      return palm;
    });
    return () => {
      placed.forEach((palm) => holder.remove(palm));
    };
  }, [reef, trees]);

  useFrame((state) => {
    wind.uTime.value = state.clock.elapsedTime;
    wind.uStrength.value = reduceMotion ? 0.25 : 1;
  });

  return <group ref={group} />;
}

useGLTF.preload(PALM_URL, false);

for (const placement of Object.values(PLACEMENTS)) preloadModel(placement.url);
