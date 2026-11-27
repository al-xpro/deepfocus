import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

// Models are meshopt-compressed by scripts/optimize-models.mjs; the decoder ships
// with three, so loading them never calls a third-party CDN. No Draco.

export interface MaterialTuning {
  envMapIntensity: number;
  roughness?: number;
  metalness?: number;
  colorBoost?: number;
  /**
   * How much a baked occlusion map darkens the indirect light (1 = fully). Faces
   * turned from the sun get almost only indirect light, so a strong map keeps
   * them dark whatever the color.
   */
  aoIntensity?: number;
  /**
   * Drops the roughness map: the roughness value is multiplied by it, and a dark
   * map leaves a rock shiny (mirroring the white sky) whatever the value.
   */
  matte?: boolean;
  /** Multiplies the base color: shifts a model's palette. */
  tint?: string;
}

function enhanceMaterials(model: THREE.Object3D, tuning: MaterialTuning) {
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materials = source.map((material) => material?.clone());
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];

    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
      if (material.emissiveMap) material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      material.envMapIntensity = tuning.envMapIntensity;
      if (tuning.roughness !== undefined) material.roughness = tuning.roughness;
      if (tuning.metalness !== undefined) material.metalness = tuning.metalness;
      if (tuning.colorBoost !== undefined) material.color.multiplyScalar(tuning.colorBoost);
      if (tuning.aoIntensity !== undefined) material.aoMapIntensity = tuning.aoIntensity;
      if (tuning.matte) material.roughnessMap = null;
      if (tuning.tint !== undefined) material.color.multiply(new THREE.Color(tuning.tint));
      material.needsUpdate = true;
    }
  });
}

/** A model of our own (cloned with its skeleton, materials tuned), and its animations. */
export function useClonedModel(url: string, tuning: MaterialTuning) {
  const { scene, animations } = useGLTF(url, false);
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene) as THREE.Group;
    enhanceMaterials(clone, tuning);
    return clone;
  }, [scene, tuning]);
  return { model, animations };
}

export function preloadModel(url: string) {
  useGLTF.preload(url, false);
}

/** A soft, round sprite texture drawn once, with an optional shaded base (clouds, smoke). */
export function createSoftTexture(shadedBase = false) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.5)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    if (shadedBase) {
      ctx.globalCompositeOperation = "source-atop";
      const shade = ctx.createLinearGradient(0, 0, 0, size);
      shade.addColorStop(0.3, "#ffffff");
      shade.addColorStop(1, "#8e98a6");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, size, size);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
