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

### Changed

- Next.js 16.2.1 → 16.4.5 (security fixes).
- A new look (#12): Apple-style glass over the scene that darkens as the sky brightens,
  Instrument Serif for the headline and Geist for the interface, one keyboard focus ring,
  text contrast AA at every time of day, and the DeepFocus name everywhere.

### Fixed

- Lint errors: typed the YouTube player instead of `any`, and the time panel no longer
  sets state inside effects.

### Removed

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
