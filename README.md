# Feynman Hodograph

An Ifthis browser instrument for seeing the link between a Kepler orbit in
position space and its circular velocity-space hodograph. It is a spatial,
interactive reconstruction for learning and exploration—not a claim to replace
or reproduce Feynman's original lecture.

This is an independent educational project by Art Seabra / Ifthis. It is not
affiliated with or endorsed by Caltech, *The Feynman Lectures on Physics*, or
the Richard P. Feynman fan account.

## Local development

```sh
npm install
npm run dev
```

```sh
npm test
npm run build
```

The deployment target is a static Vite build (`dist/`). The current production
URL is [feynman-hodograph.vercel.app](https://feynman-hodograph.vercel.app).
Local changes do not affect it until an intentional GitHub/Vercel publish.

## Interaction

- Drag to orbit the linked construction.
- Shift-drag or right-drag to pan.
- Scroll normally to move through the page. After choosing **Enter canvas** (or
  interacting with the construction), plain scroll and pinch dolly the canvas;
  click outside the stage to return scroll to the page.
- Use the masthead layout control to move between the **Merged** shared-origin
  construction and the earlier **Separated** editorial arrangement. The Camera
  dock retains **Spatial**, **Centered**, literal **Overhead**, and literal
  **Side** views. Manual camera movement marks the current composition as Custom.
- **Sun**, **Planet**, and **Velocity** are body-relative cameras. **Free**
  releases tracking without replacing the current world-camera orientation;
  any fixed view also releases tracking and refits the active construction
  layout from a deterministic target.
- Sound is opt-in and split into three explicit stems: normalized 1/r² raises
  the intensity and spectral opening of a fixed-pitch Gravity field, the
  hodograph maps velocity-vector phase to four stationary resonators, and exact
  equal-time crossings plus apsides make audible marks. It is interpretive
  sonification, not an astronomical recording.

## Mathematical and historical note

The position state uses the standard elliptic Kepler parameterization
`x = cos(E) - e`, `y = sqrt(1-e²) sin(E)` with `M = E - e sin(E)`. The velocity
state traces a circle after the corresponding scaling and offset. The
interpretive framing follows David and Judith Goodstein's reconstruction in
[*Feynman's Lost Lecture: The Motion of Planets Around the Sun*](https://calteches.library.caltech.edu/3822/).
Their account explains that the 1964 special lecture survived as a tape, sparse
notes, and one known photograph of the lecture, was omitted from the final 1965
volume, and was later reconstructed from those fragments and historical source
pages. The local review build includes the exact eight-page Goodstein PDF and
clearly labels its historical artifacts separately from this contemporary 3D
translation. The hodograph result itself predates Feynman and is associated
with Hamilton (1846).

## Narration

The ready-to-paste narration is in
[`narration/elevenlabs-hodograph.md`](narration/elevenlabs-hodograph.md).

The supplied Alistair narration is embedded in the story with a native,
keyboard-accessible custom player. Its source is
`public/audio/feynman-lost-lecture-alistair.mp3`; it does not require an
ElevenLabs account, external player script, or network request.

## Open-source and public boundary

The original supplied one-shot HTML is preserved only in the local ignored
`provenance/` directory. This repository contains the clean instrument source,
not an archive dump.

The software, project-authored interface graphics, and project documentation
are open source under the [MIT License](LICENSE). The narration recording and
locally held historical source reproductions are not included in that grant;
see [ASSET_LICENSE.md](ASSET_LICENSE.md). `public/sources/` remains ignored and
is also excluded from Vercel uploads as a mechanical publication-rights guard.
