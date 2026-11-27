"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Water } from "three/examples/jsm/objects/Water.js";
import * as THREE from "three";
import { getFrameSnapshot } from "./sceneFrame";
import { MAX_RINGS, rings } from "./fx/waterPools";
import { vecFromSpherical, type SceneSnapshot } from "./timeUtils";

function updateWaterMaterial(
  material: THREE.ShaderMaterial,
  scene: SceneSnapshot,
  step: number,
  sunDir: THREE.Vector3,
  moonDir: THREE.Vector3,
) {
  const uniforms = material.uniforms;
  const lightDirection = sunDir.clone().lerp(moonDir, scene.nightFactor).normalize();
  const highlightColor = new THREE.Color(scene.sunColorHex).lerp(
    new THREE.Color(0xc7dbff),
    scene.nightFactor
  );
  const highlightIntensity = THREE.MathUtils.lerp(
    scene.sunReflectionIntensity,
    0.95,
    scene.nightFactor
  );

  uniforms["time"].value += step * scene.waterTimeScale;
  uniforms["distortionScale"].value = scene.waterDistortionScale;
  uniforms["size"].value = scene.waterSize;
  uniforms["alpha"].value = scene.waterAlpha;
  uniforms["waterColor"].value.setHex(scene.waterColorHex);
  uniforms["sunDirection"].value.copy(lightDirection);
  uniforms["sunColor"].value.copy(highlightColor).multiplyScalar(highlightIntensity);
}

/**
 * Ripples in the water itself: each one bends the surface normal into a few
 * concentric crests behind a spreading front. The water shades them like the rest
 * of the sea (the reflection wavers, the light catches the crests), so they are
 * transparent and take the water's color at every hour. Each ripple is a vec4:
 * its center (x, z), the radius of its front, its strength.
 */
function addRipples(material: THREE.ShaderMaterial) {
  material.uniforms.uRipples = { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) };
  material.fragmentShader = material.fragmentShader
    .replace("uniform float distortionScale;", `uniform float distortionScale;\nuniform vec4 uRipples[ ${MAX_RINGS} ];`)
    .replace(
      "vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );",
      `vec3 surfaceNormal = noise.xzy * vec3( 1.5, 1.0, 1.5 );
      for ( int i = 0; i < ${MAX_RINGS}; i ++ ) {
        vec4 ripple = uRipples[ i ];
        if ( ripple.w <= 0.0 ) continue;
        vec2 offset = worldPosition.xz - ripple.xy;
        float d = length( offset );
        float inside = ripple.z - d;
        float width = 1.2 + ripple.z * 0.3;
        if ( inside < -1.5 || inside > width * 3.0 ) continue;
        float envelope = exp( - pow( ( inside - width ) / width, 2.0 ) );
        surfaceNormal.xz += ( offset / max( d, 0.001 ) ) * sin( inside * 2.2 ) * envelope * ripple.w;
      }
      surfaceNormal = normalize( surfaceNormal );`
    );
  material.needsUpdate = true;
}

/** Uploads the live ripples: the front spreads and slows, the strength fades. */
function updateRipples(material: THREE.ShaderMaterial) {
  const slots = material.uniforms.uRipples?.value as THREE.Vector4[] | undefined;
  if (!slots) return;
  for (let i = 0; i < MAX_RINGS; i++) {
    const t = rings.life[i] > 0 ? rings.age[i] / rings.life[i] : 1;
    if (t >= 1) {
      slots[i].w = 0;
      continue;
    }
    const radius = 1 + rings.size[i] * 2 * Math.pow(t, 0.75);
    const strength = rings.strength[i] * Math.pow(1 - t, 1.5) * Math.min(1, t * 10) * 1.4;
    slots[i].set(rings.x[i], rings.z[i], radius, strength);
  }
}

export default function Ocean() {
  const waterNormals = useTexture("/textures/waternormals.jpg");
  const geometry = useMemo(() => new THREE.PlaneGeometry(40_000, 40_000), []);
  const normalTexture = useMemo(() => {
    const texture = waterNormals.clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }, [waterNormals]);

  const water = useMemo(() => {
    const scene = getFrameSnapshot();
    const created = new Water(geometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normalTexture,
      sunDirection: vecFromSpherical(scene.sunElev, scene.sunAz),
      sunColor: scene.sunColorHex,
      waterColor: scene.waterColorHex,
      distortionScale: scene.waterDistortionScale,
      alpha: scene.waterAlpha,
      fog: false,
    });
    addRipples(created.material as THREE.ShaderMaterial);
    return created;
  }, [geometry, normalTexture]);

  const _sunDir = useRef(new THREE.Vector3());
  const _moonDir = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const scene = getFrameSnapshot();
    const step = Math.min(delta, 1 / 30);

    vecFromSpherical(scene.sunElev, scene.sunAz, _sunDir.current);
    vecFromSpherical(scene.moonElev, scene.moonAz, _moonDir.current);
    updateWaterMaterial(
      water.material as THREE.ShaderMaterial,
      scene,
      step,
      _sunDir.current,
      _moonDir.current,
    );
    updateRipples(water.material as THREE.ShaderMaterial);
  });

  return <primitive object={water} rotation={[-Math.PI / 2, 0, 0]} />;
}
