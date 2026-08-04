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

The deployment target is a static Vite build (`dist/`). The current production
URL is [feynman-hodograph.vercel.app](https://feynman-hodograph.vercel.app).
Local changes do not affect it until an intentional GitHub/Vercel publish.

## Interaction

- Drag to orbit the linked construction.
- Shift-drag or right-drag to pan.
- Scroll normally to move through the page. Use Option/Alt-scroll (or
  Ctrl-scroll) and pinch to dolly the canvas.
- Use the Camera dock for canonical proof, front, literal overhead, and
  literal side views.
- **Orbit with Sun**, **Planet**, and **Hodograph** are companion cameras:
  they pin the selected point beneath the camera while local orbit, pan, and
  dolly remain available. Any canonical view returns to the free camera.
- Sound is opt-in. The continuous potential field and resonant marks are
  derived from the normalized Kepler state; exact equal-time crossings and the
  two apsides trigger events. It is interpretive sonification, not an
  astronomical recording.

## Mathematical and historical note

The position state uses the standard elliptic Kepler parameterization
`x = cos(E) - e`, `y = sqrt(1-e²) sin(E)` with `M = E - e sin(E)`. The velocity
state traces a circle after the corresponding scaling and offset. The
interpretive framing follows David and Judith Goodstein's reconstruction in
[*Feynman's Lost Lecture: The Motion of Planets Around the Sun*](https://calteches.library.caltech.edu/3822/).
Their account explains that the 1964 special lecture survived as a tape and
sparse notes, was omitted from the final 1965 volume, and was later
reconstructed from the surviving material. The hodograph result itself
predates Feynman and is associated with Hamilton (1846).

## Narration

The ready-to-paste narration is in
[`narration/elevenlabs-hodograph.md`](narration/elevenlabs-hodograph.md).

The supplied Alistair narration is embedded in the story with a native,
keyboard-accessible custom player. Its source is
`public/audio/feynman-lost-lecture-alistair.mp3`; it does not require an
ElevenLabs account, external player script, or network request.

## Public boundary

The original supplied one-shot HTML is preserved only in the local ignored
`provenance/` directory. This repository contains the clean instrument source,
not an archive dump. Copyright is retained; see [LICENSE](LICENSE).
