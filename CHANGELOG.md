# Changelog

All notable changes to this project, newest first. Versions follow
[semver](https://semver.org).

## Unreleased

### Added

- README, license, code of conduct, contributing guide, security policy, support and
  credits for every third-party asset.
- Issue and pull request templates, Dependabot (security fixes grouped into one pull
  request), Dependabot auto-merge for minor and patch updates, and CI (typecheck, lint,
  build).
- A control dock: the scene time, the ocean sound and focus mode.
- Panels built on Radix: a popover on desktop, a bottom sheet on phones; Escape closes
  them and focus returns to the trigger.
- A time panel with Live and Custom, a 24-hour scrubber and four presets.
- Focus mode (`F`) and focus sessions of 15, 25 or 50 minutes.
- A self-hosted CC0 ocean ambience, played through Web Audio, loaded on demand.
- A credits panel; "Drag to look around", once; the view eases home after 30 s idle.
- Reduced motion: no entrance animations, a fade instead of the particles, no shooting
  stars, no leaps, no camera easing.

### Changed

- Next.js 16.2.1 → 16.4.5 (security fixes).
- A new interface (v1.1, #12–#18): Apple-style glass in sync with the scene (white by
  day, black at dawn, dusk and night, tinted by the scene's light), DM Sans throughout,
  ultra-minimal copy, one keyboard focus ring, text contrast AA at every time of day, and
  the DeepFocus name and a new mark everywhere.
- The loader is gone: the sky and the sea draw at once and each model fades in as it
  arrives, with a thin progress line.

### Fixed

- Lint errors: typed the YouTube player instead of `any`, and the time panel no longer
  sets state inside effects.

### Removed

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
