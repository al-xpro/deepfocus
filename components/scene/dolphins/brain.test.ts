import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../random";
import { attract, createPod, GRAVITY, LEAP_HEIGHT, stepDolphin, stepPod, type Dolphin, type World } from "./brain";

const DT = 1 / 60;

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    time: 0,
    daylight: 1,
    reducedMotion: false,
    obstacles: [{ x: 600, z: -600, radius: 180 }],
    minRadius: 120,
    maxRadius: 2000,
    ...overrides,
  };
}

function simulate(seconds: number, world: World, seed = 7, onStep?: (pod: Dolphin[]) => void) {
  const random = createSeededRandom(seed);
  const pod = createPod(3, world, random);
  const counts = { exit: 0, entry: 0, breath: 0 };
  const events = {
    exit: () => counts.exit++,
    entry: () => counts.entry++,
    breath: () => counts.breath++,
  };
  for (let t = 0; t < seconds; t += DT) {
    world.time += DT;
    stepPod(pod, world, DT, random, events);
    onStep?.(pod);
  }
  return { pod, counts };
}

describe("a leap", () => {
  it("follows a ballistic arc to its planned height and lands after 2·v₀/g", () => {
    const world = makeWorld();
    const random = createSeededRandom(1);
    const [d] = createPod(1, world, random);
    d.phase = "airborne";
    d.phaseTime = 0;
    d.y = 0;
    d.kind = "leap";
    d.leapsLeft = 1;
    d.speed = 60;
    d.vy = Math.sqrt(2 * GRAVITY * LEAP_HEIGHT.leap);
    const v0 = d.vy;

    let apex = 0;
    let flight = 0;
    while (d.phase === "airborne" && flight < 10) {
      stepDolphin(d, [d], world, DT, random);
      flight += DT;
      apex = Math.max(apex, d.y);
    }

    expect(apex).toBeGreaterThan(LEAP_HEIGHT.leap - 0.3);
    expect(apex).toBeLessThanOrEqual(LEAP_HEIGHT.leap + 0.01);
    expect(flight).toBeCloseTo((2 * v0) / GRAVITY, 1);
    expect(d.phase).toBe("dive");
  });

  it("points the nose along the velocity: up on the way up, down on the way down", () => {
    const world = makeWorld();
    const random = createSeededRandom(2);
    const [d] = createPod(1, world, random);
    Object.assign(d, { phase: "airborne", y: 0, speed: 60, leapsLeft: 1, vy: Math.sqrt(2 * GRAVITY * 13) });
    stepDolphin(d, [d], world, DT, random);
    expect(d.pitch).toBeGreaterThan(0.3);
    while (d.vy > -10) stepDolphin(d, [d], world, DT, random);
    expect(d.pitch).toBeLessThan(-0.1);
  });
});

describe("the pod", () => {
  it("never leaps under reduced motion", () => {
    const { counts } = simulate(300, makeWorld({ reducedMotion: true }));
    expect(counts.exit).toBe(0);
  });

  it("leaps by day, and much less at night", () => {
    const day = simulate(600, makeWorld({ daylight: 1 })).counts.exit;
    const night = simulate(600, makeWorld({ daylight: 0 })).counts.exit;
    expect(day).toBeGreaterThan(10);
    expect(night).toBeLessThan(day / 2);
  });

  it("meets the water once for every time it leaves it", () => {
    const { pod, counts } = simulate(600, makeWorld());
    const inTheAir = pod.filter((d) => d.phase === "airborne").length;
    expect(counts.entry).toBe(counts.exit - inTheAir);
  });

  it("keeps out of obstacles and inside its range", () => {
    const world = makeWorld();
    let worstObstacle = Infinity;
    let farthest = 0;
    simulate(900, world, 11, (pod) => {
      for (const d of pod) {
        for (const o of world.obstacles) worstObstacle = Math.min(worstObstacle, Math.hypot(d.x - o.x, d.z - o.z) - o.radius);
        farthest = Math.max(farthest, Math.hypot(d.x, d.z));
      }
    });
    expect(worstObstacle).toBeGreaterThan(0);
    expect(farthest).toBeLessThan(world.maxRadius * 1.05);
  });

  it("breathes at the surface", () => {
    expect(simulate(120, makeWorld()).counts.breath).toBeGreaterThan(3);
  });

  it("is deterministic for a seed", () => {
    const a = simulate(60, makeWorld(), 42).pod.map((d) => [d.x, d.y, d.z]);
    const b = simulate(60, makeWorld(), 42).pod.map((d) => [d.x, d.y, d.z]);
    expect(a).toEqual(b);
  });
});

describe("a tap on the water", () => {
  it("brings the nearest cruising dolphin to look, and it leaps there", () => {
    const world = makeWorld({ daylight: 0 });
    const random = createSeededRandom(5);
    const pod = createPod(3, world, random);
    const target = { x: pod[1].x + 300, z: pod[1].z };
    const chosen = attract(pod, target.x, target.z);
    expect(chosen).not.toBeNull();

    let leaptNear = false;
    const events = {
      exit: (d: Dolphin) => {
        if (d === chosen && Math.hypot(d.x - target.x, d.z - target.z) < 200) leaptNear = true;
      },
    };
    for (let t = 0; t < 40 && !leaptNear; t += DT) {
      world.time += DT;
      stepPod(pod, world, DT, random, events);
    }
    expect(leaptNear).toBe(true);
  });
});
