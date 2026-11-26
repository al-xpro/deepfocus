"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getSceneDate, sceneParams } from "./sceneParams";
import { getSceneSnapshot, vecFromSpherical } from "./timeUtils";
import { motionPrefs } from "./motionPrefs";

interface EncounterSet {
  dolphinSeedA: number;
  dolphinSeedB: number;
  dolphinSeedC: number;
}

interface MaterialTuning {
  envMapIntensity: number;
  roughness?: number;
  metalness?: number;
  colorBoost?: number;
  emissiveBoost?: number;
  /** Multiplies the base color: shifts a model's palette (the volcano's pink to basalt). */
  tint?: string;
}

interface ObstacleArea {
  position: THREE.Vector3;
  radius: number;
}

interface DolphinMotionConfig {
  radiusRange: [number, number];
  angleRange: [number, number];
  speedRange: [number, number];
  targetInterval: [number, number];
  avoidanceRadius: number;
  socialDistance: number;
  turnSpeed: number;
  bankFactor: number;
  swayAmount: number;
  swaySpeed: number;
  animationSpeedRange: [number, number];
  actionInterval: [number, number];
  maxAcceleration: number;
  headingDamping: number;
  cruiseDepthRange: [number, number];
  approachDepthRange: [number, number];
}

type DolphinPhase = "cruise" | "surface_approach" | "airborne" | "dive_recovery";

interface DolphinMotionState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  target: THREE.Vector3;
  viaPoint: THREE.Vector3;
  usingViaPoint: boolean;
  speed: number;
  retargetAt: number;
  actionAt: number;
  actionStyle: number;
  actionDuration: number;
  heading: number;
  headingOmega: number;
  phase: DolphinPhase;
  phaseEnteredAt: number;
  launchAt: number;
  jumpHeading: number;
  jumpVelocity: THREE.Vector3;
  renderDepth: number;
  cruiseDepth: number;
  approachDepth: number;
  launchDepth: number;
  diveMidDepth: number;
  diveTargetDepth: number;
  diveDuration: number;
  exitPitch: number;
  exitRoll: number;
  sequenceRemaining: number;
  podCooldownUntil: number;
  // NUOVO: Variabili per bloccare la coreografia della gara
  isRacing: boolean;
  raceLeaderId: string | null;
  raceHeading: number;
  raceSpeed: number;
  raceLane: number; // 0 per il leader, 1 per corsia destra, -1 per sinistra
}

interface SurfaceAction {
  lift: number;
  pitch: number;
  roll: number;
  yaw: number;
}

interface PodAnnouncement {
  leaderId: string;
  issuedAt: number;
  expiresAt: number;
  jumpCount: number;
  participantGoal: number;
  joinedIds: string[];
  position: THREE.Vector3;
  heading: number;
  raceSpeed: number;
  scheduledLaunchAt: number;
  isRacing: boolean;
}

const DOLPHIN_ANIM = {
  CLASSIC_LEAP: 0,
  ARCING_LEAP: 1,
  SIDE_FLIP: 2,
  FRONT_FLIP: 3,
  BACK_FLIP: 4,
  TWIST_FLIP: 5,
} as const;

const DOLPHIN_ANIM_COUNT = 6;
const DOLPHIN_ANIM_DURATION: readonly number[] = [1.72, 1.95, 1.5, 1.82, 1.9, 1.86];

const WATER_SURFACE_Y = 0;
// Probabilità molto alte per testare facilmente la gara
const POD_TRIGGER_CHANCE = 0.95;
const POD_JOIN_WINDOW = 5.0;
const POD_JOIN_DISTANCE = 2500;
const POD_COOLDOWN = 24;
const DIVE_DURATION_RANGE: [number, number] = [1.15, 1.55];

// FIX: Ripristinato a Math.PI, così il muso punta nella giusta direzione
const MODEL_HEADING_OFFSET = Math.PI / 2;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number) {
  return a + shortAngleDiff(a, b) * t;
}

function frontArcPosition(radius: number, angleDeg: number, y: number) {
  const theta = THREE.MathUtils.degToRad(angleDeg);
  return new THREE.Vector3(Math.sin(theta) * radius, y, -Math.cos(theta) * radius);
}

function createSeededRandom(seed: number) {
  let t = seed >>> 0 || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomRange(random: () => number, min: number, max: number) {
  return lerp(min, max, random());
}

function randomIndex(random: () => number, max: number) {
  return Math.floor(random() * max);
}

function getAnimationDuration(durations: readonly number[], index: number, fallback: number) {
  return durations[index] ?? fallback;
}

function horizontalDistance(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function smootherstep(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

function shortAngleDiff(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function quadraticBezier(a: number, b: number, c: number, t: number) {
  const i = 1 - t;
  return i * i * a + 2 * i * t * b + t * t * c;
}

function chooseViaPoint(
  random: () => number,
  from: THREE.Vector3,
  to: THREE.Vector3
): THREE.Vector3 {
  const t = 0.35 + random() * 0.3;
  const mid = from.clone().lerp(to, t);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) + 0.001;
  const sign = random() > 0.5 ? 1 : -1;
  const curve = sign * len * (0.18 + random() * 0.22);

  return new THREE.Vector3(mid.x + (-dz / len) * curve, 0, mid.z + (dx / len) * curve);
}

function chooseSoloJumpCount(random: () => number) {
  const roll = random();
  if (roll < 0.5) return 1;
  if (roll < 0.78) return 2;
  if (roll < 0.94) return 3;
  return 4;
}

function choosePodJumpCount(random: () => number) {
  return random() < 0.52 ? 3 : 4;
}

function choosePodParticipantGoal(random: () => number) {
  return random() < 0.58 ? 2 : 3;
}

function getRandomValues(count: number) {
  const values = new Uint32Array(count);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(values);
    return values;
  }
  for (let i = 0; i < count; i += 1) values[i] = ((i + 1) * 2_654_435_761) >>> 0;
  return values;
}

function createEncounterSet(): EncounterSet {
  const values = getRandomValues(3);
  return {
    dolphinSeedA: values[0],
    dolphinSeedB: values[1],
    dolphinSeedC: values[2],
  };
}

function useAnimatedClonedModel(url: string, tuning: MaterialTuning) {
  const { scene, animations } = useGLTF(url, false);
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene) as THREE.Group;
    enhanceModelMaterials(clone, tuning);
    return clone;
  }, [scene, tuning]);

  return { model, animations };
}

function enhanceModelMaterials(model: THREE.Object3D, tuning: MaterialTuning) {
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materials = sourceMaterials.map((material) => material?.clone());
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];

    for (const material of materials) {
      if (!material) continue;
      if ("map" in material && material.map) {
        const colorMap = material.map as THREE.Texture;
        colorMap.colorSpace = THREE.SRGBColorSpace;
        colorMap.needsUpdate = true;
      }
      if ("emissiveMap" in material && material.emissiveMap) {
        const emissiveMap = material.emissiveMap as THREE.Texture;
        emissiveMap.colorSpace = THREE.SRGBColorSpace;
        emissiveMap.needsUpdate = true;
      }
      if ("envMapIntensity" in material) material.envMapIntensity = tuning.envMapIntensity;
      if ("roughness" in material && tuning.roughness !== undefined)
        material.roughness = tuning.roughness;
      if ("metalness" in material && tuning.metalness !== undefined)
        material.metalness = tuning.metalness;
      if ("color" in material && tuning.colorBoost !== undefined) {
        (material as THREE.MeshStandardMaterial).color.multiplyScalar(tuning.colorBoost);
      }
      if ("color" in material && tuning.tint !== undefined) {
        (material as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(tuning.tint));
      }
      if ("emissive" in material && tuning.emissiveBoost !== undefined) {
        (material as THREE.MeshStandardMaterial).emissive.multiplyScalar(tuning.emissiveBoost);
      }
      if ("needsUpdate" in material) material.needsUpdate = true;
    }
  });
}

function useClipPlayback(
  model: THREE.Object3D,
  animations: THREE.AnimationClip[],
  seed: number,
  speedRange: [number, number]
) {
  const playbackRandom = useMemo(() => createSeededRandom(seed ^ 0x9e3779b9), [seed]);
  const { actions } = useAnimations(animations, model);

  useEffect(() => {
    const clip = animations[0];
    if (!clip) return;

    const action = actions[clip.name];
    if (!action) return;

    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.getMixer().setTime(playbackRandom() * clip.duration);
    action.setEffectiveTimeScale(randomRange(playbackRandom, speedRange[0], speedRange[1]));
    action.fadeIn(0.35);
    action.play();

    return () => {
      action.fadeOut(0.2);
      action.stop();
    };
  }, [actions, animations, playbackRandom, speedRange]);
}

const CREATURE_TUNING: MaterialTuning = {
  envMapIntensity: 1.7,
  roughness: 0.62,
  metalness: 0.02,
  colorBoost: 3.1,
  emissiveBoost: 1.01,
};
// Within real ranges: roughness 0–1, gentle color lifts. The scanned rocks carry
// their color in the vertices (scripts/optimize-models.mjs).
const PROMONTORY_TUNING: MaterialTuning = {
  envMapIntensity: 1.1,
  roughness: 0.92,
  metalness: 0,
  colorBoost: 1.15,
};

const ROCK_REEF_TUNING: MaterialTuning = {
  envMapIntensity: 1.1,
  roughness: 0.95,
  metalness: 0,
  colorBoost: 1.1,
};

const CLIFF_TUNING: MaterialTuning = {
  envMapIntensity: 1.1,
  roughness: 0.9,
  metalness: 0,
  colorBoost: 1.25,
};

const SEA_STACK_TUNING: MaterialTuning = {
  envMapIntensity: 1.1,
  roughness: 0.88,
  metalness: 0,
  colorBoost: 1.3,
};

const VOLCANO_TUNING: MaterialTuning = {
  envMapIntensity: 1,
  roughness: 0.95,
  metalness: 0,
  colorBoost: 1.1,
  tint: "#8fa384",
};

/**
 * Where the landscape sits around the camera. `frontArcPosition`: 0° is straight
 * ahead of the starting view, 90° to the right. `halfExtent` is half the model's
 * widest horizontal size at scale 1 (measured), so the dolphins' obstacles come
 * from the real footprint.
 */
interface Placement {
  url: string;
  tuning: MaterialTuning;
  radius: number;
  angle: number;
  y: number;
  scale: number;
  rotationY: number;
  halfExtent: number;
}

const PLACEMENTS = {
  promontory: { url: "/models/promontory.glb", tuning: PROMONTORY_TUNING, radius: 2000, angle: 20, y: -14, scale: 2, rotationY: -0.2, halfExtent: 190 },
  reef: { url: "/models/rock_reef.glb", tuning: ROCK_REEF_TUNING, radius: 900, angle: 150, y: -3, scale: 1, rotationY: 1, halfExtent: 175 },
  cliffRock: { url: "/models/cliff_rock.glb", tuning: CLIFF_TUNING, radius: 200, angle: 200, y: -2, scale: 1, rotationY: 0, halfExtent: 12 },
  seaStacks: { url: "/models/group_of_cliff_1.glb", tuning: SEA_STACK_TUNING, radius: 170, angle: 210, y: 0, scale: 0.01, rotationY: 0, halfExtent: 1200 },
  seaStacksSmall: { url: "/models/group_of_cliff_2.glb", tuning: SEA_STACK_TUNING, radius: 230, angle: 180, y: 0, scale: 0.01, rotationY: 1, halfExtent: 1370 },
  // A Hawaiian shield volcano: wide and low, far out on the horizon.
  volcano: { url: "/models/volcano.glb", tuning: VOLCANO_TUNING, radius: 3200, angle: 275, y: -2, scale: 14, rotationY: 0.6, halfExtent: 50 },
} satisfies Record<string, Placement>;

/** Room the dolphins keep around a model's footprint. */
const OBSTACLE_MARGIN = 40;

const CREATURE_OBSTACLES: ObstacleArea[] = Object.values(PLACEMENTS).map((placement) => ({
  position: frontArcPosition(placement.radius, placement.angle, placement.y),
  radius: placement.halfExtent * placement.scale + OBSTACLE_MARGIN,
}));

const DOLPHIN_MOTION: DolphinMotionConfig = {
  radiusRange: [120, 2_000],
  angleRange: [12, 348],
  speedRange: [28, 46],
  targetInterval: [4.5, 9.5],
  avoidanceRadius: 260,
  socialDistance: 65,
  turnSpeed: 3.4,
  bankFactor: 0.012,
  swayAmount: 0.1,
  swaySpeed: 1.65,
  animationSpeedRange: [0.96, 1.18],
  actionInterval: [4.8, 11.5],
  maxAcceleration: 190,
  headingDamping: 0.1,
  cruiseDepthRange: [-8.8, -5.2],
  approachDepthRange: [-5.8, -5.7],
};

function chooseCreatureTarget(random: () => number, config: DolphinMotionConfig) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const angle = randomRange(random, config.angleRange[0], config.angleRange[1]);
    const radius = randomRange(random, config.radiusRange[0], config.radiusRange[1]);
    const position = frontArcPosition(radius, angle, 0);
    const nearObstacle = CREATURE_OBSTACLES.some((obstacle) => {
      return (
        horizontalDistance(position, obstacle.position) < obstacle.radius + config.avoidanceRadius
      );
    });

    if (!nearObstacle) return position;
  }

  return frontArcPosition(
    (config.radiusRange[0] + config.radiusRange[1]) * 0.5,
    (config.angleRange[0] + config.angleRange[1]) * 0.5,
    0
  );
}

function nearestObstacleDistance(position: THREE.Vector3) {
  let min = Infinity;
  for (const obstacle of CREATURE_OBSTACLES) {
    min = Math.min(min, horizontalDistance(position, obstacle.position));
  }
  return min;
}

function createDolphinMotionState(
  random: () => number,
  config: DolphinMotionConfig
): DolphinMotionState {
  const position = chooseCreatureTarget(random, config);
  position.y = 0;

  const target = chooseCreatureTarget(random, config);
  target.y = 0;

  const viaPoint = chooseViaPoint(random, position, target);
  const speed = randomRange(random, config.speedRange[0], config.speedRange[1]);
  const velocity = viaPoint.clone().sub(position).normalize().multiplyScalar(speed);
  const heading = Math.atan2(velocity.x, -velocity.z);
  const cruiseDepth = randomRange(random, config.cruiseDepthRange[0], config.cruiseDepthRange[1]);
  const approachDepth = randomRange(
    random,
    config.approachDepthRange[0],
    config.approachDepthRange[1]
  );
  const actionStyle = randomIndex(random, DOLPHIN_ANIM_COUNT);

  return {
    position,
    velocity,
    target,
    viaPoint,
    usingViaPoint: true,
    speed,
    retargetAt: randomRange(random, config.targetInterval[0], config.targetInterval[1]),
    actionAt: randomRange(random, config.actionInterval[0], config.actionInterval[1]),
    actionStyle,
    actionDuration: getAnimationDuration(DOLPHIN_ANIM_DURATION, actionStyle, 1.8),
    heading,
    headingOmega: 0,
    phase: "cruise",
    phaseEnteredAt: 0,
    launchAt: 0,
    jumpHeading: heading,
    jumpVelocity: velocity.clone(),
    renderDepth: cruiseDepth,
    cruiseDepth,
    approachDepth,
    launchDepth: approachDepth,
    diveMidDepth: cruiseDepth,
    diveTargetDepth: cruiseDepth,
    diveDuration: DIVE_DURATION_RANGE[0],
    exitPitch: 0,
    exitRoll: 0,
    sequenceRemaining: 0,
    podCooldownUntil: 0,
    isRacing: false,
    raceLeaderId: null,
    raceHeading: 0,
    raceSpeed: 0,
    raceLane: 0,
  };
}

function configureNextJump(
  motion: DolphinMotionState,
  random: () => number,
  config: DolphinMotionConfig,
  elapsed: number,
  launchDelay: number
) {
  // APPROCCIO RADICALE: In gara usano SOLO il salto ad arco, per tutti uguale
  if (motion.isRacing) {
    motion.actionStyle = DOLPHIN_ANIM.ARCING_LEAP;
  } else {
    motion.actionStyle = randomIndex(random, DOLPHIN_ANIM_COUNT);
  }

  motion.actionDuration = getAnimationDuration(DOLPHIN_ANIM_DURATION, motion.actionStyle, 1.8);
  motion.approachDepth = randomRange(
    random,
    config.approachDepthRange[0],
    config.approachDepthRange[1]
  );
  motion.launchDepth = motion.approachDepth;
  motion.phase = "surface_approach";
  motion.phaseEnteredAt = elapsed;
  motion.launchAt = elapsed + launchDelay;
}

function startJumpSequence(
  motion: DolphinMotionState,
  random: () => number,
  config: DolphinMotionConfig,
  elapsed: number,
  jumpCount: number,
  launchDelay: number
) {
  motion.sequenceRemaining = jumpCount - 1;
  motion.headingOmega *= 0.18;
  configureNextJump(motion, random, config, elapsed, launchDelay);
}

function beginDiveRecovery(motion: DolphinMotionState, random: () => number, elapsed: number) {
  const exitAction = getDolphinAction(motion.actionStyle, 1);
  motion.phase = "dive_recovery";
  motion.phaseEnteredAt = elapsed;
  // Per la gara usiamo una durata fissa e identica per tutti
  motion.diveDuration = motion.isRacing
    ? 1.4
    : randomRange(random, DIVE_DURATION_RANGE[0], DIVE_DURATION_RANGE[1]);
  motion.exitPitch = normalizeAngle(exitAction.pitch);
  motion.exitRoll = normalizeAngle(exitAction.roll);
  motion.diveTargetDepth =
    motion.sequenceRemaining > 0 ? randomRange(random, -5.2, -4.2) : motion.cruiseDepth;
  motion.diveMidDepth =
    motion.sequenceRemaining > 0
      ? Math.min(motion.diveTargetDepth - 2.2, -8.2)
      : Math.min(motion.diveTargetDepth - 2.8, -10.4);
  motion.renderDepth = motion.launchDepth;
}

function commitSharedPosition(
  sharedPositionsRef: MutableRefObject<Record<string, THREE.Vector3>>,
  id: string,
  position: THREE.Vector3,
  depth: number
) {
  const registered = sharedPositionsRef.current[id] ?? new THREE.Vector3();
  registered.set(position.x, WATER_SURFACE_Y + depth, position.z);
  sharedPositionsRef.current[id] = registered;
}

function getDolphinAction(style: number, t: number): SurfaceAction {
  const p = smootherstep(t);
  const arc = Math.sin(p * Math.PI);
  const spin = smootherstep(THREE.MathUtils.clamp((t - 0.12) / 0.76, 0, 1));

  switch (style) {
    case DOLPHIN_ANIM.CLASSIC_LEAP:
      return { lift: arc * 15.5, pitch: -lerp(0.62, -0.48, p), roll: 0, yaw: 0 };
    case DOLPHIN_ANIM.ARCING_LEAP:
      return {
        lift: arc * 18.4,
        pitch: -lerp(0.78, -0.58, p),
        roll: Math.sin(p * Math.PI) * 0.12,
        yaw: 0,
      };
    case DOLPHIN_ANIM.SIDE_FLIP:
      return {
        lift: arc * 13,
        pitch: -lerp(0.38, -0.26, p),
        roll: Math.sin(p * Math.PI) * 1.28,
        yaw: 0,
      };
    case DOLPHIN_ANIM.FRONT_FLIP:
      return {
        lift: arc * 17.1,
        pitch: -(lerp(0.4, -0.22, p) - spin * Math.PI * 2),
        roll: Math.sin(p * Math.PI) * 0.14,
        yaw: 0,
      };
    case DOLPHIN_ANIM.BACK_FLIP:
      return {
        lift: arc * 18.1,
        pitch: -(lerp(0.6, -0.18, p) + spin * Math.PI * 2),
        roll: Math.sin(p * Math.PI) * 0.1,
        yaw: 0,
      };
    case DOLPHIN_ANIM.TWIST_FLIP:
    default:
      return {
        lift: arc * 17.6,
        pitch: -(lerp(0.52, -0.2, p) + spin * Math.PI * 1.7),
        roll: Math.sin(spin * Math.PI) * Math.PI * 0.88,
        yaw: 0,
      };
  }
}

function EncounterLightRig() {
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const glareLightRef = useRef<THREE.DirectionalLight>(null);
  const fillLightRef = useRef<THREE.DirectionalLight>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const _sunVector = useRef(new THREE.Vector3());
  const _moonVector = useRef(new THREE.Vector3());
  const _glareOffset = useRef(new THREE.Vector3());

  useFrame(() => {
    if (
      !sunLightRef.current ||
      !glareLightRef.current ||
      !fillLightRef.current ||
      !moonLightRef.current ||
      !hemiLightRef.current ||
      !ambientLightRef.current ||
      !targetRef.current
    )
      return;

    const scene = getSceneSnapshot(getSceneDate(), sceneParams.location);

    vecFromSpherical(Math.max(scene.sunElev, 4), scene.sunAz, _sunVector.current);
    sunLightRef.current.position.copy(_sunVector.current).multiplyScalar(360);
    sunLightRef.current.target = targetRef.current;
    sunLightRef.current.color.setHex(scene.lightColorHex);
    sunLightRef.current.intensity = THREE.MathUtils.lerp(0.26, 1.95, 1 - scene.nightFactor);

    _glareOffset.current.set(120, 58, 190);
    glareLightRef.current.position
      .copy(_sunVector.current)
      .multiplyScalar(280)
      .add(_glareOffset.current);
    glareLightRef.current.target = targetRef.current;
    glareLightRef.current.color.setHex(scene.sunColorHex);
    glareLightRef.current.intensity = THREE.MathUtils.lerp(0.05, 0.94, 1 - scene.nightFactor);

    fillLightRef.current.position.set(220, 145, 260);
    fillLightRef.current.target = targetRef.current;
    fillLightRef.current.color.setHex(scene.lightColorHex);
    fillLightRef.current.intensity = THREE.MathUtils.lerp(0.18, 0.92, 1 - scene.nightFactor);

    vecFromSpherical(Math.max(scene.moonElev, 6), scene.moonAz, _moonVector.current);
    moonLightRef.current.position.copy(_moonVector.current).multiplyScalar(340);
    moonLightRef.current.target = targetRef.current;
    moonLightRef.current.color.setHex(0xbfd6ff);
    moonLightRef.current.intensity = THREE.MathUtils.lerp(0.06, 0.46, scene.nightFactor);

    hemiLightRef.current.intensity = THREE.MathUtils.lerp(0.24, 0.54, 1 - scene.nightFactor * 0.5);
    hemiLightRef.current.color.setHex(0xe1ecff);
    hemiLightRef.current.groundColor.setHex(0x092236);

    ambientLightRef.current.color.setHex(scene.lightColorHex);
    ambientLightRef.current.intensity = THREE.MathUtils.lerp(
      0.12,
      0.34,
      1 - scene.nightFactor * 0.4
    );
  });

  return (
    <>
      <object3D ref={targetRef} position={[0, 8, -110]} />
      <directionalLight ref={sunLightRef} intensity={1} color="#f7fbff" />
      <directionalLight ref={glareLightRef} intensity={0.7} color="#ffd0a4" />
      <directionalLight ref={fillLightRef} intensity={0.4} color="#e6efff" />
      <directionalLight ref={moonLightRef} intensity={0.4} color="#bfd6ff" />
      <hemisphereLight ref={hemiLightRef} intensity={0.45} color="#e1ecff" groundColor="#092236" />
      <ambientLight ref={ambientLightRef} intensity={0.2} color="#edf4ff" />
    </>
  );
}

function Landmark({ placement, children }: { placement: Placement; children?: ReactNode }) {
  const { model } = useAnimatedClonedModel(placement.url, placement.tuning);
  const position = useMemo(
    () => frontArcPosition(placement.radius, placement.angle, placement.y),
    [placement]
  );
  return (
    <group position={position}>
      <group scale={placement.scale} rotation={[0, placement.rotationY, 0]}>
        <primitive object={model} />
      </group>
      {children}
    </group>
  );
}

/** A soft, round cloud texture, drawn once. */
function createCloudTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    // A shaded base, like a real cloud: white on top, grey-blue underneath.
    ctx.globalCompositeOperation = "source-atop";
    const shade = ctx.createLinearGradient(0, 0, 0, size);
    shade.addColorStop(0.35, "#ffffff");
    shade.addColorStop(1, "#9aa6b4");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const WHITE = new THREE.Color(0xffffff);

const CLOUD_PUFFS = [
  { x: 0, y: 0, z: 0, w: 620, h: 170, phase: 0 },
  { x: -230, y: -25, z: 60, w: 420, h: 120, phase: 1.7 },
  { x: 250, y: -15, z: -40, w: 460, h: 130, phase: 3.1 },
  { x: 60, y: 45, z: 20, w: 360, h: 110, phase: 4.4 },
];

/**
 * A dormant volcano's cloud cap: a few soft puffs resting on the summit,
 * drifting slowly, lit by the scene's light (dim at night). The weather can
 * thicken it in v1.3.
 */
function CloudCap({ height }: { height: number }) {
  const texture = useMemo(() => createCloudTexture(), []);
  const materials = useMemo(
    () =>
      CLOUD_PUFFS.map(
        () =>
          new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.6, fog: true })
      ),
    [texture]
  );
  const sprites = useRef<Array<THREE.Sprite | null>>([]);
  const lastTone = useRef(-1);
  const color = useRef(new THREE.Color());

  useEffect(
    () => () => {
      texture.dispose();
      materials.forEach((material) => material.dispose());
    },
    [texture, materials]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    CLOUD_PUFFS.forEach((puff, i) => {
      const sprite = sprites.current[i];
      if (sprite) sprite.position.x = puff.x + Math.sin(t * 0.03 + puff.phase) * 40;
    });
    // The light changes slowly: recolor twice a second, not every frame.
    if (t - lastTone.current < 0.5) return;
    lastTone.current = t;
    // Normalized against the exposure, so the cloud reads as soft white by day,
    // and dimmed with the sun: a bright cloud over a volcano in a dark sky reads
    // as a glow.
    const scene = getSceneSnapshot(getSceneDate());
    const daylight = THREE.MathUtils.smoothstep(scene.sunElev, -2, 15);
    const brightness = (1.6 / Math.max(scene.exposure, 0.05)) * Math.max(daylight, 0.06);
    color.current.setHex(scene.lightColorHex).lerp(WHITE, 0.5).multiplyScalar(brightness);
    for (const sprite of sprites.current) {
      if (!sprite) continue;
      sprite.material.color.copy(color.current);
      sprite.material.opacity = 0.6 - 0.3 * scene.nightFactor;
    }
  });

  return (
    <group position={[0, height, 0]}>
      {CLOUD_PUFFS.map((puff, i) => (
        <sprite
          key={i}
          ref={(sprite) => {
            sprites.current[i] = sprite;
          }}
          material={materials[i]}
          position={[puff.x, puff.y, puff.z]}
          scale={[puff.w, puff.h, 1]}
        />
      ))}
    </group>
  );
}

function DolphinEncounter({
  id,
  seed,
  scale,
  sharedPositionsRef,
  podRef,
}: {
  id: string;
  seed: number;
  scale: number;
  sharedPositionsRef: MutableRefObject<Record<string, THREE.Vector3>>;
  podRef: MutableRefObject<PodAnnouncement | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { model, animations } = useAnimatedClonedModel("/models/dolphin.glb", CREATURE_TUNING);
  const random = useMemo(() => createSeededRandom(seed), [seed]);
  const initialMotion = useMemo(() => createDolphinMotionState(random, DOLPHIN_MOTION), [random]);
  const motionRef = useRef<DolphinMotionState>(initialMotion);

  const desiredVelRef = useRef(new THREE.Vector3());
  const steeringRef = useRef(new THREE.Vector3());
  const avoidanceRef = useRef(new THREE.Vector3());
  const awayRef = useRef(new THREE.Vector3());
  const jumpDirRef = useRef(new THREE.Vector3());
  const raceForwardRef = useRef(new THREE.Vector3());
  const raceRightRef = useRef(new THREE.Vector3());
  const raceTargetRef = useRef(new THREE.Vector3());
  const dayVisibilityRef = useRef(true);

  useClipPlayback(model, animations, seed, DOLPHIN_MOTION.animationSpeedRange);

  useEffect(() => {
    const sharedPositions = sharedPositionsRef.current;
    if (groupRef.current) groupRef.current.rotation.order = "YXZ";
    return () => {
      delete sharedPositions[id];
    };
  }, [id, sharedPositionsRef]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const group = groupRef.current;
    const motion = motionRef.current;
    const elapsed = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    const sceneDate = getSceneDate();
    const encounterHour = sceneDate.getHours() + sceneDate.getMinutes() / 60;
    const encounterActive = encounterHour >= 5 && encounterHour < 18;

    if (!encounterActive) {
      dayVisibilityRef.current = false;
      motion.isRacing = false;
      motion.raceLeaderId = null;
      group.visible = false;
      delete sharedPositionsRef.current[id];
      if (podRef.current?.leaderId === id) {
        podRef.current = null;
      }
      return;
    }

    if (!dayVisibilityRef.current) {
      motion.phase = "cruise";
      motion.phaseEnteredAt = elapsed;
      motion.sequenceRemaining = 0;
      motion.isRacing = false;
      motion.raceLeaderId = null;
      motion.headingOmega = 0;
      motion.cruiseDepth = randomRange(
        random,
        DOLPHIN_MOTION.cruiseDepthRange[0],
        DOLPHIN_MOTION.cruiseDepthRange[1]
      );
      motion.renderDepth = motion.cruiseDepth;
      motion.actionAt =
        elapsed +
        randomRange(random, DOLPHIN_MOTION.actionInterval[0], DOLPHIN_MOTION.actionInterval[1]);
      dayVisibilityRef.current = true;
    }

    group.visible = true;

    if (podRef.current && elapsed > podRef.current.expiresAt) {
      podRef.current = null;
    }

    // FASE 1: IN VOLO (Airborne)
    if (motion.phase === "airborne") {
      const rawT = (elapsed - motion.phaseEnteredAt) / motion.actionDuration;

      if (rawT >= 1) {
        beginDiveRecovery(motion, random, elapsed);
        commitSharedPosition(sharedPositionsRef, id, motion.position, motion.renderDepth);
        return;
      }

      const action = getDolphinAction(motion.actionStyle, rawT);
      motion.position.addScaledVector(motion.jumpVelocity, dt);

      group.position.set(
        motion.position.x,
        WATER_SURFACE_Y + motion.launchDepth + action.lift,
        motion.position.z
      );
      group.rotation.y = motion.jumpHeading + action.yaw + MODEL_HEADING_OFFSET;
      group.rotation.x = action.pitch;
      group.rotation.z = action.roll;

      commitSharedPosition(
        sharedPositionsRef,
        id,
        motion.position,
        motion.launchDepth + action.lift
      );
      return;
    }

    // FASE 2: RECUPERO SOTT'ACQUA (Dive Recovery)
    if (motion.phase === "dive_recovery") {
      const progress = THREE.MathUtils.clamp(
        (elapsed - motion.phaseEnteredAt) / motion.diveDuration,
        0,
        1
      );
      const eased = smootherstep(progress);

      motion.position.addScaledVector(motion.jumpVelocity, dt); // Inerzia al 100% per fluidità
      motion.renderDepth = quadraticBezier(
        motion.launchDepth,
        motion.diveMidDepth,
        motion.diveTargetDepth,
        eased
      );

      group.position.set(
        motion.position.x,
        WATER_SURFACE_Y + motion.renderDepth,
        motion.position.z
      );
      group.rotation.y = motion.jumpHeading + MODEL_HEADING_OFFSET;
      group.rotation.x = lerpAngle(
        motion.exitPitch,
        motion.sequenceRemaining > 0 ? 0.16 : 0,
        eased
      );
      group.rotation.z = lerpAngle(motion.exitRoll, 0, eased);

      commitSharedPosition(sharedPositionsRef, id, motion.position, motion.renderDepth);

      if (progress >= 1) {
        motion.velocity.copy(motion.jumpVelocity);
        motion.heading = motion.jumpHeading;
        motion.headingOmega = 0;

        if (motion.sequenceRemaining > 0) {
          motion.sequenceRemaining -= 1;
          // APPROCCIO RADICALE: Intervallo fisso durante la gara per non perdere mai il sincrono!
          const nextDelay = motion.isRacing ? 0.6 : randomRange(random, 0.3, 0.7);
          configureNextJump(motion, random, DOLPHIN_MOTION, elapsed, nextDelay);
          motion.renderDepth = motion.diveTargetDepth;
        } else {
          motion.isRacing = false;
          motion.raceLeaderId = null;
          motion.phase = "cruise";
          motion.phaseEnteredAt = elapsed;
          motion.cruiseDepth = randomRange(
            random,
            DOLPHIN_MOTION.cruiseDepthRange[0],
            DOLPHIN_MOTION.cruiseDepthRange[1]
          );
          motion.renderDepth = motion.cruiseDepth;
          motion.actionAt =
            elapsed +
            randomRange(random, DOLPHIN_MOTION.actionInterval[0], DOLPHIN_MOTION.actionInterval[1]);
        }
      }
      return;
    }

    const isSurfaceApproach = motion.phase === "surface_approach";

    // ==========================================================
    // OVERRIDE MATEMATICO (GABBIA) PER LA GARA CHOREOGRAFICA
    // ==========================================================
    let bypassStandardSteering = false;

    if (motion.isRacing && isSurfaceApproach) {
      bypassStandardSteering = true;
      const pod = podRef.current;
      if (pod && motion.raceLeaderId && pod.leaderId === motion.raceLeaderId) {
        motion.raceHeading = pod.heading;
        motion.raceSpeed = pod.raceSpeed;
      }

      raceForwardRef.current.set(Math.sin(motion.raceHeading), 0, -Math.cos(motion.raceHeading));

      if (motion.raceLeaderId === id) {
        raceRightRef.current.set(Math.cos(motion.raceHeading), 0, Math.sin(motion.raceHeading));

        let turnDelta = 0;
        for (const obstacle of CREATURE_OBSTACLES) {
          awayRef.current.copy(obstacle.position).sub(motion.position).setY(0);
          const clearance = obstacle.radius + DOLPHIN_MOTION.avoidanceRadius + 60;
          const lookAhead = clearance * 2.3;
          const ahead = awayRef.current.dot(raceForwardRef.current);
          const lateral = awayRef.current.dot(raceRightRef.current);

          if (ahead < 0 || ahead > lookAhead || Math.abs(lateral) > clearance) continue;

          const proximity = 1 - THREE.MathUtils.clamp(ahead / lookAhead, 0, 1);
          const lateralWeight = 1 - THREE.MathUtils.clamp(Math.abs(lateral) / clearance, 0, 1);
          const turnDirection = lateral >= 0 ? -1 : 1;
          turnDelta += turnDirection * proximity * lateralWeight * 0.65;
        }

        if (Math.abs(turnDelta) > 0.0001) {
          motion.raceHeading = normalizeAngle(
            motion.raceHeading + THREE.MathUtils.clamp(turnDelta, -0.085, 0.085)
          );
          raceForwardRef.current.set(
            Math.sin(motion.raceHeading),
            0,
            -Math.cos(motion.raceHeading)
          );
        }

        motion.speed = motion.raceSpeed;
        motion.heading = motion.raceHeading;
        motion.velocity.copy(raceForwardRef.current).multiplyScalar(motion.speed);
        motion.position.addScaledVector(motion.velocity, dt);

        if (podRef.current?.leaderId === id) {
          podRef.current.heading = motion.raceHeading;
          podRef.current.position.copy(motion.position);
          podRef.current.raceSpeed = motion.raceSpeed;
        }
      } else if (motion.raceLeaderId) {
        const leaderPos = sharedPositionsRef.current[motion.raceLeaderId];
        if (leaderPos) {
          motion.raceHeading = pod?.heading ?? motion.raceHeading;
          raceForwardRef.current.set(
            Math.sin(motion.raceHeading),
            0,
            -Math.cos(motion.raceHeading)
          );
          raceRightRef.current.set(Math.cos(motion.raceHeading), 0, Math.sin(motion.raceHeading));
          raceTargetRef.current
            .copy(leaderPos)
            .addScaledVector(raceRightRef.current, motion.raceLane * 55);

          motion.position.lerp(raceTargetRef.current, dt * 15);
          motion.speed = motion.raceSpeed;
          motion.heading = motion.raceHeading;
          motion.velocity.copy(raceForwardRef.current).multiplyScalar(motion.speed);
        }
      }
      motion.position.y = 0;

      motion.headingOmega = 0;
      motion.renderDepth = lerp(motion.renderDepth, motion.approachDepth, dt * 5.8);

      group.position.set(
        motion.position.x,
        WATER_SURFACE_Y + motion.renderDepth,
        motion.position.z
      );
      group.rotation.y = motion.heading + MODEL_HEADING_OFFSET;
      group.rotation.x = lerpAngle(group.rotation.x, 0.24, Math.min(1, dt * 3.4));
      group.rotation.z = lerpAngle(group.rotation.z, 0, Math.min(1, dt * 3.2));

      commitSharedPosition(sharedPositionsRef, id, motion.position, motion.renderDepth);
    }

    // ==========================================================
    // LOGICA NORMALE (Evitamenti, Boids, etc.) SE NON IN GARA
    // ==========================================================
    if (!bypassStandardSteering) {
      const activeTarget = motion.usingViaPoint ? motion.viaPoint : motion.target;

      if (motion.usingViaPoint && motion.position.distanceToSquared(activeTarget) < 75 * 75) {
        motion.usingViaPoint = false;
      }

      if (
        elapsed >= motion.retargetAt ||
        (!motion.usingViaPoint && motion.position.distanceToSquared(motion.target) < 90 * 90)
      ) {
        const newTarget = chooseCreatureTarget(random, DOLPHIN_MOTION);
        newTarget.y = 0;
        motion.viaPoint.copy(chooseViaPoint(random, motion.position, newTarget));
        motion.target.copy(newTarget);
        motion.usingViaPoint = true;
        motion.speed = randomRange(
          random,
          DOLPHIN_MOTION.speedRange[0],
          DOLPHIN_MOTION.speedRange[1]
        );
        motion.retargetAt =
          elapsed +
          randomRange(random, DOLPHIN_MOTION.targetInterval[0], DOLPHIN_MOTION.targetInterval[1]);
      }

      desiredVelRef.current.copy(activeTarget).sub(motion.position).setY(0);
      if (desiredVelRef.current.lengthSq() > 0.001) {
        desiredVelRef.current.normalize().multiplyScalar(motion.speed);
      } else {
        desiredVelRef.current.set(0, 0, -motion.speed);
      }

      const s1 = Math.sin(elapsed * DOLPHIN_MOTION.swaySpeed * 2.9 + seed * 0.00031);
      const s2 = Math.sin(elapsed * DOLPHIN_MOTION.swaySpeed * 1.73 + seed * 0.00053) * 0.28;
      const pulse = 0.86 + Math.max(0, s1) * 0.24 + s2 * 0.06;
      desiredVelRef.current.multiplyScalar(pulse);

      avoidanceRef.current.set(0, 0, 0);

      // Evitamento Ostacoli
      for (const obstacle of CREATURE_OBSTACLES) {
        const distance = horizontalDistance(motion.position, obstacle.position);
        const clearance = obstacle.radius + DOLPHIN_MOTION.avoidanceRadius;
        if (distance >= clearance) continue;

        awayRef.current.copy(motion.position).sub(obstacle.position).setY(0);
        if (awayRef.current.lengthSq() < 0.001) awayRef.current.set(1, 0, 0);
        awayRef.current
          .normalize()
          .multiplyScalar(((clearance - distance) / clearance) * motion.speed * 1.9);
        avoidanceRef.current.add(awayRef.current);

        if (distance < obstacle.radius + DOLPHIN_MOTION.avoidanceRadius * 0.4) {
          motion.retargetAt = Math.min(motion.retargetAt, elapsed);
        }
      }

      // Evitamento Sociale (Disattivato se i delfini stanno gareggiando insieme)
      for (const [otherId, otherPosition] of Object.entries(sharedPositionsRef.current)) {
        if (otherId === id) continue;
        const distance = horizontalDistance(motion.position, otherPosition);
        if (distance >= DOLPHIN_MOTION.socialDistance) continue;

        awayRef.current.copy(motion.position).sub(otherPosition).setY(0);
        if (awayRef.current.lengthSq() < 0.001) awayRef.current.set(1, 0, 0);
        awayRef.current
          .normalize()
          .multiplyScalar(
            ((DOLPHIN_MOTION.socialDistance - distance) / DOLPHIN_MOTION.socialDistance) *
              motion.speed *
              1.45
          );
        avoidanceRef.current.add(awayRef.current);
      }

      let steerScale = isSurfaceApproach ? 0.26 : 1;
      const pod = podRef.current;

      // Unione al gruppo (quando non si gareggia, si attraggono e basta)
      if (pod !== null && pod.joinedIds.includes(id) && isSurfaceApproach) {
        steerScale = 1.0;
        awayRef.current.copy(pod.position).sub(motion.position).setY(0);
        const podDist = awayRef.current.length();
        if (podDist > 0.001) {
          const attraction = Math.min(podDist / 80, 1.8) * motion.speed;
          avoidanceRef.current.add(awayRef.current.normalize().multiplyScalar(attraction));
        }
      }

      steeringRef.current
        .copy(desiredVelRef.current)
        .add(avoidanceRef.current)
        .sub(motion.velocity);
      const maxForce = DOLPHIN_MOTION.maxAcceleration * dt * steerScale;
      const forceLength = steeringRef.current.length();
      if (forceLength > maxForce) steeringRef.current.multiplyScalar(maxForce / forceLength);

      motion.velocity.add(steeringRef.current);
      const currentSpeed = motion.velocity.length();
      const speedCap = motion.speed * pulse * 1.32;
      if (currentSpeed > speedCap) motion.velocity.multiplyScalar(speedCap / currentSpeed);

      motion.position.addScaledVector(motion.velocity, dt);
      motion.position.y = 0;

      if (motion.velocity.lengthSq() > 4) {
        const targetHeading = Math.atan2(motion.velocity.x, -motion.velocity.z);
        const headingError = shortAngleDiff(motion.heading, targetHeading);
        const damping = isSurfaceApproach
          ? DOLPHIN_MOTION.headingDamping * 4.5
          : DOLPHIN_MOTION.headingDamping;
        motion.headingOmega +=
          (headingError * DOLPHIN_MOTION.turnSpeed * 5.6 - motion.headingOmega * damping) * dt;
        motion.heading += motion.headingOmega * dt;
      }

      const bob =
        Math.sin(elapsed * DOLPHIN_MOTION.swaySpeed * 1.9 + seed * 0.00027) *
          DOLPHIN_MOTION.swayAmount *
          0.55 +
        Math.sin(elapsed * DOLPHIN_MOTION.swaySpeed * 0.93 + seed * 0.00044) *
          DOLPHIN_MOTION.swayAmount *
          0.22;

      const targetDepth = isSurfaceApproach ? motion.approachDepth : motion.cruiseDepth + bob;
      const depthLerp = Math.min(1, dt * (isSurfaceApproach ? 5.8 : 2.2));
      motion.renderDepth = lerp(motion.renderDepth, targetDepth, depthLerp);

      group.position.set(
        motion.position.x,
        WATER_SURFACE_Y + motion.renderDepth,
        motion.position.z
      );
      group.rotation.y = motion.heading + MODEL_HEADING_OFFSET;

      const bankTarget = isSurfaceApproach
        ? 0
        : THREE.MathUtils.clamp(-motion.velocity.x * DOLPHIN_MOTION.bankFactor, -0.38, 0.38);
      const pitchTarget = isSurfaceApproach
        ? 0.24
        : Math.sin(elapsed * DOLPHIN_MOTION.swaySpeed * 2.35 + seed * 0.00019) * 0.08;

      group.rotation.x = lerpAngle(group.rotation.x, pitchTarget, Math.min(1, dt * 3.4));
      group.rotation.z = lerpAngle(group.rotation.z, bankTarget, Math.min(1, dt * 3.2));

      commitSharedPosition(sharedPositionsRef, id, motion.position, motion.renderDepth);
    } // FINE OVERRIDE LOGICA

    // LOGICA DI INVITO E INIZIO GARA/GRUPPO
    if (
      !motionPrefs.reduced &&
      motion.phase === "cruise" &&
      podRef.current &&
      podRef.current.leaderId !== id &&
      elapsed <= podRef.current.expiresAt &&
      !podRef.current.joinedIds.includes(id) &&
      podRef.current.joinedIds.length < podRef.current.participantGoal &&
      elapsed >= motion.podCooldownUntil &&
      horizontalDistance(motion.position, podRef.current.position) <= POD_JOIN_DISTANCE &&
      nearestObstacleDistance(motion.position) > DOLPHIN_MOTION.avoidanceRadius + 90
    ) {
      const pod = podRef.current;
      pod.joinedIds.push(id);
      motion.podCooldownUntil = elapsed + POD_COOLDOWN;

      motion.isRacing = pod.isRacing;
      if (pod.isRacing) {
        motion.raceLeaderId = pod.leaderId;
        motion.raceHeading = pod.heading;
        motion.raceSpeed = pod.raceSpeed;
        motion.raceLane = pod.joinedIds.length === 2 ? 1 : -1; // 1 = Destra, -1 = Sinistra
      }

      const delayUntilLaunch = Math.max(0.1, pod.scheduledLaunchAt - elapsed);
      startJumpSequence(motion, random, DOLPHIN_MOTION, elapsed, pod.jumpCount, delayUntilLaunch);
      return;
    }

    if (motion.phase === "cruise") {
      // Under reduced motion the dolphins swim but don't leap.
      if (
        !motionPrefs.reduced &&
        elapsed >= motion.actionAt &&
        nearestObstacleDistance(motion.position) > DOLPHIN_MOTION.avoidanceRadius + 140
      ) {
        const canLeadPod =
          elapsed >= motion.podCooldownUntil &&
          (!podRef.current || elapsed > podRef.current.expiresAt);

        if (canLeadPod && random() < POD_TRIGGER_CHANCE) {
          // Gara attiva nel 70% dei casi quando si crea un gruppo
          const isRacing = random() < 0.7;

          const jumpCount = isRacing ? 4 : choosePodJumpCount(random);
          // Diamogli 4.5 secondi esatti di pre-gara per allinearsi perfettamente in corsia
          const syncLaunchDelay = isRacing ? 4.5 : 1.5;
          const raceSpeed = isRacing ? 58 : motion.speed; // Velocità altissima per la gara

          podRef.current = {
            leaderId: id,
            issuedAt: elapsed,
            expiresAt: elapsed + POD_JOIN_WINDOW,
            jumpCount,
            participantGoal: choosePodParticipantGoal(random),
            joinedIds: [id],
            position: motion.position.clone(),
            heading: motion.heading,
            raceSpeed,
            scheduledLaunchAt: elapsed + syncLaunchDelay,
            isRacing,
          };

          motion.podCooldownUntil = elapsed + POD_COOLDOWN;
          motion.isRacing = isRacing;
          if (isRacing) {
            motion.raceLeaderId = id;
            motion.raceHeading = motion.heading;
            motion.raceSpeed = raceSpeed;
            motion.raceLane = 0;
          }

          startJumpSequence(motion, random, DOLPHIN_MOTION, elapsed, jumpCount, syncLaunchDelay);
        } else {
          startJumpSequence(
            motion,
            random,
            DOLPHIN_MOTION,
            elapsed,
            chooseSoloJumpCount(random),
            randomRange(random, 0.55, 1.05)
          );
        }
      }
      return;
    }

    const bankAngle = Math.abs(group.rotation.z);
    const readyToLaunch =
      Math.abs(motion.renderDepth - motion.launchDepth) < 0.16 && bankAngle < 0.08;
    const stabilized = Math.abs(motion.headingOmega) < 0.08;
    const timedOut = elapsed - motion.phaseEnteredAt > 2.6;

    // APPROCCIO RADICALE: Se gareggiano, saltano esattamente quando programmato (ignorano le variabili di stabilità)
    const shouldLaunchNormal = elapsed >= motion.launchAt && readyToLaunch && stabilized;
    const shouldLaunchRace = motion.isRacing && elapsed >= motion.launchAt;

    if (shouldLaunchNormal || shouldLaunchRace || timedOut) {
      jumpDirRef.current.copy(motion.velocity).setY(0);
      if (jumpDirRef.current.lengthSq() < 0.001) {
        jumpDirRef.current.set(Math.sin(motion.heading), 0, -Math.cos(motion.heading));
      } else {
        jumpDirRef.current.normalize();
      }

      if (motion.isRacing) {
        jumpDirRef.current.set(Math.sin(motion.raceHeading), 0, -Math.cos(motion.raceHeading));
      }

      const speedBoost = motion.isRacing ? 1.0 : 1.08;
      motion.jumpVelocity.copy(jumpDirRef.current).multiplyScalar(motion.speed * speedBoost);

      motion.jumpHeading = motion.isRacing
        ? motion.raceHeading
        : Math.atan2(motion.jumpVelocity.x, -motion.jumpVelocity.z);
      motion.heading = motion.jumpHeading;
      motion.headingOmega = 0;
      motion.phase = "airborne";
      motion.phaseEnteredAt = elapsed;
    }
  });

  return (
    <group ref={groupRef} scale={scale}>
      <primitive object={model} />
    </group>
  );
}

/** Each model loads on its own boundary; the loading panel covers the wait. */
function Arrival({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

export default function SceneEncounters() {
  const [encounter] = useState<EncounterSet>(() => createEncounterSet());
  const sharedPositionsRef = useRef<Record<string, THREE.Vector3>>({});
  const podRef = useRef<PodAnnouncement | null>(null);

  return (
    <>
      <EncounterLightRig />

      <Arrival><Landmark placement={PLACEMENTS.promontory} /></Arrival>
      <Arrival><Landmark placement={PLACEMENTS.reef} /></Arrival>
      <Arrival><Landmark placement={PLACEMENTS.cliffRock} /></Arrival>
      <Arrival><Landmark placement={PLACEMENTS.seaStacks} /></Arrival>
      <Arrival><Landmark placement={PLACEMENTS.seaStacksSmall} /></Arrival>
      <Arrival>
        {/* The summit sits about 23.5 units up the model, at scale 14. */}
        <Landmark placement={PLACEMENTS.volcano}>
          <CloudCap height={23.5 * PLACEMENTS.volcano.scale + 30} />
        </Landmark>
      </Arrival>

      <Arrival>
        <DolphinEncounter
          id="dolphin-a"
          seed={encounter.dolphinSeedA}
          scale={10}
          sharedPositionsRef={sharedPositionsRef}
          podRef={podRef}
        />
      </Arrival>
      <Arrival>
        <DolphinEncounter
          id="dolphin-b"
          seed={encounter.dolphinSeedB}
          scale={10}
          sharedPositionsRef={sharedPositionsRef}
          podRef={podRef}
        />
      </Arrival>
      <Arrival>
        <DolphinEncounter
          id="dolphin-c"
          seed={encounter.dolphinSeedC}
          scale={10}
          sharedPositionsRef={sharedPositionsRef}
          podRef={podRef}
        />
      </Arrival>
    </>
  );
}

// Models are meshopt-compressed (scripts/optimize-models.mjs); the decoder ships with
// three, so loading them never calls a third-party CDN. No Draco.
useGLTF.preload("/models/promontory.glb", false);
useGLTF.preload("/models/cliff_rock.glb", false);
useGLTF.preload("/models/group_of_cliff_1.glb", false);
useGLTF.preload("/models/group_of_cliff_2.glb", false);
useGLTF.preload("/models/volcano.glb", false);
useGLTF.preload("/models/rock_reef.glb", false);
useGLTF.preload("/models/dolphin.glb", false);
