// Third-party work used on the page, shown in the Credits panel. Keep it in
// sync with CREDITS.md, which also lists what was changed.

export interface Credit {
  title: string;
  author: string;
  source: string;
  license: string;
  licenseUrl?: string;
}

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

export const CREDITS: Array<{ group: string; items: Credit[] }> = [
  {
    group: "3D models",
    items: [
      {
        title: "Rock, reef, promontory, mountain, coast, seaside",
        author: "Metazeon",
        source: "https://sketchfab.com/3d-models/rock-reef-promontory-mountain-coast-seaside-545fb84cd03b48bc8823475a0c620b8d",
        license: "CC BY 4.0",
        licenseUrl: CC_BY,
      },
      {
        title: "Rock, reef, beaches, seaside, small island",
        author: "Metazeon",
        source: "https://sketchfab.com/3d-models/rock-reef-beaches-seaside-small-island-414de6175f2d4a1d8e2cb5e7d11ca2d7",
        license: "CC BY 4.0",
        licenseUrl: CC_BY,
      },
      {
        title: "Free cliff rock",
        author: "Kwinto",
        source: "https://sketchfab.com/3d-models/free-cliff-rock-75fb6b34dc0d46259dedc8c7cd94e7b7",
        license: "CC BY 4.0",
        licenseUrl: CC_BY,
      },
      {
        title: "Cliffs",
        author: "DJMaesen",
        source: "https://sketchfab.com/3d-models/cliffs-14fe5023840146179c8515093e88fae0",
        license: "CC BY 4.0",
        licenseUrl: CC_BY,
      },
      {
        title: "Cliff",
        author: "DJMaesen",
        source: "https://sketchfab.com/3d-models/cliff-082da1166a814c6e9c9e6c1b38159e4e",
        license: "CC BY 4.0",
        licenseUrl: CC_BY,
      },
      {
        title: "Volcano",
        author: "k3ddesign",
        source: "https://sketchfab.com/3d-models/volcano-0aa90a20d5cb47de90ec5d1bcd5aff31",
        license: "CC BY 4.0",
        licenseUrl: CC_BY,
      },
      {
        title: "Palm Trees",
        author: "ElectroNick",
        source: "https://sketchfab.com/3d-models/palm-trees-20f8a8d5054b4191afb7cf3270dbd586",
        license: "CC BY 4.0",
        licenseUrl: CC_BY,
      },
      {
        title: "Model 61A, Bottlenose Dolphin",
        author: "DigitalLife3D",
        source: "https://sketchfab.com/3d-models/model-61a-bottlenose-dolphin-2ec20f15b08c4c2fb16e4df5d837b893",
        license: "CC BY-NC 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
      },
      {
        title: "Seagull",
        author: "kenchoo",
        source: "https://sketchfab.com/3d-models/seagull-1d3b3cea037f4fb3bc9fbd72013bb94a",
        license: "CC BY-NC-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      },
    ],
  },
  {
    group: "Data",
    items: [
      {
        title: "Weather data",
        author: "Open-Meteo.com",
        source: "https://open-meteo.com/",
        license: "CC BY 4.0",
        licenseUrl: CC_BY,
      },
    ],
  },
  {
    group: "Sound",
    items: [
      {
        title: "Small Waves Back to the Ocean",
        author: "Joseph Sardin, BigSoundBank",
        source: "https://bigsoundbank.com/small-waves-back-to-the-ocean-s1047.html",
        license: "CC0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    ],
  },
  {
    group: "Water, sky, code and type",
    items: [
      {
        title: "Water normals, Sky and Water",
        author: "three.js authors",
        source: "https://github.com/mrdoob/three.js",
        license: "MIT",
        licenseUrl: "https://github.com/mrdoob/three.js/blob/dev/LICENSE",
      },
      {
        title: "Sun position formulas (SunCalc)",
        author: "Vladimir Agafonkin",
        source: "https://github.com/mourner/suncalc",
        license: "BSD 2-Clause",
        licenseUrl: "https://github.com/mourner/suncalc/blob/master/LICENSE",
      },
      {
        title: "Draco decoder",
        author: "Google",
        source: "https://github.com/google/draco",
        license: "Apache 2.0",
        licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
      },
      {
        title: "DM Sans",
        author: "Colophon Foundry",
        source: "https://fonts.google.com/specimen/DM+Sans",
        license: "SIL OFL 1.1",
        licenseUrl: "https://openfontlicense.org",
      },
    ],
  },
];
