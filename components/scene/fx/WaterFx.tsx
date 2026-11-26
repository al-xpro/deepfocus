"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_FOAM, MAX_PARTICLES, MAX_RINGS, foam, particles, rings, stepWaterFx } from "./waterPools";
import { daylightOf, getFrameSnapshot } from "../sceneFrame";

// Draws the water-contact pools: droplets and mist, foam patches lying on the
// water, and faint ripples. Everything takes the scene's light, so a splash at
// night is a dim, moonlit one.

const WATER_Y = 0.3;
const WHITE = new THREE.Color(0xffffff);

const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aKind;
  uniform float uScale;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vAlpha = aAlpha;
    vKind = aKind;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(-mvPosition.z, 1.0));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  varying float vKind;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // Droplets: small, fairly crisp; mist: soft and faint.
    float edge = vKind > 0.5 ? smoothstep(0.5, 0.0, d) : smoothstep(0.5, 0.25, d);
    float alpha = vAlpha * edge * (vKind > 0.5 ? 0.38 : 0.85);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/** An irregular foam texture: many soft blobs clustered toward the middle. */
function createFoamTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    for (let i = 0; i < 70; i++) {
      const r = Math.pow(Math.random(), 0.7) * size * 0.36;
      const a = Math.random() * Math.PI * 2;
      const x = size / 2 + Math.cos(a) * r;
      const y = size / 2 + Math.sin(a) * r;
      const blob = 3 + Math.random() * 12 * (1 - r / (size * 0.4));
      const g = ctx.createRadialGradient(x, y, 0, x, y, blob);
      g.addColorStop(0, `rgba(255,255,255,${0.35 + Math.random() * 0.4})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - blob, y - blob, blob * 2, blob * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hideAll(mesh: THREE.InstancedMesh, count: number) {
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const black = new THREE.Color(0, 0, 0);
  for (let i = 0; i < count; i++) {
    mesh.setMatrixAt(i, zero);
    mesh.setColorAt(i, black);
  }
}

export default function WaterFx() {
  const pointsRef = useRef<THREE.Points>(null);
  const foamRef = useRef<THREE.InstancedMesh>(null);
  const ringsRef = useRef<THREE.InstancedMesh>(null);
  const { size, camera } = useThree();
  const scratch = useRef({
    matrix: new THREE.Matrix4(),
    scale: new THREE.Vector3(),
    color: new THREE.Color(),
    light: new THREE.Color(),
    zero: new THREE.Matrix4().makeScale(0, 0, 0),
  });

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(particles.position, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(particles.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aKind", new THREE.BufferAttribute(particles.kind, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 1 }, uColor: { value: new THREE.Color("#ffffff") } },
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
      }),
    []
  );

  const foamTexture = useMemo(() => createFoamTexture(), []);
  const foamGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const foamMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: foamTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [foamTexture]
  );

  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.95, 1, 64, 1).rotateX(-Math.PI / 2), []);
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    []
  );

  useEffect(
    () => () => {
      [geometry, material, foamTexture, foamGeometry, foamMaterial, ringGeometry, ringMaterial].forEach((item) => item.dispose());
    },
    [geometry, material, foamTexture, foamGeometry, foamMaterial, ringGeometry, ringMaterial]
  );

  useFrame((_, delta) => {
    const s = scratch.current;
    stepWaterFx(Math.min(delta, 0.05));
    const snapshot = getFrameSnapshot();
    const daylight = daylightOf(snapshot);
    // Lit like the scene: white by day, warm at dusk, a dim moonlit grey at night.
    s.light.setHex(snapshot.lightColorHex).lerp(WHITE, 0.4).multiplyScalar(0.18 + 0.82 * daylight);

    const points = pointsRef.current;
    if (points) {
      const alpha = points.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
      const a = alpha.array as Float32Array;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const life = particles.life[i];
        a[i] = life <= 0 ? 0 : Math.min(1, (life / particles.maxLife[i]) * 2.5);
      }
      alpha.needsUpdate = true;
      points.geometry.getAttribute("position").needsUpdate = true;
      points.geometry.getAttribute("aSize").needsUpdate = true;
      points.geometry.getAttribute("aKind").needsUpdate = true;
      const shader = points.material as THREE.ShaderMaterial;
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
      shader.uniforms.uScale.value = (size.height * 0.5) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
      (shader.uniforms.uColor.value as THREE.Color).copy(s.light);
    }

    const foamMesh = foamRef.current;
    if (foamMesh) {
      for (let i = 0; i < MAX_FOAM; i++) {
        const t = foam.life[i] > 0 ? foam.age[i] / foam.life[i] : 1;
        if (t >= 1) {
          foamMesh.setMatrixAt(i, s.zero);
          continue;
        }
        const spread = foam.size[i] * (0.7 + 0.9 * Math.sqrt(t)) * 2;
        s.matrix.makeRotationY(foam.angle[i]).scale(s.scale.set(spread, 1, spread)).setPosition(foam.x[i], WATER_Y, foam.z[i]);
        foamMesh.setMatrixAt(i, s.matrix);
        // Quick to appear, slow to break up.
        const fade = Math.min(1, t * 12) * Math.pow(1 - t, 1.4) * foam.strength[i];
        s.color.copy(s.light).multiplyScalar(fade * 0.85);
        foamMesh.setColorAt(i, s.color);
      }
      foamMesh.instanceMatrix.needsUpdate = true;
      if (foamMesh.instanceColor) foamMesh.instanceColor.needsUpdate = true;
    }

    const ringMesh = ringsRef.current;
    if (ringMesh) {
      for (let i = 0; i < MAX_RINGS; i++) {
        const t = rings.life[i] > 0 ? rings.age[i] / rings.life[i] : 1;
        if (t >= 1) {
          ringMesh.setMatrixAt(i, s.zero);
          continue;
        }
        const radius = rings.size[i] * (0.3 + 1.7 * (1 - (1 - t) * (1 - t)));
        s.matrix.makeScale(radius, 1, radius).setPosition(rings.x[i], WATER_Y, rings.z[i]);
        ringMesh.setMatrixAt(i, s.matrix);
        // Barely there: real ripples show as a change in the reflection.
        s.color.copy(s.light).multiplyScalar(Math.pow(1 - t, 1.8) * rings.strength[i] * 0.14);
        ringMesh.setColorAt(i, s.color);
      }
      ringMesh.instanceMatrix.needsUpdate = true;
      if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={foamRef} args={[foamGeometry, foamMaterial, MAX_FOAM]} frustumCulled={false} onUpdate={(mesh) => hideAll(mesh, MAX_FOAM)} />
      <instancedMesh ref={ringsRef} args={[ringGeometry, ringMaterial, MAX_RINGS]} frustumCulled={false} onUpdate={(mesh) => hideAll(mesh, MAX_RINGS)} />
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
    </>
  );
}
