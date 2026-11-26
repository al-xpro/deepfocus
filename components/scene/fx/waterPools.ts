// Water contact: droplets and mist (particles), foam patches and faint ripples.
// Anything in the scene emits through `waterFx`; WaterFx.tsx draws the pools.
// Fixed-size ring buffers: no allocation per splash, the oldest is reused.

export const MAX_PARTICLES = 1400;
export const MAX_FOAM = 64;
export const MAX_RINGS = 40;

export const ParticleKind = { Droplet: 0, Mist: 1 } as const;
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

/** Foam: white patches lying on the water that spread and fade. */
export const foam = {
  x: new Float32Array(MAX_FOAM),
  z: new Float32Array(MAX_FOAM),
  angle: new Float32Array(MAX_FOAM),
  age: new Float32Array(MAX_FOAM),
  life: new Float32Array(MAX_FOAM),
  size: new Float32Array(MAX_FOAM),
  strength: new Float32Array(MAX_FOAM),
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
  particles.position.set([x, y, z], i * 3);
  particles.velocity.set([vx, vy, vz], i * 3);
  particles.life[i] = life;
  particles.maxLife[i] = life;
  particles.size[i] = size;
  particles.gravity[i] = gravity;
  particles.kind[i] = kind;
}

function spawnFoam(x: number, z: number, size: number, life: number, strength: number) {
  const i = foam.next;
  foam.next = (i + 1) % MAX_FOAM;
  foam.x[i] = x;
  foam.z[i] = z;
  foam.angle[i] = Math.random() * Math.PI * 2;
  foam.age[i] = 0;
  foam.life[i] = life;
  foam.size[i] = size;
  foam.strength[i] = strength;
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
  /**
   * A body leaving or meeting the water: a crown of fine droplets thrown out and
   * up (more along the heading), a short white sheet at the center, a foam patch
   * that spreads and fades, and a faint ripple.
   */
  splash(x: number, z: number, strength = 1, heading = 0) {
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const crown = Math.round(70 * strength);
    for (let i = 0; i < crown; i++) {
      const angle = rand() * Math.PI * 2;
      const out = (3 + rand() * 6) * strength;
      const forward = (rand() * 4 + 2) * strength;
      spawnParticle(
        x + Math.cos(angle) * 1.2, 0.2, z + Math.sin(angle) * 1.2,
        Math.cos(angle) * out + fx * forward, (6 + rand() * 11) * Math.sqrt(strength), Math.sin(angle) * out + fz * forward,
        0.7 + rand() * 0.7, 0.45 + rand() * 0.9, 34, ParticleKind.Droplet
      );
    }
    const sheet = Math.round(26 * strength);
    for (let i = 0; i < sheet; i++) {
      spawnParticle(
        x + (rand() - 0.5) * 2, 0.4, z + (rand() - 0.5) * 2,
        (rand() - 0.5) * 2.5, (10 + rand() * 9) * Math.sqrt(strength), (rand() - 0.5) * 2.5,
        0.6 + rand() * 0.5, 0.7 + rand() * 1.1, 30, ParticleKind.Droplet
      );
    }
    spawnFoam(x, z, 7 * strength, 3.2, 1);
    spawnFoam(x + fx * 4 * strength, z + fz * 4 * strength, 5 * strength, 2.4, 0.7);
    spawnRing(x, z, 10 * strength, 2.6, 0.8);
  },

  /** A dolphin breathing at the surface: a small soft puff of mist and a little foam. */
  breath(x: number, y: number, z: number) {
    for (let i = 0; i < 14; i++) {
      spawnParticle(
        x + (rand() - 0.5) * 0.8, Math.max(y, 0.4), z + (rand() - 0.5) * 0.8,
        (rand() - 0.5) * 1.2, 3.5 + rand() * 3, (rand() - 0.5) * 1.2,
        1.2 + rand() * 0.8, 1.6 + rand() * 1.6, 2.2, ParticleKind.Mist
      );
    }
    spawnFoam(x, z, 2.5, 1.6, 0.5);
  },

  /** A faint wake behind something moving fast near the surface: a streak of foam. */
  wake(x: number, z: number) {
    spawnFoam(x, z, 2.2, 1.4, 0.45);
  },

  /** A small, quiet disturbance: a gull's bill going under, a landing. */
  ripple(x: number, z: number, size = 4, strength = 0.6) {
    spawnRing(x, z, size, 2.2, strength);
    spawnFoam(x, z, size * 0.35, 1.2, strength * 0.5);
  },
};

/** Advances every particle, foam patch and ring; called once per frame by WaterFx. */
export function stepWaterFx(dt: number) {
  const p = particles;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (p.life[i] <= 0) continue;
    p.life[i] -= dt;
    const k = i * 3;
    p.velocity[k + 1] -= p.gravity[i] * dt;
    const drag = p.kind[i] === ParticleKind.Droplet ? 0.4 : 1.5;
    p.velocity[k] *= 1 - drag * dt;
    p.velocity[k + 2] *= 1 - drag * dt;
    p.position[k] += p.velocity[k] * dt;
    p.position[k + 1] += p.velocity[k + 1] * dt;
    p.position[k + 2] += p.velocity[k + 2] * dt;
    if (p.kind[i] === ParticleKind.Droplet && p.position[k + 1] < 0) p.life[i] = 0;
  }
  for (let i = 0; i < MAX_FOAM; i++) if (foam.age[i] < foam.life[i]) foam.age[i] += dt;
  for (let i = 0; i < MAX_RINGS; i++) if (rings.age[i] < rings.life[i]) rings.age[i] += dt;
}
