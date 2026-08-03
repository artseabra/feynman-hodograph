# Feynman Hodograph

An Ifthis browser instrument for seeing the link between a Kepler orbit in
position space and its circular velocity-space hodograph. It is a spatial,
interactive reconstruction for learning and exploration—not a claim to replace
or reproduce Feynman's original lecture.

## Local development

```sh
npm install
npm run dev
```

```sh
npm test
npm run build
```

The deployment target is a static Vite build (`dist/`). It is live at
[feynman-hodograph.vercel.app](https://feynman-hodograph.vercel.app), with the
connected GitHub `main` branch serving as production.

## Interaction

- Drag to orbit the linked construction.
- Shift-drag or right-drag to pan.
- Scroll or pinch to dolly.
- Use the Camera dock for canonical proof, front, overhead, and side views.
- **Orbit with Planet** and **Orbit with Hodograph** are companion cameras:
  they travel with the selected moving point, while local orbit, pan, and
  dolly remain available. Any canonical view returns to the free camera.
- Sound is opt-in. The potential field, velocity field, and resonant marks are
  derived from the normalized Kepler state; exact equal-time crossings and the
  two apsides trigger events. It is interpretive sonification, not an
  astronomical recording.

## Mathematical and historical note

The position state uses the standard elliptic Kepler parameterization
`x = cos(E) - e`, `y = sqrt(1-e²) sin(E)` with `M = E - e sin(E)`. The velocity
state traces a circle after the corresponding scaling and offset. The
interpretive framing follows David and Judith Goodstein's reconstruction in
*Feynman's Lost Lecture: The Motion of Planets Around the Sun*; the hodograph
result itself predates Feynman and is associated with Hamilton (1846).

## Public boundary

The original supplied one-shot HTML is preserved only in the local ignored
`provenance/` directory. This repository contains the clean instrument source,
not an archive dump. Copyright is retained; see [LICENSE](LICENSE).
