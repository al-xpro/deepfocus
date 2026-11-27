<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# DeepFocus: rules for agents

DeepFocus is a concept landing page for a **fictional** focus app, over a real-time 3D
ocean whose sky follows the clock. Designed and developed by AlxPro. Never present the
product, its waitlist or its copy as real.

## Commands

```bash
npm run dev         # http://localhost:3000
npm run typecheck   # next typegen && tsc --noEmit
npm run lint
npm run build
```

Run typecheck, lint and build before every commit. CI runs the same three.

## Where things live

```text
app/                    layout, metadata, the one page
components/             interface: page, panels, sound, loader
components/scene/       the 3D scene (React Three Fiber)
  OceanScene.tsx        sky, environment map, haze, stars, moon, sun, camera
  Ocean.tsx             the water
  SceneEncounters.tsx   lights; mounts the landscape, the dolphins, the gulls, the water effects
  landscape.tsx         placed models: promontory, reef and its palms, rocks, the volcano
  dolphins/             the pod: brain.ts (pure behavior, tested) and Dolphins.tsx
  life/Gulls.tsx        seagulls: fly-bys, feeding on the water, perching on the rocks
  fx/                   water contact: spray, foam, ripples (pools and their renderer)
  sceneFrame.ts         the snapshot for this frame, where the view looks, the haze color
  sceneConfig.ts        day, twilight and night values for every scene parameter
  timeUtils.ts          sun position and the scene snapshot for a moment
  sceneParams.ts        the time override (and, later, place and weather)
public/models/          glTF models (third-party, see CREDITS.md)
```

## Rules

- **Third-party assets:** add only assets whose license allows a public repository and a
  portfolio site. Prefer CC0 and CC BY; never add NonCommercial (NC) or "editorial use"
  assets on your own. The only NC assets are the dolphin (CC BY-NC) and the seagull
  (CC BY-NC-SA), kept by the maintainer's decision because DeepFocus is non-commercial; a
  ShareAlike asset's modified copy keeps its license. List every asset in `CREDITS.md`:
  title, author, source URL, license, and what was changed.
- **Nature only:** the scene shows the sea, the sky, the land and its flora and fauna.
  No buildings, boats, lighthouses or other man-made objects.
- **Models:** give every model a budget in `scripts/optimize-models.mjs` and run it
  (simplify, meshopt, WebP) before adding the model; state its triangle count and size in
  the pull request. Distant objects need a few percent of a source model's triangles.
  The scene is about 2.8 MB of models (brotli) and 146K triangles in the files; most of
  it is the promontory, which keeps its texture. Anything new has to justify its weight.
- **The frame loop:** no allocations inside `useFrame` (reuse vectors, colors and
  arrays), and no React state updates per frame. Read the scene snapshot; don't recompute
  it per component.
- **No third-party requests before the visitor acts:** no trackers, no embeds, no CDN
  scripts on load. Self-host fonts, decoders and media.
- **Accessibility:** one focus style on `:focus-visible`; every control has a name that
  says what it does; panels close on Escape and return focus; respect
  `prefers-reduced-motion`; text contrast AA in day and night states.
- **Interface copy and comments in English.**
- **Secrets:** environment variable names only, never values. `.env*` files are never
  committed.

## How changes are made

- Every change goes through a pull request; nothing is pushed to `main` directly, and
  nothing is force-pushed. Only the maintainer merges, by squash (the ruleset on `main`
  allows nothing else).
- Branch per issue: `feat/12-control-dock`, `fix/18-time-panel-escape`.
- Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`,
  `style`), with a `Co-Authored-By` trailer on commits drafted with an agent.
- Pull requests use the template (What, Why, How to test, Screenshots) and `Closes #n`.
