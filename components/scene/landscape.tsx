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
// The rocks near the viewer: a natural light grey by day. Seen from the camera,
// their faces turn from the sun, so they get almost only sky light: the color is
// lifted (each texture by its own darkness), the baked occlusion softened, and
// they're made matte (their roughness maps left them shiny, mirroring the white
// sky like ice).
/** The tall stack (`cliff_rock.glb`): the lightest texture. */
const CLIFF_TUNING: MaterialTuning = { envMapIntensity: 0.9, roughness: 0.92, metalness: 0, colorBoost: 1.5, aoIntensity: 0.3, matte: true };
/** The small stack beside it (`group_of_cliff_1.glb`): a dark texture. */
const SMALL_STACK_TUNING: MaterialTuning = { envMapIntensity: 0.9, roughness: 0.92, metalness: 0, colorBoost: 3.2, matte: true };
/** The group of basalt columns (`group_of_cliff_2.glb`): the darkest texture. */
const COLUMNS_TUNING: MaterialTuning = { envMapIntensity: 0.9, roughness: 0.92, metalness: 0, colorBoost: 6.5, aoIntensity: 0.2, matte: true };
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
  seaStacks: { url: "/models/group_of_cliff_1.glb", tuning: SMALL_STACK_TUNING, radius: 170, angle: 210, y: 0, scale: 0.01, rotationY: 0, halfExtent: 1200 },
  seaStacksSmall: { url: "/models/group_of_cliff_2.glb", tuning: COLUMNS_TUNING, radius: 230, angle: 180, y: 0, scale: 0.01, rotationY: 1, halfExtent: 1370 },
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

// ── The promontory's core ───────────────────────────────────────────────────

const CORE_GRID = 64;

/**
 * A solid core under the promontory's canopy. The scan isn't watertight: here
 * and there its patches leave a gap, and the sky showed through the trees. This
 * heightfield sits a little below the canopy everywhere and closes them with the
 * dark of the forest floor. Built once from the model's own vertices: the highest
 * point in each cell of a 64 × 64 grid, the lowest of each cell's neighbours, then
 * lowered a little. About 8K triangles, nothing to download.
 */
export function addSolidCore(model: THREE.Object3D) {
  if (model.userData.core) return;
  model.userData.core = true;
  model.updateWorldMatrix(true, true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const box = new THREE.Box3();
  const meshes: Array<{ position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; matrix: THREE.Matrix4 }> = [];
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const matrix = local.multiplyMatrices(toModel, mesh.matrixWorld).clone();
    const position = mesh.geometry.getAttribute("position");
    meshes.push({ position, matrix });
    for (let i = 0; i < position.count; i++) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(matrix));
  });
  if (box.isEmpty()) return;

  const n = CORE_GRID;
  const sizeX = box.max.x - box.min.x;
  const sizeZ = box.max.z - box.min.z;
  const top = new Float32Array(n * n).fill(-Infinity);
  for (const { position, matrix } of meshes) {
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      const ix = Math.min(n - 1, Math.floor(((point.x - box.min.x) / sizeX) * n));
      const iz = Math.min(n - 1, Math.floor(((point.z - box.min.z) / sizeZ) * n));
      const k = iz * n + ix;
      if (point.y > top[k]) top[k] = point.y;
    }
  }
  const floor = box.min.y - 1;
  const inset = (box.max.y - box.min.y) * 0.03;
  const heights = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      let lowest = Infinity;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = ix + dx;
          const z = iz + dz;
          const value = x < 0 || z < 0 || x >= n || z >= n ? -Infinity : top[z * n + x];
          lowest = Math.min(lowest, value);
        }
      }
      heights[iz * n + ix] = Number.isFinite(lowest) ? lowest - inset : floor;
    }
  }

  const vertices = new Float32Array(n * n * 3);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const k = iz * n + ix;
      vertices[k * 3] = box.min.x + ((ix + 0.5) / n) * sizeX;
      vertices[k * 3 + 1] = heights[k];
      vertices[k * 3 + 2] = box.min.z + ((iz + 0.5) / n) * sizeZ;
    }
  }
  const indices: number[] = [];
  for (let iz = 0; iz < n - 1; iz++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iz * n + ix;
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const core = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: "#24301d", roughness: 1, metalness: 0, envMapIntensity: 0.6, side: THREE.DoubleSide })
  );
  core.name = "solid-core";
  model.add(core);
}

// ── The volcano ─────────────────────────────────────────────────────────────

const CRATER_GLOW = new THREE.Color("#ff7a3a");

/** How much of the air lies between the viewer and the volcano, at the least. */
const AERIAL = { value: 0.5 };

/**
 * Aerial perspective: 14,000 units out, the volcano takes at least half its color
 * from the haze, whatever the light on it. It reads pale by day and dark at
 * dawn, dusk and night, as the air does, instead of standing out lit.
 */
function addAerialPerspective(model: THREE.Object3D) {
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.Material;
    if (material.userData.aerial) return;
    material.userData.aerial = true;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uAerial = AERIAL;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uAerial;")
        .replace(
          "#include <fog_fragment>",
          `#ifdef USE_FOG
            float aerialFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
            gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, max( aerialFog, uAerial ) );
          #endif`
        );
    };
    material.needsUpdate = true;
  });
}

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
    <Landmark placement={PLACEMENTS.volcano} onModel={addAerialPerspective}>
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
 * Wind in the palms, in the vertex shader. The model's trees stand along their
 * local z, in centimetres, with the trunk at x = y = 0. The whole tree bends from
 * its base, more toward the top; each frond lifts and falls as one piece, a little
 * out of step with its neighbours (the motion depends on the frond's direction
 * around the crown, never on fine detail, so nothing ripples or folds). Each palm
 * gets its own phase from where it stands.
 */
function addWind(material: THREE.Material) {
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
        float gust = (0.6 + 0.4 * sin(uTime * 0.31 + phase)) * uStrength;
        float bend = h * h * gust;
        transformed.x += sin(uTime * 0.8 + phase) * 28.0 * bend;
        transformed.y += sin(uTime * 0.63 + phase * 1.7) * 12.0 * bend;
        float reach = clamp(length(position.xy) / 320.0, 0.0, 1.0);
        float around = atan(position.y, position.x);
        transformed.z += sin(uTime * 1.9 + around * 2.0 + phase) * 16.0 * reach * reach * h * gust;`
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
        addWind(material);
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
      // The tree node carries the model's own rotation (its z up); a parent turns it
      // around its trunk and gives it a palm's slight lean.
      const palm = new THREE.Group();
      palm.add(trees[i % trees.length].clone(true));
      palm.position.copy(spot);
      palm.rotation.set((random() - 0.5) * 0.16, random() * Math.PI * 2, (random() - 0.5) * 0.16, "YXZ");
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
