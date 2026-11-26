import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../random";
import { createPod, formationSlot, GRAVITY, LEAP_HEIGHT, stepDolphin, stepPod, type Dolphin, type World } from "./brain";

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

  it("leans into its turns, never out of them", () => {
    let into = 0;
    let out = 0;
    simulate(300, makeWorld({ reducedMotion: true }), 5, (pod) => {
      for (const d of pod) {
        if (Math.abs(d.turnRate) < 0.15 || Math.abs(d.bank) < 0.05) continue;
        if (Math.sign(d.bank) === Math.sign(d.turnRate)) into++;
        else out++;
      }
    });
    expect(into).toBeGreaterThan(100);
    expect(out / (into + out)).toBeLessThan(0.1);
  });

  it("keeps to the water in view when it knows where the viewer looks", () => {
    const eye = { bearing: 0, x: 0, z: 90 };
    const world = makeWorld({ view: eye, maxRadius: 800 });
    let inView = 0;
    let all = 0;
    simulate(600, world, 9, (pod) => {
      for (const d of pod) {
        if (d.phase !== "airborne") continue;
        all++;
        const bearing = Math.atan2(d.x - eye.x, -(d.z - eye.z));
        if (Math.abs(bearing) < 0.9) inView++;
      }
    });
    expect(all).toBeGreaterThan(100);
    expect(inView / all).toBeGreaterThan(0.7);
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

describe("pod leaps", () => {
  it("keeps the followers in formation beside the leader nearly all the time", () => {
    const world = makeWorld({ reducedMotion: true });
    const offsets: number[] = [];
    simulate(300, world, 3, (pod) => {
      if (world.time < 20) return; // time to gather
      for (const d of pod.slice(1)) {
        const [x, z] = formationSlot(d, pod[0]);
        offsets.push(Math.hypot(d.x - x, d.z - z));
      }
    });
    offsets.sort((a, b) => a - b);
    // Sharp turns open the formation for a moment; it closes again.
    expect(offsets[Math.floor(offsets.length * 0.5)]).toBeLessThan(25);
    expect(offsets[Math.floor(offsets.length * 0.95)]).toBeLessThan(90);
  });

  it("leaves the water together: the whole pod within a fifth of a second", () => {
    const world = makeWorld();
    const random = createSeededRandom(21);
    const pod = createPod(3, world, random);
    const exits: Array<{ id: number; time: number }> = [];
    const events = { exit: (d: Dolphin) => exits.push({ id: d.id, time: world.time }) };
    for (let t = 0; t < 600; t += DT) {
      world.time += DT;
      stepPod(pod, world, DT, random, events);
    }
    const together = exits.filter((e) => e.id === 0).filter((lead) =>
      [1, 2].every((id) => exits.some((e) => e.id === id && Math.abs(e.time - lead.time) < 0.2))
    );
    expect(together.length).toBeGreaterThan(3);
  });
});
