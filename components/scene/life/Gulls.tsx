"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { waterFx } from "../fx/waterPools";
import { OBSTACLES } from "../landscape";
import { daylightOf, getFrameSnapshot, quickLife, view } from "../sceneFrame";

// Seagulls (kenchoo's "Seagull", CC BY-NC-SA: CREDITS.md). Never a flock: one
// small episode at a time, by day.
//
//   1. Flying: one to four gulls cross the view, near or far, in a formation
//      (single, pair, V, echelon or loose diamond), flapping and gliding.
//   2. Feeding: one to three land on the water, float, put their heads under to
//      catch a fish, then take off and leave.
//   3. Perching: one to three land on the sea stacks, look around, and leave.
//
// The model faces its local +z (checked by rendering it beside labelled axes),
// so a heading h becomes a yaw of π − h, as for the dolphins.

const URL = "/models/seagull.glb";
const POOL = 4;
const SCALE = 4.5; // a wingspan of about 11 units
const SPEED = 55; // about 8 m/s at the scene's scale
/** A moment in the flap cycle with the wings level: the gliding pose. */
const GLIDE_TIME = 1.55;

// Poses, as rotations added on top of the clip's pose, found by rendering the
// model from the side, above and the front. Bone names as three's loader
// sanitizes them (dots removed).
type Turn = [bone: string, axis: "x" | "y" | "z", angle: number];
/** Wings folded along the body, the primaries crossed over the tail. */
const FOLD: Turn[] = [
  ["Wing01L_3", "y", -1.45],
  ["Wing01L_3", "x", 0.35],
  ["Wing01L_3", "z", -1.0],
  ["Wing02L_2", "z", -1.3],
  ["Wing02L001_1", "z", 0.6],
  ["Wing02L001_1", "y", 0.4],
  ["Wing01R_9", "y", 1.45],
  ["Wing01R_9", "x", 0.35],
  ["Wing01R_9", "z", 1.0],
  ["Wing02R_8", "z", 1.3],
  ["Wing02R001_7", "z", -0.6],
  ["Wing02R001_7", "y", -0.4],
];
/** Feeding: the neck bent down, the bill under the water. */
const DIP: Turn[] = [["Bone003_5", "x", -1.2]];
/**
 * The legs' root bone, which the clip leaves alone (so it's posed from its
 * rest): tucked under the tail in flight, straight down to land and stand.
 */
const LEGS = "Bone004_18";
const LEGS_TUCKED = -0.5;
const LEGS_DOWN = 1.0;
/** Below the model's origin, at scale 1: the feet when standing, the belly with the legs tucked. */
const FEET = 0.69;
const BELLY = 0.32;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

interface Pose {
  fold: Array<THREE.Object3D | null>;
  dip: Array<THREE.Object3D | null>;
  legs: THREE.Object3D | null;
  legsRest: THREE.Quaternion;
}

function applyTurns(bones: Array<THREE.Object3D | null>, turns: Turn[], amount: number, q: THREE.Quaternion) {
  if (amount < 0.01) return;
  for (let j = 0; j < turns.length; j++) {
    const bone = bones[j];
    if (bone) bone.quaternion.multiply(q.setFromAxisAngle(AXES[turns[j][1]], turns[j][2] * amount));
  }
}

type Leg =
  | { kind: "wait"; duration: number }
  | { kind: "fly" | "land" | "takeoff"; duration: number; curve: THREE.CubicBezierCurve3; offset?: THREE.Vector3 }
  | { kind: "float" | "perch"; duration: number; at: THREE.Vector3; dips: number[] };

interface Gull {
  legs: Leg[];
  leg: number;
  t: number; // seconds into the current leg
  heading: number;
  pitch: number;
  bank: number;
  fold: number; // 0 wings open, 1 folded
  legsDown: number; // 0 tucked, 1 down
  dip: number; // 0 head up, 1 under the water
  phase: number;
  glideFor: number; // seconds left gliding (else flapping)
  dipped: Set<number>;
  lookAt: number;
  look: number; // the heading it's turning to look toward, at rest
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/** Where the viewer stands on the water; updated each frame from the camera. */
const eye = new THREE.Vector3();

/** A point at a bearing from the viewer (radians, 0 = north, as `view.bearing`), a distance and a height. */
function polar(bearing: number, distance: number, y: number) {
  return new THREE.Vector3(eye.x + Math.sin(bearing) * distance, y, eye.z - Math.cos(bearing) * distance);
}

/** The bearing of a point from the viewer. */
function bearingOf(point: THREE.Vector3) {
  return Math.atan2(point.x - eye.x, -(point.z - eye.z));
}

function curveThrough(from: THREE.Vector3, via: THREE.Vector3, to: THREE.Vector3) {
  const c1 = from.clone().lerp(via, 0.66);
  const c2 = to.clone().lerp(via, 0.66);
  return new THREE.CubicBezierCurve3(from, c1, c2, to);
}

function duration(curve: THREE.Curve<THREE.Vector3>, speed = SPEED) {
  return curve.getLength() / speed;
}

/** Formations, in the leader's frame: x to its right, z behind it, y up. */
const FORMATIONS: THREE.Vector3[][][] = [
  [[new THREE.Vector3(0, 0, 0)]],
  [[new THREE.Vector3(0, 0, 0), new THREE.Vector3(7, 1, 5)]],
  [[new THREE.Vector3(0, 0, 0), new THREE.Vector3(-8, 0.5, 6), new THREE.Vector3(8, -0.5, 6)]],
  [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(7, 0.5, 6), new THREE.Vector3(14, 1, 12), new THREE.Vector3(21, 1.5, 18)],
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-8, 0, 6), new THREE.Vector3(8, 0, 6), new THREE.Vector3(0, 1, 13)],
  ],
];

function newGull(legs: Leg[]): Gull {
  return { legs, leg: 0, t: 0, heading: 0, pitch: 0, bank: 0, fold: 0, legsDown: 0, dip: 0, phase: Math.random() * 10, glideFor: 0, dipped: new Set(), lookAt: 0, look: 0 };
}

/** Mode 1: a formation crossing the view, near or far. */
function flyBy(): Gull[] {
  const count = pick([1, 1, 2, 2, 3, 4]);
  const near = Math.random() < 0.55;
  const distance = near ? random(60, 160) : random(250, 450);
  const side = Math.random() < 0.5 ? -1 : 1;
  const b = view.bearing;
  const altitude = near ? random(12, 35) : random(30, 70);
  const from = polar(b - side * 0.9, distance * 1.4, altitude + random(5, 20));
  const via = polar(b + random(-0.15, 0.15), distance, altitude);
  const to = polar(b + side * 0.9, distance * 1.4, altitude + random(-5, 20));
  const curve = curveThrough(from, via, to);
  const formation = pick(FORMATIONS[count - 1]);
  return formation.map((offset, i) => {
    const gull = newGull([
      { kind: "wait", duration: i * 0.15 },
      { kind: "fly", duration: duration(curve), curve, offset },
    ]);
    gull.glideFor = Math.random() * 2;
    return gull;
  });
}

/** Mode 2: land on the water, feed, leave. */
function feed(): Gull[] {
  const count = pick([1, 1, 2, 2, 3]);
  // Open water ahead, clear of the rocks.
  let b = view.bearing;
  let spot = polar(b, 250, 0);
  for (let attempt = 0; attempt < 20; attempt++) {
    b = view.bearing + random(-0.3, 0.3);
    spot = polar(b, random(170, 340), 0);
    if (OBSTACLES.every((o) => Math.hypot(spot.x - o.x, spot.z - o.z) > o.radius + 30)) break;
  }
  const side = Math.random() < 0.5 ? -1 : 1;
  // A body length or more apart.
  const spots: THREE.Vector3[] = [];
  for (let attempt = 0; spots.length < count && attempt < 200; attempt++) {
    const candidate = spot.clone().add(new THREE.Vector3(random(-16, 16), 0, random(-16, 16)));
    if (spots.every((other) => other.distanceTo(candidate) > 9)) spots.push(candidate);
  }
  return spots.map((place, i) => {
    // Riding high, the belly a little under the surface.
    const at = place.clone().setY(BELLY * SCALE - 0.4);
    const from = polar(b - side * random(0.9, 1.3), random(450, 650), random(50, 80));
    const approach = curveThrough(from, at.clone().add(new THREE.Vector3(0, 18, 0)).lerp(from, 0.25), at);
    const stay = random(10, 18);
    const exit = polar(b + side * random(1.1, 1.6), random(600, 800), random(70, 110));
    const leave = curveThrough(at, at.clone().lerp(exit, 0.3).add(new THREE.Vector3(0, 25, 0)), exit);
    const dips = Array.from({ length: Math.floor(random(2, 4.99)) }, () => random(2, stay - 2)).sort((a, z) => a - z);
    return newGull([
      { kind: "wait", duration: i * random(0.8, 1.8) },
      { kind: "land", duration: duration(approach, SPEED * 0.85), curve: approach },
      { kind: "float", duration: stay, at, dips },
      { kind: "takeoff", duration: duration(leave, SPEED * 0.9), curve: leave },
    ]);
  });
}

/** Mode 3: land on the sea stacks, rest, leave. */
function perch(points: THREE.Vector3[]): Gull[] {
  const count = Math.min(points.length, pick([1, 1, 2, 3]));
  const chosen = [...points].sort(() => Math.random() - 0.5).slice(0, count);
  return chosen.map((point, i) => {
    const at = point.clone();
    at.y += FEET * SCALE; // standing on its feet
    const b = bearingOf(at);
    const side = Math.random() < 0.5 ? -1 : 1;
    const from = polar(b + side * random(0.6, 1.1), random(450, 650), random(60, 90));
    const approach = curveThrough(from, at.clone().add(new THREE.Vector3(0, 22, 0)).lerp(from, 0.2), at);
    const stay = random(12, 22);
    const exit = polar(b - side * random(0.8, 1.4), random(600, 800), random(80, 120));
    const leave = curveThrough(at, at.clone().lerp(exit, 0.25).add(new THREE.Vector3(0, 20, 0)), exit);
    return newGull([
      { kind: "wait", duration: i * random(1, 2.5) },
      { kind: "land", duration: duration(approach, SPEED * 0.85), curve: approach },
      { kind: "perch", duration: stay, at, dips: [] },
      { kind: "takeoff", duration: duration(leave, SPEED * 0.9), curve: leave },
    ]);
  });
}

/** Leaving the water: a ripple where the gull was floating. */
function waterFxAtTakeoff(gull: Gull) {
  const leg = gull.legs[gull.leg - 1];
  if (leg && leg.kind === "float") waterFx.ripple(leg.at.x, leg.at.z, 4, 0.7);
}

/** Flat tops of the sea stacks and the cliff rock, found by casting rays down onto them. */
function findPerches(rocks: THREE.Object3D[]) {
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const box = new THREE.Box3();
  const points: THREE.Vector3[] = [];
  for (const rock of rocks) {
    rock.updateWorldMatrix(true, true);
    box.setFromObject(rock);
    const hits: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const x = box.min.x + ((box.max.x - box.min.x) * i) / 10;
        const z = box.min.z + ((box.max.z - box.min.z) * j) / 10;
        raycaster.set(new THREE.Vector3(x, box.max.y + 50, z), down);
        const hit = raycaster.intersectObject(rock, true)[0];
        if (!hit || hit.point.y < 4) continue;
        const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld);
        if (normal && normal.y < 0.55) continue;
        hits.push(hit.point.clone());
      }
    }
    hits.sort((a, b) => b.y - a.y);
    let added = 0;
    for (const hit of hits) {
      if (points.some((p) => p.distanceTo(hit) < 9)) continue; // a body length apart
      points.push(hit);
      if (++added === 3) break; // the highest few on each rock
    }
  }
  return points;
}

export default function Gulls({ rocks }: { rocks: THREE.Object3D[] }) {
  const { scene, animations } = useGLTF(URL, false);
  const groups = useRef<Array<THREE.Group | null>>([]);
  const mixers = useRef<THREE.AnimationMixer[]>([]);
  const poses = useRef<Pose[]>([]);
  const gulls = useRef<Array<Gull | null>>(Array.from({ length: POOL }, () => null));
  const perches = useRef<THREE.Vector3[]>([]);
  const nextEpisodeAt = useRef(-1);
  const scratch = useRef({
    point: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    back: new THREE.Vector3(),
    q: new THREE.Quaternion(),
  });

  const models = useMemo(
    () =>
      Array.from({ length: POOL }, () => {
        const clone = cloneSkeleton(scene) as THREE.Group;
        clone.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) mesh.frustumCulled = false;
        });
        return clone;
      }),
    [scene]
  );

  useEffect(() => {
    mixers.current = models.map((model) => {
      const mixer = new THREE.AnimationMixer(model);
      if (animations[0]) mixer.clipAction(animations[0]).play();
      return mixer;
    });
    poses.current = models.map((model) => {
      const find = (turns: Turn[]) => turns.map(([name]) => model.getObjectByName(name) ?? null);
      const legs = model.getObjectByName(LEGS) ?? null;
      if (legs) legs.userData.rest ??= legs.quaternion.clone();
      return { fold: find(FOLD), dip: find(DIP), legs, legsRest: legs?.userData.rest ?? new THREE.Quaternion() };
    });
    for (const group of groups.current) if (group) group.rotation.order = "YXZ";
    return () => mixers.current.forEach((mixer) => mixer.stopAllAction());
  }, [models, animations]);

  useEffect(() => {
    if (rocks.length > 0) perches.current = findPerches(rocks);
  }, [rocks]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const time = state.clock.elapsedTime;
    const s = scratch.current;
    const daylight = daylightOf(getFrameSnapshot());
    eye.set(state.camera.position.x, 0, state.camera.position.z);

    // One episode at a time, by day.
    if (nextEpisodeAt.current < 0) nextEpisodeAt.current = time + (quickLife ? 1.5 : random(6, 12));
    const busy = gulls.current.some(Boolean);
    if (!busy && time >= nextEpisodeAt.current && daylight > 0.3) {
      // Perching only when the rocks are in view, or turning into it.
      const visiblePerches = perches.current.filter((p) => {
        const ahead = Math.atan2(Math.sin(bearingOf(p) - view.bearing), Math.cos(bearingOf(p) - view.bearing));
        return ahead * view.turning > -0.5 && Math.abs(ahead) < 1.3;
      });
      const roll = Math.random();
      const episode =
        roll < 0.45 ? flyBy() : roll < 0.72 || visiblePerches.length === 0 ? feed() : perch(visiblePerches);
      episode.slice(0, POOL).forEach((gull, i) => (gulls.current[i] = gull));
    }

    gulls.current.forEach((gull, i) => {
      const group = groups.current[i];
      const mixer = mixers.current[i];
      if (!group || !mixer) return;
      if (!gull) {
        group.visible = false;
        return;
      }

      let leg = gull.legs[gull.leg];
      gull.t += dt;
      while (leg && gull.t >= leg.duration) {
        gull.t -= leg.duration;
        gull.leg += 1;
        gull.dipped.clear();
        leg = gull.legs[gull.leg];
        if (leg && leg.kind === "takeoff") waterFxAtTakeoff(gull);
      }
      if (!leg) {
        gulls.current[i] = null;
        group.visible = false;
        if (!gulls.current.some(Boolean)) nextEpisodeAt.current = time + (quickLife ? 2 : random(10, 28));
        return;
      }
      if (leg.kind === "wait") {
        group.visible = false;
        return;
      }
      group.visible = true;
      const k = leg.duration > 0 ? gull.t / leg.duration : 1;
      let flap = 1;
      let targetFold = 0;
      let targetPitch = 0;
      let targetLegs = 0;
      let targetDip = 0;
      const previousHeading = gull.heading;

      if (leg.kind === "fly" || leg.kind === "land" || leg.kind === "takeoff") {
        // Even speed along the path; landing slows at the end, take-off starts slow.
        const u = leg.kind === "land" ? 1 - (1 - k) * (1 - k) : leg.kind === "takeoff" ? k * k * (3 - 2 * k) : k;
        leg.curve.getPointAt(Math.min(u, 1), s.point);
        leg.curve.getTangentAt(Math.min(u, 0.999), s.tangent);
        gull.heading = Math.atan2(s.tangent.x, -s.tangent.z);
        targetPitch = Math.atan2(s.tangent.y, Math.hypot(s.tangent.x, s.tangent.z));
        if (leg.kind === "fly" && leg.offset) {
          // Hold a place in the formation: right, behind and above the leader's path.
          s.right.set(Math.cos(gull.heading), 0, Math.sin(gull.heading));
          s.back.set(-Math.sin(gull.heading), 0, Math.cos(gull.heading));
          s.point.addScaledVector(s.right, leg.offset.x).addScaledVector(s.back, leg.offset.z);
          s.point.y += leg.offset.y;
        }
        group.position.copy(s.point);
        group.position.y += Math.sin(time * 1.3 + gull.phase) * 0.6;
        if (leg.kind === "land") {
          // Glide in, lower the legs, flare (nose up) and fold the wings on touching down.
          flap = k < 0.6 ? 0.9 : 0;
          if (k > 0.8) targetPitch = 0.45 * ((k - 0.8) / 0.2);
          targetLegs = THREE.MathUtils.smoothstep(k, 0.65, 0.85);
          targetFold = Math.max(0, (k - 0.93) / 0.07);
        } else if (leg.kind === "takeoff") {
          flap = 1.7;
          targetFold = Math.max(0, 1 - k * 6);
        }
      } else {
        // Floating or perched: wings folded, bobbing on the water or still on the rock.
        const rest = leg as Extract<Leg, { kind: "float" | "perch" }>;
        targetFold = 1;
        flap = 0;
        // Standing on the rock; on the water the legs paddle out of sight.
        targetLegs = rest.kind === "perch" ? 1 : 0;
        group.position.copy(rest.at);
        if (rest.kind === "float") group.position.y = rest.at.y + Math.sin(time * 1.4 + gull.phase) * 0.22;
        // Looking around now and then.
        if (time >= gull.lookAt) {
          gull.lookAt = time + random(1.5, 3.5);
          gull.look = gull.heading + random(-0.7, 0.7);
        }
        gull.heading += Math.atan2(Math.sin(gull.look - gull.heading), Math.cos(gull.look - gull.heading)) * Math.min(1, dt * 1.5);
        // Feeding: the head and neck go under for a moment, the body tipping forward a little.
        for (const at of rest.dips) {
          const into = gull.t - at;
          if (into >= 0 && into < 1.3) {
            const down = Math.sin((into / 1.3) * Math.PI);
            targetDip = Math.min(1, down * 1.6);
            targetPitch = -0.35 * down;
            group.position.y -= 0.25 * down;
            if (!gull.dipped.has(at)) {
              gull.dipped.add(at);
              waterFx.ripple(rest.at.x + Math.sin(gull.heading) * 2, rest.at.z - Math.cos(gull.heading) * 2, 3, 0.6);
            }
          }
        }
      }

      // Lean into turns (a positive bank lowers the right wing, and a right
      // turn raises the heading); ease the pitch, the wings, the legs and the head.
      const turnRate = Math.atan2(Math.sin(gull.heading - previousHeading), Math.cos(gull.heading - previousHeading)) / Math.max(dt, 1e-3);
      gull.bank += (THREE.MathUtils.clamp(turnRate * 0.5, -0.6, 0.6) - gull.bank) * Math.min(1, dt * 3);
      gull.pitch += (targetPitch - gull.pitch) * Math.min(1, dt * 4);
      gull.fold += (targetFold - gull.fold) * Math.min(1, dt * 3);
      gull.legsDown += (targetLegs - gull.legsDown) * Math.min(1, dt * 4);
      gull.dip += (targetDip - gull.dip) * Math.min(1, dt * 8);
      group.rotation.set(-gull.pitch, Math.PI - gull.heading, gull.fold > 0.5 ? 0 : gull.bank);

      // Wings: flapping, gliding, or folded on top of the gliding pose.
      if (flap > 0 && leg.kind === "fly") {
        gull.glideFor -= dt;
        if (gull.glideFor < -random(2, 4)) gull.glideFor = random(1.5, 4);
        if (gull.glideFor > 0) flap = 0;
      }
      if (flap > 0) mixer.update(dt * flap);
      else mixer.setTime(GLIDE_TIME);
      const pose = poses.current[i];
      if (pose) {
        applyTurns(pose.fold, FOLD, gull.fold, s.q);
        applyTurns(pose.dip, DIP, gull.dip, s.q);
        if (pose.legs) {
          const angle = THREE.MathUtils.lerp(LEGS_TUCKED, LEGS_DOWN, gull.legsDown);
          pose.legs.quaternion.copy(pose.legsRest).multiply(s.q.setFromAxisAngle(AXES.z, angle));
        }
      }
    });
  });

  return (
    <>
      {models.map((model, i) => (
        <group
          key={i}
          ref={(group) => {
            groups.current[i] = group;
          }}
          visible={false}
        >
          <group scale={SCALE}>
            <primitive object={model} />
          </group>
        </group>
      ))}
    </>
  );
}

useGLTF.preload(URL, false);
