"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motionPrefs } from "../motionPrefs";
import { getFrameSnapshot, getWeather, hazeColor, lightning } from "../sceneFrame";

// Rain, snow and lightning around the viewer, from the weather on screen.
// Rain and snow move entirely in the vertex shader (no work per frame on the
// CPU): each drop falls through a box around the camera and wraps around.
// Under reduced motion they fall slower and thinner, and lightning doesn't flash.

const RAIN = 4000;
const SNOW = 2600;
const BOX = 150; // half the width of the box around the camera
const HEIGHT = 95;

const rainVertex = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aEnd;
  uniform float uTime;
  uniform float uSpeed;
  uniform vec3 uCenter;
  uniform vec2 uWind;
  uniform float uLength;
  varying float vFade;
  void main() {
    float speed = uSpeed * (0.85 + 0.3 * fract(aSeed.x * 7.13 + aSeed.z * 3.7));
    float y = mod(aSeed.y - uTime * speed, ${HEIGHT}.0);
    vec3 p = vec3(uCenter.x + aSeed.x, y, uCenter.z + aSeed.z);
    vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
    p -= dir * aEnd * uLength;
    float d = length(p.xz - uCenter.xz);
    vFade = (1.0 - smoothstep(${BOX * 0.55}, ${BOX}.0, d)) * smoothstep(0.0, 3.0, y) * mix(1.0, 0.15, aEnd);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const snowVertex = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uSpeed;
  uniform vec3 uCenter;
  uniform vec2 uWind;
  uniform float uScale;
  varying float vFade;
  void main() {
    float phase = fract(aSeed.x * 3.17 + aSeed.z * 1.31) * 6.2831;
    float y = mod(aSeed.y - uTime * uSpeed * (0.8 + 0.4 * fract(phase)), ${HEIGHT}.0);
    vec3 p = vec3(uCenter.x + aSeed.x, y, uCenter.z + aSeed.z);
    p.x += sin(uTime * 0.7 + phase) * 1.6 + uWind.x * (${HEIGHT}.0 - y) * 0.15;
    p.z += cos(uTime * 0.53 + phase) * 1.6 + uWind.y * (${HEIGHT}.0 - y) * 0.15;
    float d = length(p.xz - uCenter.xz);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Flakes right at the camera would fill the screen: they fade, and no flake grows past a few pixels.
    vFade = (1.0 - smoothstep(${BOX * 0.55}, ${BOX}.0, d)) * smoothstep(0.0, 3.0, y) * smoothstep(6.0, 16.0, -mv.z);
    gl_PointSize = clamp(0.35 * uScale / max(-mv.z, 1.0), 1.0, 9.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRound;
  varying float vFade;
  void main() {
    float shape = uRound > 0.5 ? smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5)) : 1.0;
    gl_FragColor = vec4(uColor, uOpacity * vFade * shape);
  }
`;

function seeds(count: number, perItem: number) {
  const seed = new Float32Array(count * perItem * 3);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() * 2 - 1) * BOX;
    const y = Math.random() * HEIGHT;
    const z = (Math.random() * 2 - 1) * BOX;
    for (let j = 0; j < perItem; j++) seed.set([x, y, z], (i * perItem + j) * 3);
  }
  return seed;
}

/** A jagged bolt from the cloud base down to the sea, by midpoint displacement. */
function boltPoints() {
  let points = [new THREE.Vector3(0, 620, 0), new THREE.Vector3((Math.random() - 0.5) * 160, 0, (Math.random() - 0.5) * 60)];
  let spread = 110;
  for (let level = 0; level < 6; level++) {
    const next: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const mid = points[i].clone().lerp(points[i + 1], 0.5);
      mid.x += (Math.random() - 0.5) * spread;
      mid.z += (Math.random() - 0.5) * spread * 0.4;
      next.push(points[i], mid);
    }
    next.push(points[points.length - 1]);
    points = next;
    spread *= 0.55;
  }
  return points;
}

export default function Precipitation() {
  const rainRef = useRef<THREE.LineSegments>(null);
  const snowRef = useRef<THREE.Points>(null);
  const boltRef = useRef<THREE.Line>(null);
  const storm = useRef({ next: 6, start: -10 });
  const scratch = useRef({ color: new THREE.Color(), white: new THREE.Color(0xffffff) });

  const rain = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds(RAIN, 2), 3));
    geometry.setAttribute("aEnd", new THREE.BufferAttribute(new Float32Array(RAIN * 2).map((_, i) => i % 2), 1));
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAIN * 2 * 3), 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.ShaderMaterial({
      vertexShader: rainVertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 70 },
        uCenter: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector2() },
        uLength: { value: 6 },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0 },
        uRound: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    return { geometry, material };
  }, []);

  const snow = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds(SNOW, 1), 3));
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SNOW * 3), 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.ShaderMaterial({
      vertexShader: snowVertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 8 },
        uCenter: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector2() },
        uScale: { value: 600 },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0 },
        uRound: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    });
    return { geometry, material };
  }, []);

  const bolt = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(boltPoints());
    const material = new THREE.LineBasicMaterial({ color: "#dfe8ff", transparent: true, opacity: 0, fog: false, toneMapped: false });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    return { geometry, material, line };
  }, []);

  useEffect(
    () => () => {
      [rain.geometry, rain.material, snow.geometry, snow.material, bolt.geometry, bolt.material].forEach((item) => item.dispose());
    },
    [rain, snow, bolt]
  );

  useFrame((state) => {
    const weather = getWeather();
    const time = state.clock.elapsedTime;
    const reduced = motionPrefs.reduced;
    const s = scratch.current;
    // The drops take the air's color, a little lighter: grey by day, dark at night.
    hazeColor(getFrameSnapshot(), s.color).lerp(s.white, 0.3);
    const windX = weather.wind * 0.55;

    const rainLines = rainRef.current;
    if (rainLines) {
      const amount = reduced ? weather.rain * 0.4 : weather.rain;
      rainLines.visible = amount > 0.02;
      rainLines.geometry.setDrawRange(0, Math.floor(RAIN * Math.min(1, amount)) * 2);
      const u = (rainLines.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = time;
      u.uSpeed.value = reduced ? 28 : 70;
      (u.uCenter.value as THREE.Vector3).copy(state.camera.position);
      (u.uWind.value as THREE.Vector2).set(windX, 0.15 * weather.wind);
      (u.uColor.value as THREE.Color).copy(s.color);
      u.uOpacity.value = 0.18 + 0.22 * Math.min(1, amount) + lightning.flash * 0.4;
    }

    const flakes = snowRef.current;
    if (flakes) {
      const amount = reduced ? weather.snow * 0.4 : weather.snow;
      flakes.visible = amount > 0.02;
      flakes.geometry.setDrawRange(0, Math.floor(SNOW * Math.min(1, amount)));
      const u = (flakes.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = time;
      u.uSpeed.value = reduced ? 4 : 8;
      (u.uCenter.value as THREE.Vector3).copy(state.camera.position);
      (u.uWind.value as THREE.Vector2).set(windX, 0.1 * weather.wind);
      u.uScale.value = state.size.height / Math.tan(THREE.MathUtils.degToRad(((state.camera as THREE.PerspectiveCamera).fov ?? 55) / 2));
      (u.uColor.value as THREE.Color).copy(s.color).lerp(s.white, 0.5);
      u.uOpacity.value = 0.55 + 0.3 * Math.min(1, amount);
    }

    // Lightning: now and then a distant bolt and a double flash, while it storms.
    const st = storm.current;
    let flash = 0;
    if (weather.storm > 0.5 && !reduced) {
      if (time >= st.next) {
        st.start = time;
        st.next = time + 4 + Math.random() * 10;
        const line = boltRef.current;
        if (line) {
          line.geometry.setFromPoints(boltPoints());
          const bearing = Math.random() * Math.PI * 2;
          const distance = 1500 + Math.random() * 2500;
          line.position.set(state.camera.position.x + Math.sin(bearing) * distance, 0, state.camera.position.z - Math.cos(bearing) * distance);
        }
      }
      const t = time - st.start;
      if (t < 0.08) flash = 1;
      else if (t < 0.15) flash = 0.15;
      else if (t < 0.24) flash = 0.8;
      else if (t < 0.9) flash = 0.8 * Math.exp(-(t - 0.24) * 6);
      flash *= weather.storm;
    }
    lightning.flash = flash;
    const line = boltRef.current;
    if (line) (line.material as THREE.LineBasicMaterial).opacity = flash > 0.3 ? flash : 0;
  });

  return (
    <>
      <lineSegments ref={rainRef} geometry={rain.geometry} material={rain.material} frustumCulled={false} visible={false} />
      <points ref={snowRef} geometry={snow.geometry} material={snow.material} frustumCulled={false} visible={false} />
      <primitive ref={boltRef} object={bolt.line} />
    </>
  );
}
