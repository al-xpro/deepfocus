# Changelog

All notable changes to this project, newest first. Versions follow
[semver](https://semver.org).

## Unreleased

### Added

- A living sea (v1.2, #31–#39): dolphins driven by a pure, tested behavior module (ballistic
  leaps, porpoising, breaches, breathing, formation by steering, active by day); spray,
  ripples, wakes and breath where they meet the water; a blue-green glow at night wherever
  the water is stirred; gulls that circle and dive; a fish school that boils at the surface;
  a rare whale that blows and breaches; palms on the reef; tap the water to send a ripple
  and call a dolphin over. `?life` in the URL brings the rare life on quickly.
- Round, twinkling stars; a haze tinted by the sky.
- Tests (Vitest) in CI.
- README, license, code of conduct, contributing guide, security policy, support and
  credits for every third-party asset.
- Issue and pull request templates, Dependabot (security fixes grouped into one pull
  request), Dependabot auto-merge for minor and patch updates, and CI (typecheck, lint,
  build).
- A control dock: the scene time, the ocean sound and focus mode.
- Panels: a Radix popover on desktop; on phones a bottom sheet that follows the field
  drawer on alxpro.com (drag anywhere, a short flick dismisses, focus stays inside).
  Escape closes both and focus returns to the trigger.
- A time panel with Live and Custom, a 24-hour scrubber and four presets.
- Focus mode (`F`) and focus sessions of 15, 30 or 60 minutes, shown as a progress bar
  (the countdown fades after a moment and returns on hover).
- A self-hosted CC0 ocean ambience, played through Web Audio, loaded on demand.
- A credits panel whose text fades at the edges while there's more to scroll; "Drag to look around", once; the view turns
  slowly and endlessly, pausing while dragged.
- A 404 page ("Lost at sea") over the night sea, and `llms.txt` for agents.
- Reduced motion: no entrance animations, a fade instead of the particles, no shooting
  stars, no leaps, no camera easing.

### Changed

- Lighter models (#30): from 9.5 MB and 2.26M triangles to 2.6 MB (brotli) and about 165K,
  simplified and compressed with meshopt by `scripts/optimize-models.mjs`. No Draco decoder
  any more.
- The volcano is far out on the horizon and active: a smoke plume that the scene lights,
  lava that glows at night. The promontory keeps its texture (simplified to 70K
  triangles). Material values sit inside their real ranges (the sea stacks no longer read
  as ice), and the dolphins avoid the models' real footprints. The scene's state is
  computed once per frame.
- Next.js 16.2.1 → 16.4.5 (security fixes).
- A new interface (v1.1, #12–#18): Apple-style glass in sync with the scene (white by
  day, black at dawn, dusk and night, tinted by the scene's light), DM Sans throughout,
  ultra-minimal copy, one keyboard focus ring, text contrast AA at every time of day, and
  the DeepFocus name and a new mark everywhere.
- A new loading panel, "Loading the ocean", on a soft gradient in the colors of the
  visitor's time (set before the first paint), until the whole scene has arrived.
- The scene fills the page: at least the screen and 34rem, so a phone held sideways
  scrolls a whole landscape instead of squashing it.
- The time choice (live or custom) is remembered, and the 404 page shows it too.

### Fixed

- Lint errors: typed the YouTube player instead of `any`, and the time panel no longer
  sets state inside effects.

### Removed

- The unused bloom settings and the `postprocessing` and `lil-gui` packages.
- `turtle.glb` (unused, non-commercial), the Draco decoder, and the unused
  `scripts/generate-scene-models.mjs`.
- The hidden YouTube player and its music (third-party requests on page load).
- The white loading overlay.
- `README_DETAILED.md`, replaced by `README.md`.

## v1.0 · 2026-11-25

The baseline: DeepFocus as it was built by hand, without AI coding agents, from 22 to 31
March 2026.

### Included

- A real-time 3D ocean in React Three Fiber: three.js water with reflections, a physically
  based sky, and an environment map that follows it.
- Time of day from the visitor's clock: day, twilight and night blend the sky, light,
  water and exposure. A time panel sets any hour.
- A night sky drawn from canvas textures: about 3,700 stars, constellation lines, shooting
  stars, a moon and a sun glow.
- Three dolphins with a behavior system: steering around rocks and each other, surface
  approaches, six kinds of leap, and pods that jump in sync.
- Coastal landmarks from Sketchfab models (a promontory, sea stacks, a reef, a volcano).
- A waitlist form whose text dissolves into particles on submit. It's a concept: nothing
  is sent.
- An ambient music toggle; the headline fades out while it plays.
- A loading screen with real progress.
