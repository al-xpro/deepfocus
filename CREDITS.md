# Credits

DeepFocus is a fictional product. This concept site was designed and developed by
[AlxPro](https://alxpro.com). The third-party material it uses is listed here, with its
license.

## 3D models

All from [Sketchfab](https://sketchfab.com). Changes to every model, made by
`scripts/optimize-models.mjs` (glTF-Transform and meshoptimizer): simplified to a triangle
budget, geometry compressed with meshopt, textures resized and converted to WebP; then
scaled and placed in the scene, with material color, roughness and environment intensity
adjusted at runtime. Further changes: the reef has its texture baked into vertex colors (no
texture); the promontory's scan pieces are joined and their near-identical vertices snapped
together before simplifying (closing the gaps between scan patches), its emissive color is
removed and it's drawn double-sided; the volcano is recentered and its emissive color
removed; the palms' fronds are alpha-tested instead of blended; the palms' fronds and
trunks sway in a wind added in a shader, and the seagull's wings and legs are posed (folded,
tucked, lowered) on top of its own animation.

| File | Model | Author | License |
| --- | --- | --- | --- |
| `public/models/promontory.glb` | ["Rock, reef, promontory, mountain, coast, seaside"](https://sketchfab.com/3d-models/rock-reef-promontory-mountain-coast-seaside-545fb84cd03b48bc8823475a0c620b8d) | [Metazeon](https://sketchfab.com/Metazeon) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/rock_reef.glb` | ["Rock, reef, beaches, seaside, small island"](https://sketchfab.com/3d-models/rock-reef-beaches-seaside-small-island-414de6175f2d4a1d8e2cb5e7d11ca2d7) | [Metazeon](https://sketchfab.com/Metazeon) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/cliff_rock.glb` | ["Free_cliff_rock"](https://sketchfab.com/3d-models/free-cliff-rock-75fb6b34dc0d46259dedc8c7cd94e7b7) | [Kwinto](https://sketchfab.com/kwinto) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/group_of_cliff_1.glb` | ["Cliffs"](https://sketchfab.com/3d-models/cliffs-14fe5023840146179c8515093e88fae0) | [DJMaesen](https://sketchfab.com/bumstrum) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/group_of_cliff_2.glb` | ["Cliff"](https://sketchfab.com/3d-models/cliff-082da1166a814c6e9c9e6c1b38159e4e) | [DJMaesen](https://sketchfab.com/bumstrum) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/volcano.glb` | ["Volcano"](https://sketchfab.com/3d-models/volcano-0aa90a20d5cb47de90ec5d1bcd5aff31) | [k3ddesign](https://sketchfab.com/K3DDesign) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/palm_trees.glb` | ["Palm Trees"](https://sketchfab.com/3d-models/palm-trees-20f8a8d5054b4191afb7cf3270dbd586) | [ElectroNick](https://sketchfab.com/ElectroNick) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/dolphin.glb` | ["Model 61A - Bottlenose Dolphin"](https://sketchfab.com/3d-models/model-61a-bottlenose-dolphin-2ec20f15b08c4c2fb16e4df5d837b893) | [DigitalLife3D](https://sketchfab.com/DigitalLife3D) | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| `public/models/seagull.glb` | ["Seagull"](https://sketchfab.com/3d-models/seagull-1d3b3cea037f4fb3bc9fbd72013bb94a) | [kenchoo](https://sketchfab.com/kenchoo) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |

The dolphin and the seagull are under NonCommercial licenses: DeepFocus is a non-commercial
concept (no ads, sales or sign-ups). The seagull's license is also ShareAlike: the modified
copy in this repository, `public/models/seagull.glb`, is shared under the same license,
CC BY-NC-SA 4.0.

The water effects (spray, foam, ripples) and the volcano's plume and crater glow are built
in code for this project.

## Textures

- `public/textures/waternormals.jpg`: the water normal map from the
  [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures),
  © three.js authors, [MIT License](https://github.com/mrdoob/three.js/blob/dev/LICENSE).

## Sound

- `public/audio/ocean.m4a`: ["Small Waves Back to the Ocean"](https://bigsoundbank.com/small-waves-back-to-the-ocean-s1047.html)
  by Joseph Sardin, [BigSoundBank](https://bigsoundbank.com),
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Changes: cut to an 80-second
  seamless loop (the last 6 seconds crossfaded into the start), raised by 7 dB, encoded
  as AAC. The bell at the end of a focus session is synthesized in the browser.

## Code

- The sky and the water are three.js's `Sky` and `Water` objects from
  [`three/examples/jsm`](https://github.com/mrdoob/three.js/tree/dev/examples/jsm),
  [MIT License](https://github.com/mrdoob/three.js/blob/dev/LICENSE).
- The sun-position formulas in `components/scene/timeUtils.ts` follow
  [SunCalc](https://github.com/mourner/suncalc) by Vladimir Agafonkin,
  [BSD 2-Clause License](https://github.com/mourner/suncalc/blob/master/LICENSE).
- `public/draco/`: Google's [Draco](https://github.com/google/draco) decoder, copied
  unchanged from three.js and self-hosted,
  [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) (copy in
  `public/draco/LICENSE.txt`).

## Fonts

- [DM Sans](https://fonts.google.com/specimen/DM+Sans) by Colophon Foundry, under the
  [SIL Open Font License 1.1](https://openfontlicense.org), self-hosted at build time by
  `next/font`.

## Original work

Everything else (the code, the copy, the DeepFocus mark and icons, and the screenshots
in `.github/assets/`) was made for this project by AlxPro.
