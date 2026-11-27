"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { waterFx } from "../fx/waterPools";
import { OBSTACLES } from "../landscape";
import { getFrameSnapshot, getWeather, quickLife, view } from "../sceneFrame";

// Seagulls (kenchoo's "Seagull", CC BY-NC-SA: CREDITS.md). One episode at a
// time, between sunrise and sunset.
//
//   1. Flying: a loose flock of eight to twelve passes high over the sea, near
//      or far, and flies off into the distance.
//   2. Feeding: one to three come in from far off, land on the water, dip their
//      heads to catch a fish, then take off and fly away.
//   3. Perching: one to three come in, land on the rocks, stand a while, and fly
//      away.
//
// Gulls come from and leave for the far distance, fading into the haze out
// there: none appears or vanishes in view. They never hover: a landing slows to
// a glide, a take-off speeds up from one.
//
// The model faces its local +z (checked by rendering it beside labelled axes),
// so a heading h becomes a yaw of π − h, as for the dolphins.

const URL = "/models/seagull.glb";
const POOL = 16;
const FLOCK = { min: 8, max: 12 };
const SCALE = 4.5; // a wingspan of about 11 units
const CRUISE = 70; // units a second, about 10 m/s at the scene's scale
/** Where gulls come from and leave for; they fade into the haze past FADE_FROM. */
const FAR = 2000;
const FADE_FROM = 1300;
/** The clip is one slow wingbeat (2.08 s); played this much faster, about 1.7 beats a second. */
const BEAT = 3.6;
const STRONG_BEAT = 5;
/** The moment in the wingbeat when the wings are level: gliding, and the base of the folded pose. */
const GLIDE_TIME = 1.55;
/** Seconds spent spreading the wings before lifting off. */
const SPREAD = 0.7;
const MAX_PITCH = 0.5;
const MAX_BANK = 0.5;

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
  /**
   * The bones the poses turn, and their pose from the clip. The mixer only writes
   * a bone when its animated value changes, so while the wings are held still it
   * writes nothing, and turns added on top would pile up frame after frame. Each
   * frame the bones go back to their clip pose before the mixer runs.
   */
  bones: THREE.Object3D[];
  base: THREE.Quaternion[];
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
  | { kind: "fly" | "land" | "takeoff"; duration: number; curve: THREE.Curve<THREE.Vector3>; offset?: THREE.Vector3 }
  | { kind: "float" | "perch"; duration: number; at: THREE.Vector3; dips: number[] };

/** What the wings do: beat, beat hard (taking off), glide (held level), or rest (folded). */
type Wings = "beat" | "strong" | "glide" | "rest";

interface Gull {
  legs: Leg[];
  leg: number;
  t: number; // seconds into the current leg
  started: boolean; // has had a heading yet
  heading: number;
  pitch: number;
  bank: number;
  fold: number; // 0 wings open, 1 folded
  legsDown: number; // 0 tucked, 1 down
  dip: number; // 0 head up, 1 under the water
  rate: number; // wingbeat speed, in clip seconds per second
  holding: boolean; // wings held level
  gliding: boolean; // in a glide spell (else beating)
  spell: number; // seconds left in the spell
  perched: boolean;
  dipped: Set<number>;
  lookAt: number;
  look: number;
  phase: number;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

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

function headingFrom(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.atan2(b.x - a.x, -(b.z - a.z));
}

/** A point some distance from another along a heading, at a height. */
function along(origin: THREE.Vector3, heading: number, distance: number, y: number) {
  return new THREE.Vector3(origin.x + Math.sin(heading) * distance, y, origin.z - Math.cos(heading) * distance);
}

/** A smooth path through the points (it passes through each of them). */
function path(...points: THREE.Vector3[]) {
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

/** How close a path comes to the viewer, on the water's plane. */
function closestToEye(curve: THREE.Curve<THREE.Vector3>) {
  let closest = Infinity;
  for (const point of curve.getSpacedPoints(60)) closest = Math.min(closest, Math.hypot(point.x - eye.x, point.z - eye.z));
  return closest;
}

/**
 * A loose flock: places in the leader's frame (x to its right, z behind it, y
 * up), spread wide and deep, at least a wingspan and a half apart.
 */
function flockPlaces(count: number) {
  const places = [new THREE.Vector3(0, 0, 0)];
  for (let attempt = 0; places.length < count && attempt < 400; attempt++) {
    const place = new THREE.Vector3(random(-32, 32), random(-7, 7), random(-6, 48));
    if (places.every((other) => other.distanceTo(place) > 16)) places.push(place);
  }
  return places;
}

function newGull(legs: Leg[]): Gull {
  return {
    legs,
    leg: 0,
    t: 0,
    started: false,
    heading: 0,
    pitch: 0,
    bank: 0,
    fold: 0,
    legsDown: 0,
    dip: 0,
    rate: BEAT,
    holding: false,
    gliding: Math.random() < 0.5,
    spell: random(0.5, 2.5),
    perched: false,
    dipped: new Set(),
    lookAt: 0,
    look: 0,
    phase: Math.random() * 10,
  };
}

/**
 * Mode 1: a formation passes high over the sea. Most come from beside or behind
 * the viewer (out of view) and fly off into the distance, climbing; some come
 * in from the distance and pass out of view beside the viewer.
 */
function flyBy(): Gull[] {
  const count = Math.floor(random(FLOCK.min, FLOCK.max + 0.99));
  const near = Math.random() < 0.5;
  for (let attempt = 0; attempt < 30; attempt++) {
    const distance = near ? random(110, 240) : random(320, 700);
    const altitude = 22 + distance * random(near ? 0.16 : 0.08, near ? 0.32 : 0.24);
    const closest = polar(view.bearing + random(-0.3, 0.3), distance, altitude);
    const heading = view.bearing + (Math.random() < 0.5 ? -1 : 1) * random(0.35, 0.8);
    const beside = along(closest, heading + Math.PI, 500, altitude - random(0, 12));
    const far = along(closest, heading, FAR, altitude + random(110, 220));
    if (Math.abs(wrap(bearingOf(beside) - view.bearing)) < 1) continue; // must begin out of view
    const curve = Math.random() < 0.7 ? path(beside, closest, far) : path(far, closest, beside);
    if (closestToEye(curve) < 60) continue;
    return flockPlaces(count).map((offset) =>
      newGull([
        { kind: "wait", duration: random(0, 0.6) },
        { kind: "fly", duration: curve.getLength() / CRUISE, curve, offset },
      ])
    );
  }
  return [];
}

/** Arrive from far off and high, gliding down a long, low final approach to a spot. */
function arrival(at: THREE.Vector3, bearing: number, finalLength: number, finalHeight: number) {
  const from = polar(bearing, FAR, random(170, 260));
  const final = along(at, headingFrom(from, at) + Math.PI, finalLength, finalHeight);
  return path(from, final, at);
}

/** Leave from a spot, climbing away into the distance. */
function departure(at: THREE.Vector3, bearing: number, climbHeight: number) {
  const to = polar(bearing, FAR, random(180, 280));
  const climb = along(at, headingFrom(at, to), 150, climbHeight);
  return path(at, climb, to);
}

/** Mode 2: land on the water, feed, leave. */
function feed(): Gull[] {
  const count = pick([1, 1, 2, 2, 3]);
  // Open water ahead, clear of the rocks.
  let spot = polar(view.bearing, 250, 0);
  for (let attempt = 0; attempt < 20; attempt++) {
    spot = polar(view.bearing + random(-0.3, 0.3), random(170, 340), 0);
    if (OBSTACLES.every((o) => Math.hypot(spot.x - o.x, spot.z - o.z) > o.radius + 30)) break;
  }
  const side = Math.random() < 0.5 ? -1 : 1;
  const inbound = view.bearing + side * random(0.15, 0.5);
  const outbound = view.bearing - side * random(0.1, 0.5);
  // A body length or more apart.
  const spots: THREE.Vector3[] = [];
  for (let attempt = 0; spots.length < count && attempt < 200; attempt++) {
    const candidate = spot.clone().add(new THREE.Vector3(random(-16, 16), 0, random(-16, 16)));
    if (spots.every((other) => other.distanceTo(candidate) > 9)) spots.push(candidate);
  }
  return spots.map((place, i) => {
    // Riding high, the belly a little under the surface.
    const at = place.clone().setY(BELLY * SCALE - 0.4);
    const approach = arrival(at, inbound + random(-0.05, 0.05), 130, 22);
    const leave = departure(at, outbound + random(-0.05, 0.05), 26);
    const stay = random(10, 18);
    const dips = Array.from({ length: Math.floor(random(2, 4.99)) }, () => random(2, stay - 2)).sort((a, z) => a - z);
    return newGull([
      { kind: "wait", duration: i * random(1.5, 3) },
      { kind: "land", duration: approach.getLength() / CRUISE, curve: approach },
      { kind: "float", duration: stay, at, dips },
      { kind: "takeoff", duration: SPREAD + leave.getLength() / CRUISE, curve: leave },
    ]);
  });
}

/** Mode 3: land on the rocks, rest, leave. */
function perch(points: THREE.Vector3[]): Gull[] {
  const count = Math.min(points.length, pick([1, 1, 2, 3]));
  const chosen = [...points].sort(() => Math.random() - 0.5).slice(0, count);
  const side = Math.random() < 0.5 ? -1 : 1;
  return chosen.map((point, i) => {
    const at = point.clone();
    at.y += FEET * SCALE; // standing on its feet
    const b = bearingOf(at);
    const approach = arrival(at, b + side * random(0.2, 0.5), 110, at.y + 14);
    const leave = departure(at, b - side * random(0.2, 0.6), at.y + 18);
    const stay = random(12, 22);
    return newGull([
      { kind: "wait", duration: i * random(1.5, 3) },
      { kind: "land", duration: approach.getLength() / CRUISE, curve: approach },
      { kind: "perch", duration: stay, at, dips: [] },
      { kind: "takeoff", duration: SPREAD + leave.getLength() / CRUISE, curve: leave },
    ]);
  });
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

/** How far along its path a gull is, as a fraction of the path's length. */
function progress(leg: Extract<Leg, { kind: "fly" | "land" | "takeoff" }>, t: number) {
  if (leg.kind === "fly") return Math.min(1, t / leg.duration);
  if (leg.kind === "land") {
    // Comes in at 1.6× cruising speed and touches down at 0.4×.
    const k = Math.min(1, t / leg.duration);
    return k * (1.6 - 0.6 * k);
  }
  // Takes off: wings spread first, then leaves at 0.4× and speeds up.
  if (t < SPREAD) return 0;
  const k = Math.min(1, (t - SPREAD) / (leg.duration - SPREAD));
  return k * (0.4 + 0.6 * k);
}

/** Flapping flight: spells of beating and gliding. */
function rhythm(gull: Gull, dt: number): Wings {
  gull.spell -= dt;
  if (gull.spell <= 0) {
    gull.gliding = !gull.gliding;
    gull.spell = gull.gliding ? random(1.5, 4) : random(1.2, 3);
  }
  return gull.gliding ? "glide" : "beat";
}

export default function Gulls({ rocks }: { rocks: THREE.Object3D[] }) {
  const { scene, animations } = useGLTF(URL, false);
  const groups = useRef<Array<THREE.Group | null>>([]);
  const mixers = useRef<THREE.AnimationMixer[]>([]);
  const actions = useRef<THREE.AnimationAction[]>([]);
  const materials = useRef<THREE.Material[][]>([]);
  const poses = useRef<Pose[]>([]);
  const gulls = useRef<Array<Gull | null>>(Array.from({ length: POOL }, () => null));
  const perches = useRef<THREE.Vector3[]>([]);
  const nextEpisodeAt = useRef(-1);
  const wasBusy = useRef(false);
  const scratch = useRef({
    point: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    back: new THREE.Vector3(),
    q: new THREE.Quaternion(),
  });

  // Each gull has its own materials, so it can fade into the distance on its own.
  const models = useMemo(
    () =>
      Array.from({ length: POOL }, () => {
        const clone = cloneSkeleton(scene) as THREE.Group;
        clone.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.frustumCulled = false;
          const material = (mesh.material as THREE.Material).clone();
          material.transparent = true;
          mesh.material = material;
        });
        return clone;
      }),
    [scene]
  );

  useEffect(() => {
    const clip = animations[0];
    mixers.current = models.map((model) => new THREE.AnimationMixer(model));
    actions.current = clip ? mixers.current.map((mixer) => mixer.clipAction(clip).play()) : [];
    materials.current = models.map((model) => {
      const list: THREE.Material[] = [];
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) list.push(mesh.material as THREE.Material);
      });
      return list;
    });
    poses.current = models.map((model) => {
      const find = (turns: Turn[]) => turns.map(([name]) => model.getObjectByName(name) ?? null);
      const legs = model.getObjectByName(LEGS) ?? null;
      if (legs) legs.userData.rest ??= legs.quaternion.clone();
      const fold = find(FOLD);
      const dip = find(DIP);
      const bones = [...new Set([...fold, ...dip].filter((bone): bone is THREE.Object3D => bone !== null))];
      return {
        fold,
        dip,
        legs,
        legsRest: legs?.userData.rest ?? new THREE.Quaternion(),
        bones,
        base: bones.map((bone) => bone.quaternion.clone()),
      };
    });
    return () => {
      mixers.current.forEach((mixer) => mixer.stopAllAction());
      materials.current.flat().forEach((material) => material.dispose());
    };
  }, [models, animations]);

  useEffect(() => {
    if (rocks.length > 0) perches.current = findPerches(rocks);
  }, [rocks]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const time = state.clock.elapsedTime;
    const s = scratch.current;
    // Out between sunrise and sunset, and not in rain, snow, storms or thick fog.
    const weather = getWeather();
    const sunUp =
      getFrameSnapshot().sunElev > 1 && weather.rain < 0.2 && weather.snow < 0.2 && weather.storm < 0.3 && weather.fog < 0.6;
    eye.set(state.camera.position.x, 0, state.camera.position.z);

    // One episode at a time, by day: the next may begin once the last is flying off.
    if (nextEpisodeAt.current < 0) nextEpisodeAt.current = time + (quickLife ? 1.5 : random(6, 12));
    const busy = gulls.current.some(
      (gull) => gull !== null && !(gull.leg === gull.legs.length - 1 && gull.t > gull.legs[gull.leg].duration * 0.35)
    );
    if (wasBusy.current && !busy) nextEpisodeAt.current = time + (quickLife ? 2 : random(12, 30));
    wasBusy.current = busy;
    if (!busy && time >= nextEpisodeAt.current && sunUp) {
      const free = gulls.current.flatMap((gull, i) => (gull ? [] : [i]));
      // Perching only when the rocks are in view, or turning into it.
      const visiblePerches = perches.current.filter((p) => {
        const ahead = wrap(bearingOf(p) - view.bearing);
        return ahead * view.turning > -0.5 && Math.abs(ahead) < 1.3;
      });
      const roll = Math.random();
      const mode = roll < 0.45 ? "fly" : roll < 0.72 || visiblePerches.length === 0 ? "feed" : "perch";
      // A whole flock or none: wait while the last one is still flying off.
      if (free.length < (mode === "fly" ? FLOCK.max : 3)) {
        nextEpisodeAt.current = time + 2;
      } else {
        const episode = mode === "fly" ? flyBy() : mode === "feed" ? feed() : perch(visiblePerches);
        episode.forEach((gull, i) => (gulls.current[free[i]] = gull));
        if (episode.length > 0) wasBusy.current = true;
      }
    }

    gulls.current.forEach((gull, i) => {
      const group = groups.current[i];
      const mixer = mixers.current[i];
      const action = actions.current[i];
      if (!group || !mixer || !action) return;
      if (!gull) {
        group.visible = false;
        return;
      }

      let leg = gull.legs[gull.leg];
      gull.t += dt;
      while (leg && gull.t >= leg.duration) {
        gull.t -= leg.duration;
        const done = leg;
        gull.leg += 1;
        gull.dipped.clear();
        leg = gull.legs[gull.leg];
        // Touching down on the water, and leaving it: a ripple.
        if (done.kind === "land" && leg?.kind === "float") waterFx.ripple(leg.at.x, leg.at.z, 4, 0.6);
        if (done.kind === "float") waterFx.ripple(done.at.x, done.at.z, 4, 0.7);
        if (leg?.kind === "perch") gull.perched = true;
      }
      if (!leg) {
        gulls.current[i] = null;
        group.visible = false;
        return;
      }
      if (leg.kind === "wait") {
        group.visible = false;
        return;
      }
      group.visible = true;

      let wings: Wings = "beat";
      let targetPitch = 0;
      let targetLegs = 0;
      let targetDip = 0;
      let turning = 0;

      if (leg.kind === "fly" || leg.kind === "land" || leg.kind === "takeoff") {
        const u = progress(leg, gull.t);
        leg.curve.getPointAt(u, s.point);
        leg.curve.getTangentAt(THREE.MathUtils.clamp(u, 0.001, 0.999), s.tangent);
        const heading = Math.atan2(s.tangent.x, -s.tangent.z);
        if (!gull.started) {
          gull.heading = heading;
          gull.started = true;
        }
        turning = wrap(heading - gull.heading) / Math.max(dt, 1e-3);
        gull.heading = heading;
        targetPitch = THREE.MathUtils.clamp(Math.atan2(s.tangent.y, Math.hypot(s.tangent.x, s.tangent.z)), -0.3, 0.3);
        if (leg.kind === "fly" && leg.offset) {
          // Hold a place in the flock (right, behind and above the leader's path), drifting a little.
          s.right.set(Math.cos(heading), 0, Math.sin(heading));
          s.back.set(-Math.sin(heading), 0, Math.cos(heading));
          s.point.addScaledVector(s.right, leg.offset.x + Math.sin(time * 0.45 + gull.phase) * 3);
          s.point.addScaledVector(s.back, leg.offset.z + Math.sin(time * 0.31 + gull.phase * 1.7) * 4);
          s.point.y += leg.offset.y + Math.sin(time * 0.6 + gull.phase * 2.3) * 1.5;
        }
        group.position.copy(s.point);

        const k = gull.t / leg.duration;
        if (leg.kind === "fly") {
          wings = rhythm(gull, dt);
        } else if (leg.kind === "land") {
          // A long glide in, a few braking beats with the legs down, a flare, touch down.
          wings = k < 0.8 ? "glide" : k < 0.96 ? "beat" : "glide";
          targetLegs = THREE.MathUtils.smoothstep(k, 0.72, 0.9);
          if (k > 0.86) targetPitch = 0.35 * Math.min(1, (k - 0.86) / 0.1);
        } else {
          // Spread the wings (still standing), then strong beats as it lifts off,
          // the legs tucked once clear, then the usual rhythm.
          const flying = gull.t - SPREAD;
          wings = flying < 0 ? "glide" : flying < 2.5 ? "strong" : rhythm(gull, dt);
          targetLegs = gull.perched && flying < 0.6 ? 1 : 0;
          if (flying < 1.5) targetPitch = Math.max(targetPitch, 0.2);
        }
      } else {
        // Floating or perched: wings folded, bobbing on the water or still on the rock.
        const rest = leg as Extract<Leg, { kind: "float" | "perch" }>;
        wings = "rest";
        targetLegs = rest.kind === "perch" ? 1 : 0;
        group.position.copy(rest.at);
        if (rest.kind === "float") group.position.y = rest.at.y + Math.sin(time * 1.4 + gull.phase) * 0.15;
        // Looking around now and then.
        if (time >= gull.lookAt) {
          gull.lookAt = time + random(1.5, 3.5);
          gull.look = gull.heading + random(-0.7, 0.7);
        }
        gull.heading += wrap(gull.look - gull.heading) * Math.min(1, dt * 1.5);
        // Feeding: the head and neck go under for a moment, the body tipping forward a little.
        for (const at of rest.dips) {
          const into = gull.t - at;
          if (into >= 0 && into < 1.3) {
            const down = Math.sin((into / 1.3) * Math.PI);
            targetDip = Math.min(1, down * 1.6);
            targetPitch = -0.3 * down;
            group.position.y -= 0.25 * down;
            if (!gull.dipped.has(at)) {
              gull.dipped.add(at);
              waterFx.ripple(rest.at.x + Math.sin(gull.heading) * 2, rest.at.z - Math.cos(gull.heading) * 2, 3, 0.6);
            }
          }
        }
      }

      // Lean into turns (a positive bank lowers the right wing, and a right turn
      // raises the heading); ease the pitch, the wings, the legs and the head.
      gull.bank += (THREE.MathUtils.clamp(turning * 0.6, -MAX_BANK, MAX_BANK) - gull.bank) * Math.min(1, dt * 2.5);
      gull.pitch += (THREE.MathUtils.clamp(targetPitch, -MAX_PITCH, MAX_PITCH) - gull.pitch) * Math.min(1, dt * 3);
      gull.fold += ((wings === "rest" && gull.holding ? 1 : 0) - gull.fold) * Math.min(1, dt * 4);
      gull.legsDown += (targetLegs - gull.legsDown) * Math.min(1, dt * 4);
      gull.dip += (targetDip - gull.dip) * Math.min(1, dt * 8);
      group.rotation.set(-gull.pitch, Math.PI - gull.heading, gull.bank * (1 - gull.fold));

      // The wingbeat. Beating speeds up and slows down smoothly; gliding or
      // folding waits for the wings to come level, then holds them there.
      const pose = poses.current[i];
      if (pose) pose.bones.forEach((bone, j) => bone.quaternion.copy(pose.base[j]));
      if (wings === "beat" || wings === "strong") {
        gull.holding = false;
        gull.rate += ((wings === "strong" ? STRONG_BEAT : BEAT) - gull.rate) * Math.min(1, dt * 3);
        mixer.update(dt * gull.rate);
      } else if (!gull.holding) {
        const length = action.getClip().duration;
        const step = dt * Math.max(gull.rate, BEAT * 0.6);
        const ahead = (((GLIDE_TIME - action.time) % length) + length) % length;
        if (ahead <= step) {
          action.time = GLIDE_TIME;
          gull.holding = true;
          gull.rate = 0;
          mixer.update(0);
        } else {
          mixer.update(step);
        }
      } else {
        mixer.update(0);
      }
      if (pose) {
        pose.bones.forEach((bone, j) => pose.base[j].copy(bone.quaternion));
        applyTurns(pose.fold, FOLD, gull.fold, s.q);
        applyTurns(pose.dip, DIP, gull.dip, s.q);
        if (pose.legs) {
          const angle = THREE.MathUtils.lerp(LEGS_TUCKED, LEGS_DOWN, gull.legsDown);
          pose.legs.quaternion.copy(pose.legsRest).multiply(s.q.setFromAxisAngle(AXES.z, angle));
        }
      }

      // Far out, the gull fades into the haze.
      const distance = Math.hypot(group.position.x - eye.x, group.position.z - eye.z);
      const opacity = 1 - THREE.MathUtils.smoothstep(distance, FADE_FROM, FAR * 0.97);
      for (const material of materials.current[i] ?? []) material.opacity = opacity;
    });
  });

  return (
    <>
      {models.map((model, i) => (
        <group
          key={i}
          ref={(group) => {
            groups.current[i] = group;
            if (group) group.rotation.order = "YXZ";
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
