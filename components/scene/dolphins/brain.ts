// The dolphins' behavior: pure state and math, no three.js and no React, so it
// can be tested on its own (brain.test.ts) and drawn by anything (Dolphins.tsx).
//
// Conventions: positions in scene units on the water plane (x, z), y up with the
// surface at 0. A heading h points along (sin h, −cos h). Pitch is nose up.
//
// A dolphin cruises under the surface, steering to waypoints, around obstacles
// and its pod-mates, and surfaces now and then to breathe. When it leaps it
// bursts to speed while rising, leaves the water on a ballistic arc
// (y = v₀t − ½gt², v₀ = √(2gh) for an apex height h), meets the water again and
// dives back to cruising depth. Porpoising strings short leaps together; a
// breach is a rare high one. Activity follows the sun: they swim all night but
// rarely leap, and never leap under reduced motion.

export type Phase = "cruise" | "burst" | "airborne" | "dive";
export type LeapKind = "leap" | "porpoise" | "breach";

export interface Dolphin {
  id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  turnRate: number;
  speed: number;
  vy: number;
  pitch: number;
  bank: number;
  phase: Phase;
  phaseTime: number;
  cruiseDepth: number;
  targetX: number;
  targetZ: number;
  retargetAt: number;
  nextActionAt: number;
  breathAt: number;
  wakeAt: number;
  leapsLeft: number;
  kind: LeapKind;
  burstFrom: number;
  /** Set when a visitor taps the water near it: swim there and leap. */
  curious: boolean;
}

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export interface World {
  /** Seconds since the pod was created. */
  time: number;
  /** 0 at night to 1 by day. */
  daylight: number;
  reducedMotion: boolean;
  obstacles: Obstacle[];
  minRadius: number;
  maxRadius: number;
}

export interface DolphinEvents {
  exit?(d: Dolphin): void;
  entry?(d: Dolphin): void;
  breath?(d: Dolphin): void;
  wake?(d: Dolphin): void;
}

export const GRAVITY = 60;
export const LEAP_HEIGHT: Record<LeapKind, number> = { leap: 13, porpoise: 6.5, breach: 22 };

const CRUISE_SPEED: [number, number] = [26, 40];
const BURST_SPEED = 66;
const BURST_TIME = 1.3;
const PORPOISE_BURST_TIME = 0.45;
const CRUISE_DEPTH: [number, number] = [-8, -5.5];
const LAUNCH_DEPTH = -1.2;
const MAX_TURN = 1.1; // rad/s while cruising
const OBSTACLE_CLEARANCE = 90;
const SOCIAL_DISTANCE = 45;

const TAU = Math.PI * 2;

function between(random: () => number, [min, max]: [number, number]) {
  return min + (max - min) * random();
}

function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function headingTo(dx: number, dz: number) {
  return Math.atan2(dx, -dz);
}

/** Seconds until the next leap: often by day, rarely at night. */
function restBeforeLeap(world: World, random: () => number) {
  const base = 7 + (1 - world.daylight) * 38;
  return base * (0.7 + 0.6 * random());
}

export function chooseTarget(d: Dolphin, world: World, random: () => number) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = random() * TAU;
    const radius = world.minRadius + (world.maxRadius - world.minRadius) * Math.sqrt(random());
    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius;
    const blocked = world.obstacles.some(
      (o) => Math.hypot(x - o.x, z - o.z) < o.radius + OBSTACLE_CLEARANCE
    );
    if (!blocked) {
      d.targetX = x;
      d.targetZ = z;
      d.retargetAt = world.time + 14 + random() * 12;
      return;
    }
  }
  d.targetX = 0;
  d.targetZ = -world.minRadius * 2;
}

export function createPod(count: number, world: World, random: () => number): Dolphin[] {
  const pod: Dolphin[] = [];
  const angle = random() * TAU;
  const radius = (world.minRadius + world.maxRadius) * 0.35;
  for (let id = 0; id < count; id++) {
    const d: Dolphin = {
      id,
      x: Math.sin(angle) * radius + (id - 1) * 40,
      y: between(random, CRUISE_DEPTH),
      z: -Math.cos(angle) * radius + id * 25,
      heading: random() * TAU,
      turnRate: 0,
      speed: between(random, CRUISE_SPEED),
      vy: 0,
      pitch: 0,
      bank: 0,
      phase: "cruise",
      phaseTime: 0,
      cruiseDepth: between(random, CRUISE_DEPTH),
      targetX: 0,
      targetZ: 0,
      retargetAt: 0,
      nextActionAt: world.time + 3 + random() * 6 + id * 1.5,
      breathAt: world.time + 4 + random() * 10,
      wakeAt: 0,
      leapsLeft: 0,
      kind: "leap",
      burstFrom: 0,
      curious: false,
    };
    chooseTarget(d, world, random);
    pod.push(d);
  }
  return pod;
}

/** The heading a dolphin wants: its waypoint, bent away from obstacles, pod-mates and the edge. */
function desiredHeading(d: Dolphin, pod: Dolphin[], world: World) {
  let dx = d.targetX - d.x;
  let dz = d.targetZ - d.z;
  const toTarget = Math.hypot(dx, dz) || 1;
  dx /= toTarget;
  dz /= toTarget;

  // Formation by steering: followers drift toward the leader's flank.
  const leader = pod[0];
  if (d !== leader && leader.phase === "cruise") {
    const side = d.id % 2 === 0 ? -1 : 1;
    const slotX = leader.x + Math.cos(leader.heading) * side * 38 - Math.sin(leader.heading) * 26;
    const slotZ = leader.z + Math.sin(leader.heading) * side * 38 + Math.cos(leader.heading) * 26;
    const toSlot = Math.hypot(slotX - d.x, slotZ - d.z);
    if (toSlot < 520 && !d.curious) {
      dx = dx * 0.25 + ((slotX - d.x) / (toSlot || 1)) * 0.75;
      dz = dz * 0.25 + ((slotZ - d.z) / (toSlot || 1)) * 0.75;
    }
  }

  // Obstacles: felt from where the dolphin is and from where it will be in two
  // seconds, so it turns early instead of brushing the rock.
  const aheadX = d.x + Math.sin(d.heading) * d.speed * 2;
  const aheadZ = d.z - Math.cos(d.heading) * d.speed * 2;
  for (const o of world.obstacles) {
    for (const [px, pz] of [[d.x, d.z], [aheadX, aheadZ]]) {
      const ox = px - o.x;
      const oz = pz - o.z;
      const dist = Math.hypot(ox, oz) || 1;
      const reach = o.radius + OBSTACLE_CLEARANCE * 1.5;
      if (dist < reach) {
        const push = ((reach - dist) / reach) * 4;
        dx += (ox / dist) * push;
        dz += (oz / dist) * push;
      }
    }
  }

  for (const other of pod) {
    if (other === d) continue;
    const ox = d.x - other.x;
    const oz = d.z - other.z;
    const dist = Math.hypot(ox, oz) || 1;
    if (dist < SOCIAL_DISTANCE) {
      const push = ((SOCIAL_DISTANCE - dist) / SOCIAL_DISTANCE) * 1.5;
      dx += (ox / dist) * push;
      dz += (oz / dist) * push;
    }
  }

  const r = Math.hypot(d.x, d.z);
  if (r > world.maxRadius * 0.92) {
    dx -= (d.x / r) * 2;
    dz -= (d.z / r) * 2;
  } else if (r < world.minRadius) {
    dx += (d.x / (r || 1)) * 2;
    dz += (d.z / (r || 1)) * 2;
  }

  return headingTo(dx, dz);
}

function steer(d: Dolphin, pod: Dolphin[], world: World, dt: number, maxTurn: number) {
  const wanted = desiredHeading(d, pod, world);
  const delta = wrapAngle(wanted - d.heading);
  const turn = Math.max(-maxTurn, Math.min(maxTurn, delta * 1.6));
  d.turnRate += (turn - d.turnRate) * Math.min(1, dt * 3);
  d.heading = wrapAngle(d.heading + d.turnRate * dt);
  d.bank += (-d.turnRate * 0.55 - d.bank) * Math.min(1, dt * 3);
}

function moveAlongHeading(d: Dolphin, dt: number, obstacles: Obstacle[]) {
  d.x += Math.sin(d.heading) * d.speed * dt;
  d.z += -Math.cos(d.heading) * d.speed * dt;
  // Nothing swims through rock: if steering wasn't enough, slide along it.
  for (const o of obstacles) {
    const ox = d.x - o.x;
    const oz = d.z - o.z;
    const dist = Math.hypot(ox, oz) || 1;
    if (dist < o.radius + 1) {
      d.x = o.x + (ox / dist) * (o.radius + 1);
      d.z = o.z + (oz / dist) * (o.radius + 1);
    }
  }
}

function startLeap(d: Dolphin, kind: LeapKind, random: () => number) {
  d.kind = kind;
  d.leapsLeft = kind === "porpoise" ? 3 + Math.floor(random() * 3) : 1;
  d.phase = "burst";
  d.phaseTime = 0;
  d.burstFrom = d.y;
  d.nextActionAt = Infinity;
}

/** A leap needs open water from here to where it lands (about 260 units ahead). */
function canLeap(d: Dolphin, world: World) {
  if (world.reducedMotion) return false;
  for (let ahead = 0; ahead <= 260; ahead += 65) {
    const x = d.x + Math.sin(d.heading) * ahead;
    const z = d.z - Math.cos(d.heading) * ahead;
    if (world.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius + OBSTACLE_CLEARANCE)) return false;
  }
  return true;
}

function pickKind(random: () => number): LeapKind {
  const roll = random();
  if (roll < 0.1) return "breach";
  if (roll < 0.5) return "porpoise";
  return "leap";
}

function cruise(d: Dolphin, pod: Dolphin[], world: World, dt: number, random: () => number, events: DolphinEvents) {
  if (world.time >= d.retargetAt || Math.hypot(d.targetX - d.x, d.targetZ - d.z) < 110) {
    if (!d.curious) chooseTarget(d, world, random);
  }
  steer(d, pod, world, dt, MAX_TURN);

  // Speed: cruising pace, matching the leader when in formation.
  const leader = pod[0];
  const wantSpeed = d === leader ? (CRUISE_SPEED[0] + CRUISE_SPEED[1]) / 2 : leader.speed * 1.05;
  d.speed += (wantSpeed - d.speed) * Math.min(1, dt * 0.8);
  moveAlongHeading(d, dt, world.obstacles);

  // Depth: a slow swell around cruising depth, up to the surface to breathe.
  const breathing = world.time >= d.breathAt;
  const wantY = breathing ? -0.6 : d.cruiseDepth + Math.sin(world.time * 0.7 + d.id) * 0.8;
  const previousY = d.y;
  d.y += (wantY - d.y) * Math.min(1, dt * (breathing ? 1.6 : 0.8));
  d.pitch += (Math.atan2(d.y - previousY, Math.max(d.speed * dt, 1e-3)) - d.pitch) * Math.min(1, dt * 4);
  if (breathing && d.y > -1) {
    events.breath?.(d);
    d.breathAt = world.time + 12 + random() * 14;
  }

  if (d.curious && Math.hypot(d.targetX - d.x, d.targetZ - d.z) < 90) {
    d.curious = false;
    if (canLeap(d, world)) startLeap(d, "leap", random);
    return;
  }

  if (world.time >= d.nextActionAt) {
    if (!canLeap(d, world)) {
      d.nextActionAt = world.time + 3;
      return;
    }
    const kind = pickKind(random);
    startLeap(d, kind, random);
    // Nearby pod-mates join, a beat apart.
    for (const other of pod) {
      if (other === d || other.phase !== "cruise") continue;
      if (Math.hypot(other.x - d.x, other.z - d.z) < 260) {
        other.nextActionAt = world.time + 0.25 + other.id * 0.2;
      }
    }
  }
}

function burst(d: Dolphin, pod: Dolphin[], world: World, dt: number, events: DolphinEvents) {
  const duration = d.kind === "porpoise" && d.burstFrom > -3 ? PORPOISE_BURST_TIME : BURST_TIME;
  steer(d, pod, world, dt, MAX_TURN * 0.35);
  d.speed += (BURST_SPEED - d.speed) * Math.min(1, dt * 2.4);
  moveAlongHeading(d, dt, world.obstacles);
  const t = Math.min(1, d.phaseTime / duration);
  const ease = t * t * (3 - 2 * t);
  d.y = d.burstFrom + (LAUNCH_DEPTH - d.burstFrom) * ease;
  d.pitch += (0.35 - d.pitch) * Math.min(1, dt * 4);
  if (t >= 1) {
    d.phase = "airborne";
    d.phaseTime = 0;
    d.y = 0;
    d.vy = Math.sqrt(2 * GRAVITY * LEAP_HEIGHT[d.kind]);
    events.exit?.(d);
  }
  if (d.y > -2.5 && world.time >= d.wakeAt) {
    events.wake?.(d);
    d.wakeAt = world.time + 0.12;
  }
}

function airborne(d: Dolphin, world: World, dt: number, events: DolphinEvents) {
  // Ballistic: constant forward speed, gravity on the vertical.
  d.y += d.vy * dt - 0.5 * GRAVITY * dt * dt;
  d.vy -= GRAVITY * dt;
  moveAlongHeading(d, dt, world.obstacles);
  d.pitch = Math.atan2(d.vy, d.speed);
  d.bank *= 1 - Math.min(1, dt * 2);
  if (d.y <= 0 && d.vy < 0) {
    d.y = 0;
    d.leapsLeft -= 1;
    d.phase = "dive";
    d.phaseTime = 0;
    events.entry?.(d);
  }
}

function dive(d: Dolphin, pod: Dolphin[], world: World, dt: number, random: () => number) {
  // Water drag slows the plunge; buoyancy brings it back to cruising depth.
  d.vy *= Math.exp(-3.2 * dt);
  d.vy += (d.cruiseDepth - d.y) * 2.2 * dt;
  d.y = Math.min(0, d.y + d.vy * dt);
  steer(d, pod, world, dt, MAX_TURN * 0.5);
  moveAlongHeading(d, dt, world.obstacles);
  d.pitch += (Math.atan2(d.vy, d.speed) - d.pitch) * Math.min(1, dt * 5);

  if (d.leapsLeft > 0 && d.phaseTime > 0.35) {
    d.phase = "burst";
    d.phaseTime = 0;
    d.burstFrom = d.y;
    return;
  }
  if (d.phaseTime > 2.2) {
    d.phase = "cruise";
    d.phaseTime = 0;
    d.vy = 0;
    d.nextActionAt = world.time + restBeforeLeap(world, random);
  }
}

export function stepDolphin(
  d: Dolphin,
  pod: Dolphin[],
  world: World,
  dt: number,
  random: () => number,
  events: DolphinEvents = {}
) {
  d.phaseTime += dt;
  switch (d.phase) {
    case "cruise":
      cruise(d, pod, world, dt, random, events);
      break;
    case "burst":
      burst(d, pod, world, dt, events);
      break;
    case "airborne":
      airborne(d, world, dt, events);
      break;
    case "dive":
      dive(d, pod, world, dt, random);
      break;
  }
}

/** Advances the whole pod by `dt` seconds; `world.time` should already include it. */
export function stepPod(pod: Dolphin[], world: World, dt: number, random: () => number, events: DolphinEvents = {}) {
  for (const d of pod) stepDolphin(d, pod, world, dt, random, events);
}

/** A visitor tapped the water: the nearest cruising dolphin within reach comes to look. */
export function attract(pod: Dolphin[], x: number, z: number, reach = 900): Dolphin | null {
  let best: Dolphin | null = null;
  let bestDistance = reach;
  for (const d of pod) {
    if (d.phase !== "cruise") continue;
    const distance = Math.hypot(d.x - x, d.z - z);
    if (distance < bestDistance) {
      best = d;
      bestDistance = distance;
    }
  }
  if (best) {
    best.targetX = x;
    best.targetZ = z;
    best.curious = true;
    best.retargetAt = Infinity;
  }
  return best;
}
