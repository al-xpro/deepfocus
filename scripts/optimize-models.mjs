// Simplifies and compresses the 3D models in public/models, in place.
//
//   node scripts/optimize-models.mjs            all models
//   node scripts/optimize-models.mjs volcano    one model
//
// Each model has a triangle budget and a texture size. The script is safe to
// run again: a model already under its budget isn't simplified further.
// Geometry is compressed with meshopt (EXT_meshopt_compression), textures with
// WebP. The originals stay in the git history and on Sketchfab (CREDITS.md).

import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { center, compactPrimitive, dedup, flatten, getBounds, join, meshopt, prune, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const DIR = path.resolve("public/models");

const BUDGETS = {
  // The main landmark keeps its texture: simplified across texture seams
  // ("permissive"), weighing how far UVs and normals move, so it still reads as
  // a wooded island, with no holes. No emissive glow (it lit up at night).
  "promontory.glb": { triangles: 70_000, texture: 1024, permissive: true, noEmissive: true },
  // The reef is low and far: its texture is baked into vertex colors (no seams,
  // a clean simplification, no texture to download).
  "rock_reef.glb": { triangles: 20_000, texture: 0, bake: true },
  // Active: its lava streaks become an emissive texture that glows at night; and
  // it's recentered, since its summit sat far from its origin.
  "volcano.glb": { triangles: 10_000, texture: 512, lava: true, recenter: true },
  "cliff_rock.glb": { triangles: 6_000, texture: 512 },
  "group_of_cliff_1.glb": { triangles: 2_500, texture: 512 },
  "group_of_cliff_2.glb": { triangles: 4_000, texture: 512 },
  "dolphin.glb": { triangles: 15_000, texture: 1024 },
  "blue_whale.glb": { triangles: 8_000, texture: 1024 },
};

function countTriangles(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute("POSITION");
      triangles += (indices ? indices.getCount() : position?.getCount() ?? 0) / 3;
    }
  }
  return Math.round(triangles);
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Replaces each primitive's base color texture with vertex colors sampled from
 * it (a 3×3 average), then merges vertices that share a position, so the mesh
 * has no texture seams left. Normals are recomputed after simplification.
 */
async function bakeToVertexColors(document) {
  const buffer = document.getRoot().listBuffers()[0];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      const texture = material?.getBaseColorTexture();
      const uv = primitive.getAttribute("TEXCOORD_0");
      const position = primitive.getAttribute("POSITION");
      if (!material || !texture || !uv || !position) continue;

      const { data, info } = await sharp(Buffer.from(texture.getImage()))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const factor = material.getBaseColorFactor();
      const count = uv.getCount();
      const colors = new Float32Array(count * 3);
      const el = [0, 0];
      for (let i = 0; i < count; i++) {
        uv.getElement(i, el);
        const u = el[0] - Math.floor(el[0]);
        const v = el[1] - Math.floor(el[1]);
        const cx = Math.min(info.width - 1, Math.floor(u * info.width));
        const cy = Math.min(info.height - 1, Math.floor(v * info.height));
        const sum = [0, 0, 0];
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.min(info.width - 1, Math.max(0, cx + dx));
            const y = Math.min(info.height - 1, Math.max(0, cy + dy));
            const k = (y * info.width + x) * 4;
            sum[0] += data[k];
            sum[1] += data[k + 1];
            sum[2] += data[k + 2];
            n++;
          }
        }
        for (let c = 0; c < 3; c++) colors[i * 3 + c] = srgbToLinear(sum[c] / n / 255) * factor[c];
      }
      // Samples that land on the atlas's white padding show as white specks:
      // replace near-white ones with the median color of the mesh.
      const luminance = (i) => 0.2126 * colors[i * 3] + 0.7152 * colors[i * 3 + 1] + 0.0722 * colors[i * 3 + 2];
      const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => luminance(a) - luminance(b));
      const median = order[Math.floor(count / 2)];
      const limit = Math.min(0.45, luminance(median) * 2.2);
      for (let i = 0; i < count; i++) {
        if (luminance(i) <= limit) continue;
        for (let c = 0; c < 3; c++) colors[i * 3 + c] = colors[median * 3 + c];
      }
      primitive.setAttribute(
        "COLOR_0",
        document.createAccessor().setType("VEC3").setArray(colors).setBuffer(buffer)
      );
      for (const semantic of primitive.listSemantics()) {
        if (semantic !== "POSITION" && semantic !== "COLOR_0") primitive.setAttribute(semantic, null);
      }

      // Merge vertices within 0.05 units: the texture seams are gone, and the
      // scan's chunks (each compressed on its own grid) meet without cracks.
      const positions = position.getArray();
      const grid = 20;
      const vertexCount = position.getCount();
      const remap = new Uint32Array(vertexCount);
      const seen = new Map();
      let next = 0;
      for (let i = 0; i < vertexCount; i++) {
        const key = `${Math.round(positions[i * 3] * grid)},${Math.round(positions[i * 3 + 1] * grid)},${Math.round(positions[i * 3 + 2] * grid)}`;
        let index = seen.get(key);
        if (index === undefined) {
          index = next++;
          seen.set(key, index);
        }
        remap[i] = index;
      }
      compactPrimitive(primitive, remap, next);
    }
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      // No textures left, and no emissive glow (the scan's material had one,
      // which lit the island up at night). Double-sided, so the few holes left
      // by pruned fragments show rock instead of sky.
      material
        ?.setBaseColorTexture(null)
        .setNormalTexture(null)
        .setOcclusionTexture(null)
        .setMetallicRoughnessTexture(null)
        .setEmissiveTexture(null)
        .setEmissiveFactor([0, 0, 0])
        .setDoubleSided(true);
    }
  }
}

/**
 * Simplifies baked meshes toward a triangle budget, weighing the vertex colors
 * so color boundaries survive, and pruning fragments too small to see from far
 * away (a scan's loose foliage would otherwise set a floor on the count).
 */
function simplifyBaked(document, targetTriangles) {
  const primitives = document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const total = countTriangles(document);
  for (const primitive of primitives) {
    const indices = primitive.getIndices();
    const positions = primitive.getAttribute("POSITION")?.getArray();
    const colors = primitive.getAttribute("COLOR_0")?.getArray();
    if (!indices || !(positions instanceof Float32Array) || !(colors instanceof Float32Array)) continue;
    const source = new Uint32Array(indices.getArray());
    const target = Math.max(3, Math.floor(((targetTriangles * source.length) / 3 / total) * 3));
    let result = source;
    for (const error of [0.005, 0.01, 0.02, 0.05, 0.1]) {
      [result] = MeshoptSimplifier.simplifyWithAttributes(
        source, positions, 3, colors, 3, [0.4, 0.4, 0.4], null, target, error, ["Prune"]
      );
      if (result.length <= target * 1.1) break;
    }
    indices.setArray(result);
    compactPrimitive(primitive);
  }
}

/**
 * Smooth, area-weighted vertex normals on an indexed mesh. (glTF-Transform's
 * `normals()` makes flat normals by unwelding every triangle, which triples the
 * vertices and faces the rock.)
 */
function smoothNormals(document) {
  const buffer = document.getRoot().listBuffers()[0];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices()?.getArray();
      const positions = primitive.getAttribute("POSITION")?.getArray();
      if (!indices || !positions) continue;
      const normals = new Float32Array(positions.length);
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
        const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const k of [a, b, c]) {
          normals[k] += nx;
          normals[k + 1] += ny;
          normals[k + 2] += nz;
        }
      }
      for (let k = 0; k < normals.length; k += 3) {
        const length = Math.hypot(normals[k], normals[k + 1], normals[k + 2]) || 1;
        normals[k] /= length;
        normals[k + 1] /= length;
        normals[k + 2] /= length;
      }
      primitive.setAttribute(
        "NORMAL",
        document.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer)
      );
    }
  }
}

/**
 * Simplifies a textured mesh across its texture seams, weighing how far the UVs
 * and normals move, so the result keeps its look without holes.
 */
function simplifyTextured(document, targetTriangles) {
  const primitives = document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const total = countTriangles(document);
  for (const primitive of primitives) {
    const indices = primitive.getIndices();
    const positions = primitive.getAttribute("POSITION")?.getArray();
    const uv = primitive.getAttribute("TEXCOORD_0")?.getArray();
    const normal = primitive.getAttribute("NORMAL")?.getArray();
    if (!indices || !(positions instanceof Float32Array) || !uv || !normal) continue;
    const count = positions.length / 3;
    const attributes = new Float32Array(count * 5);
    for (let i = 0; i < count; i++) {
      attributes[i * 5] = uv[i * 2];
      attributes[i * 5 + 1] = uv[i * 2 + 1];
      attributes[i * 5 + 2] = normal[i * 3];
      attributes[i * 5 + 3] = normal[i * 3 + 1];
      attributes[i * 5 + 4] = normal[i * 3 + 2];
    }
    const source = new Uint32Array(indices.getArray());
    const target = Math.max(3, Math.floor(((targetTriangles * source.length) / 3 / total) * 3));
    let result = source;
    for (const error of [0.005, 0.01, 0.02, 0.04]) {
      [result] = MeshoptSimplifier.simplifyWithAttributes(
        source, positions, 3, attributes, 5, [1, 1, 0.3, 0.3, 0.3], null, target, error, ["Permissive"]
      );
      if (result.length <= target * 1.1) break;
    }
    indices.setArray(result);
    compactPrimitive(primitive);
  }
}

/** The lava: an emissive texture from the base color's red streaks. */
async function addLavaGlow(document) {
  for (const material of document.getRoot().listMaterials()) {
    const base = material.getBaseColorTexture();
    const image = base?.getImage();
    if (!image) continue;
    const { data, info } = await sharp(Buffer.from(image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const glow = Buffer.alloc(info.width * info.height * 3);
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const lava = r > 120 && r > g * 1.45 && r > b * 1.45;
      glow[i * 3] = lava ? 255 : 0;
      glow[i * 3 + 1] = lava ? Math.round(110 * (r / 255)) : 0;
      glow[i * 3 + 2] = lava ? 24 : 0;
    }
    const png = await sharp(glow, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 85 }).toBuffer();
    const texture = document.createTexture("lava").setImage(png).setMimeType("image/webp");
    material.setEmissiveTexture(texture).setEmissiveFactor([1, 1, 1]);
  }
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const only = process.argv[2];
const rows = [];

for (const [file, budget] of Object.entries(BUDGETS)) {
  if (only && !file.startsWith(only)) continue;
  const filePath = path.join(DIR, file);
  const before = (await import("node:fs")).statSync(filePath).size;
  const document = await io.read(filePath);
  const trianglesBefore = countTriangles(document);

  // Decoded on read: drop Draco, meshopt replaces it on write.
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === "KHR_draco_mesh_compression") extension.dispose();
  }

  await document.transform(dedup(), weld());

  if (budget.recenter) {
    const { min, max } = getBounds(document.getRoot().listScenes()[0]);
    await document.transform(center({ pivot: [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2] }));
  }


  if (budget.bake || budget.permissive) {
    // One mesh instead of the scan's chunks, so the chunk borders weld too.
    await document.transform(flatten(), join({ keepNamed: false }));
  }
  if (budget.bake) {
    await bakeToVertexColors(document);
    simplifyBaked(document, budget.triangles);
  }
  if (budget.permissive && countTriangles(document) > budget.triangles * 1.1) {
    await document.transform(weld());
    simplifyTextured(document, budget.triangles);
  }
  if (budget.noEmissive) {
    for (const material of document.getRoot().listMaterials()) {
      material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
    }
  }
  if (budget.lava) await addLavaGlow(document);

  // Simplify toward the budget, allowing a little more error each pass if needed.
  for (const error of [0.01, 0.03, 0.08]) {
    const current = countTriangles(document);
    if (current <= budget.triangles * 1.1) break;
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: budget.triangles / current, error })
    );
  }

  if (budget.bake) smoothNormals(document);

  await document.transform(
    resample(),
    prune(),
    ...(budget.texture
      ? [textureCompress({ encoder: sharp, targetFormat: "webp", resize: [budget.texture, budget.texture], quality: 82 })]
      : []),
    meshopt({ encoder: MeshoptEncoder, level: "medium" })
  );

  await io.write(filePath, document);
  const after = (await import("node:fs")).statSync(filePath).size;
  rows.push({
    file,
    triangles: `${trianglesBefore} → ${countTriangles(document)}`,
    size: `${(before / 1e6).toFixed(2)} → ${(after / 1e6).toFixed(2)} MB`,
  });
}

console.table(rows);
