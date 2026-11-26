// Water contact: spray, mist and night sparks (particles), and ripples (rings).
// Anything in the scene can emit through `waterFx`; WaterFx.tsx draws the pools.
// Fixed-size ring buffers: no allocation per splash, the oldest is reused.

export const MAX_PARTICLES = 1600;
export const MAX_RINGS = 72;

export const ParticleKind = { Spray: 0, Mist: 1, Spark: 2 } as const;
type ParticleKind = (typeof ParticleKind)[keyof typeof ParticleKind];

export const particles = {
  position: new Float32Array(MAX_PARTICLES * 3),
  velocity: new Float32Array(MAX_PARTICLES * 3),
  life: new Float32Array(MAX_PARTICLES),
  maxLife: new Float32Array(MAX_PARTICLES),
  size: new Float32Array(MAX_PARTICLES),
  gravity: new Float32Array(MAX_PARTICLES),
  kind: new Float32Array(MAX_PARTICLES),
  next: 0,
};

export const rings = {
  x: new Float32Array(MAX_RINGS),
  z: new Float32Array(MAX_RINGS),
  age: new Float32Array(MAX_RINGS),
  life: new Float32Array(MAX_RINGS),
  size: new Float32Array(MAX_RINGS),
  strength: new Float32Array(MAX_RINGS),
  next: 0,
};

function spawnParticle(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  life: number, size: number, gravity: number, kind: ParticleKind
) {
  const i = particles.next;
  particles.next = (i + 1) % MAX_PARTICLES;
  particles.position[i * 3] = x;
  particles.position[i * 3 + 1] = y;
  particles.position[i * 3 + 2] = z;
  particles.velocity[i * 3] = vx;
  particles.velocity[i * 3 + 1] = vy;
  particles.velocity[i * 3 + 2] = vz;
  particles.life[i] = life;
  particles.maxLife[i] = life;
  particles.size[i] = size;
  particles.gravity[i] = gravity;
  particles.kind[i] = kind;
}

function spawnRing(x: number, z: number, size: number, life: number, strength: number) {
  const i = rings.next;
  rings.next = (i + 1) % MAX_RINGS;
  rings.x[i] = x;
  rings.z[i] = z;
  rings.age[i] = 0;
  rings.life[i] = life;
  rings.size[i] = size;
  rings.strength[i] = strength;
}

const rand = Math.random;

export const waterFx = {
  /** A body leaving or meeting the water: a crown of spray and a ring. */
  splash(x: number, z: number, strength = 1, heading = 0) {
    const count = Math.round(26 * strength);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const out = (4 + rand() * 7) * strength;
      // A little forward throw along the body's heading.
      const fx = Math.sin(heading) * 3 * strength;
      const fz = -Math.cos(heading) * 3 * strength;
      spawnParticle(
        x + Math.cos(angle) * 1.5, 0.3, z + Math.sin(angle) * 1.5,
        Math.cos(angle) * out + fx, (9 + rand() * 13) * strength, Math.sin(angle) * out + fz,
        0.9 + rand() * 0.7, 1.3 + rand() * 1.6, 34, ParticleKind.Spray
      );
    }
    spawnRing(x, z, 9 * strength, 2.4, strength);
    spawnRing(x, z, 5 * strength, 1.6, strength * 0.7);
  },

  /** A dolphin breathing at the surface: a small soft puff of mist. */
  breath(x: number, y: number, z: number) {
    for (let i = 0; i < 9; i++) {
      spawnParticle(
        x + (rand() - 0.5), Math.max(y, 0.4), z + (rand() - 0.5),
        (rand() - 0.5) * 1.5, 4 + rand() * 3, (rand() - 0.5) * 1.5,
        1.3 + rand() * 0.6, 2.2 + rand() * 1.4, 2.5, ParticleKind.Mist
      );
    }
    spawnRing(x, z, 3.5, 1.4, 0.45);
  },

  /** A faint wake behind something moving fast near the surface. */
  wake(x: number, z: number) {
    spawnRing(x, z, 3.2, 1.3, 0.35);
  },

  /** A ripple on its own (a tap on the water, a fish). */
  ripple(x: number, z: number, size = 8, strength = 0.8) {
    spawnRing(x, z, size, 2.6, strength);
    spawnRing(x, z, size * 0.55, 1.8, strength * 0.6);
  },

  /** A whale's spout: a tall, slow column of mist. */
  spout(x: number, z: number, height = 26) {
    for (let i = 0; i < 46; i++) {
      spawnParticle(
        x + (rand() - 0.5) * 2, 1, z + (rand() - 0.5) * 2,
        (rand() - 0.5) * 3, height * (0.8 + rand() * 0.45), (rand() - 0.5) * 3,
        2.6 + rand() * 1.4, 7 + rand() * 6, 9, ParticleKind.Mist
      );
    }
  },

  /** Night only: plankton glowing where the water is stirred. */
  spark(x: number, z: number, spread = 3) {
    for (let i = 0; i < 2; i++) {
      spawnParticle(
        x + (rand() - 0.5) * spread, 0.25, z + (rand() - 0.5) * spread,
        (rand() - 0.5) * 0.6, 0.15, (rand() - 0.5) * 0.6,
        1.1 + rand() * 0.9, 1 + rand() * 0.9, 0, ParticleKind.Spark
      );
    }
  },
};

/** Advances every particle and ring; called once per frame by WaterFx. */
export function stepWaterFx(dt: number) {
  const p = particles;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (p.life[i] <= 0) continue;
    p.life[i] -= dt;
    const k = i * 3;
    p.velocity[k + 1] -= p.gravity[i] * dt;
    // Air drag: spray slows, mist drifts.
    const drag = p.kind[i] === ParticleKind.Spray ? 0.6 : 1.4;
    p.velocity[k] *= 1 - drag * dt;
    p.velocity[k + 2] *= 1 - drag * dt;
    p.position[k] += p.velocity[k] * dt;
    p.position[k + 1] += p.velocity[k + 1] * dt;
    p.position[k + 2] += p.velocity[k + 2] * dt;
    if (p.kind[i] === ParticleKind.Spray && p.position[k + 1] < 0) p.life[i] = 0;
  }
  for (let i = 0; i < MAX_RINGS; i++) {
    if (rings.age[i] < rings.life[i]) rings.age[i] += dt;
  }
}
