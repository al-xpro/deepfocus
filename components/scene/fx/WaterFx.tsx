"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_PARTICLES, MAX_RINGS, particles, rings, stepWaterFx } from "./waterPools";
import { daylightOf, getFrameSnapshot } from "../sceneFrame";

// Draws the water-contact pools. By day spray is white and lit by the scene;
// at night everything that stirs the water glows blue-green (bioluminescence),
// close to the brand teal.

const GLOW = new THREE.Color("#3fe8d2");
const RING_Y = 0.35;

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
    gl_PointSize = aSize * uScale / max(-mvPosition.z, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragment = /* glsl */ `
  uniform vec3 uDayColor;
  uniform vec3 uGlowColor;
  uniform float uNight;
  varying float vAlpha;
  varying float vKind;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.0, d);
    // Sparks always glow; spray and mist glow more the darker it is.
    float glow = vKind > 1.5 ? 1.0 : uNight * 0.85;
    vec3 color = mix(uDayColor, uGlowColor, glow);
    float alpha = vAlpha * soft * (vKind > 0.5 && vKind < 1.5 ? 0.55 : 0.9);
    gl_FragColor = vec4(color, alpha);
  }
`;

export default function WaterFx() {
  const pointsRef = useRef<THREE.Points>(null);
  const ringsRef = useRef<THREE.InstancedMesh>(null);
  const { size, camera } = useThree();
  const matrix = useRef(new THREE.Matrix4());
  const color = useRef(new THREE.Color());
  const dayColor = useRef(new THREE.Color());

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(particles.position, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(particles.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aKind", new THREE.BufferAttribute(particles.kind, 1).setUsage(THREE.DynamicDrawUsage));
    // Particles go anywhere: never cull the whole system by its first bounds.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uScale: { value: 1 },
          uDayColor: { value: new THREE.Color("#ffffff") },
          uGlowColor: { value: GLOW.clone() },
          uNight: { value: 0 },
        },
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
      }),
    []
  );

  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.94, 1, 64, 1).rotateX(-Math.PI / 2), []);
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    []
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    stepWaterFx(dt);
    const snapshot = getFrameSnapshot();
    const night = 1 - daylightOf(snapshot);

    // Particles: alpha from remaining life, size scale from the viewport.
    const points = pointsRef.current;
    if (points) {
      const alpha = points.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
      const a = alpha.array as Float32Array;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const life = particles.life[i];
        if (life <= 0) {
          a[i] = 0;
          continue;
        }
        const t = life / particles.maxLife[i];
        a[i] = Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 8 + 0.2);
      }
      alpha.needsUpdate = true;
      points.geometry.getAttribute("position").needsUpdate = true;
      points.geometry.getAttribute("aSize").needsUpdate = true;
      points.geometry.getAttribute("aKind").needsUpdate = true;

      const shader = points.material as THREE.ShaderMaterial;
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
      shader.uniforms.uScale.value = (size.height * 0.5) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
      shader.uniforms.uNight.value = night;
      // Day spray takes the scene's light, dimmer as the sun goes down.
      dayColor.current.setHex(snapshot.lightColorHex).multiplyScalar(0.35 + 0.65 * (1 - night));
      (shader.uniforms.uDayColor.value as THREE.Color).copy(dayColor.current);
      shader.blending = night > 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending;
    }

    // Ripples: expanding, fading rings; additive, so brightness is opacity.
    const ringMesh = ringsRef.current;
    if (ringMesh) {
      for (let i = 0; i < MAX_RINGS; i++) {
        const t = rings.life[i] > 0 ? rings.age[i] / rings.life[i] : 1;
        if (t >= 1) {
          matrix.current.makeScale(0, 0, 0);
          ringMesh.setMatrixAt(i, matrix.current);
          continue;
        }
        const ease = 1 - (1 - t) * (1 - t);
        const radius = rings.size[i] * (0.25 + 1.75 * ease);
        matrix.current.makeScale(radius, 1, radius).setPosition(rings.x[i], RING_Y, rings.z[i]);
        ringMesh.setMatrixAt(i, matrix.current);
        const fade = Math.pow(1 - t, 1.6) * rings.strength[i];
        color.current
          .setRGB(0.32, 0.36, 0.4)
          .lerp(GLOW, night)
          // Faint by day (real ripples barely show), bright at night (the glow).
          .multiplyScalar(fade * (0.22 + 1.0 * night));
        ringMesh.setColorAt(i, color.current);
      }
      ringMesh.instanceMatrix.needsUpdate = true;
      if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
      <instancedMesh
        ref={ringsRef}
        args={[ringGeometry, ringMaterial, MAX_RINGS]}
        frustumCulled={false}
        onUpdate={(mesh) => {
          // Start every ring hidden and give the mesh its per-ring colors.
          const zero = new THREE.Matrix4().makeScale(0, 0, 0);
          for (let i = 0; i < MAX_RINGS; i++) {
            mesh.setMatrixAt(i, zero);
            mesh.setColorAt(i, new THREE.Color(0, 0, 0));
          }
        }}
      />
    </>
  );
}
