# Ambient Orchestra

A procedural ambient synth orchestra with a layered monochrome visual field. Dozens of generative voices blend in and out of a slowly evolving harmonic field — no loops, no drums, no grid — paired with an audio-reactive ink-and-tube visual that drifts in and out of focus.

Inspired by the idea that good ambient music flows in and out of interest within a space — Eno by way of Floating Points, Bicep, Aphex Twin, Caribou, and Nosaj Thing.

## Features

### Audio

- **24 generative voices** — 19 synth voices (beds, melody, shimmer, air, flurry, plus a felt sub pulse and a granular texture) and 5 clip-based loop voices
- **Conductor + harmonic field** — Markov mode shifts, chord pools, dream melody phrases with recall, ensemble gestures
- **Conductor Skill (autonomous)** — a creative-direction layer over the technical conductor: shapes a session-wide **intensity arc** and a per-phase **stereo image** (intimate in drift/exhale, enveloping in bloom/hang)
- **Movement arc** — six phases per movement (Heat Haze → Gather → Bloom → Hang → Morph → Exhale) with a bar-synced clock
- **Phrase-aligned automation** — autonomous knob drift locks to 8/16-bar boundaries and moves in coordinated clusters, so the piece reads as sections rather than arrhythmic drift
- **Flourishes throughout** — sparkle runs and melodic flurries recur on a cadence that ebbs and flows within each movement (denser in bloom/hang, sparser in the troughs)
- **New textures** — a Bicep/Caribou-style felt sub **pulse** (bloom/hang) and Aphex/Nosaj-style **granular degradation** (dissolve/exhale)
- **HRTF binaural positioning** — select voices (distant bell, harmonic ghost, sparkle, flurry) are spatialised in true 3D with graceful stereo fallback
- **Master FX chain** — chorus, glue compression, delay, 14s reverb, stereo widener, tilt EQ, limiter
- **FFT analysis** — bass / mids / highs / overall bands plus full spectrum for visual detail

### Visuals

- **Layered 3D field (Three.js)** — two render layers sharing one audio-driven breath:
  - **Ghosts** — hundreds of soft circular ink discs in two size classes, drifting through a 3D field with heavy trail persistence
  - **Bodies** — sparse milky tube extrusions with depth-pass shading
- **Art Director Skill (autonomous)** — a visual creative-direction layer: modulates **fog depth** per phase, drives **dreamlike focus arcs** (slow oscillation plus event-triggered snaps), shifts the **palette mood** with the harmony (warmer on tonic, cooler on tension), and triggers **constellation moments** on bloom
- **Ink-in-water trails** — a unified WebGL fade buffer accumulates ghost strokes into soft pools that slowly dissolve back into the field
- **Light / dark field** — pale `#ececec` default with dark charcoal ink; a luminous **dark field** on a deep blue-black `#08080f` ground, with bodies tinted to share the field's chroma
- **Breathe** — quiet passages retract; loud ensemble moments expand radius, length, and ghost density
- **Morphology** — shape blends continuously with movement phase (network / sphere / waveform paths); no hard form cuts
- **Audio-reactive** — FFT spectrum deforms tube paths and thickness; harmonic swell drives fog, camera, and pulse
- **Focus balance** — crossfade ghost vs body presence from 70/30 to 50/50 to 30/70

### UI

Two edge rails frame an open center, each pairing live data with the knobs that drive it:

- **Left rail — Audio:** movement / phase readout, a **cymatics panel** (scrolling waveform, beat markers, bass/mid/high spectrum, live key + mode + chord function, and a console-style ensemble meter), and the audio knob grid
- **Right rail — Visual:** form readout, a **visual scope** (particle population, ghost↔body layer balance, cool↔warm mood, fog depth), the theme toggle, and the visual knob grid
- **10 knobs** — six sound, four vision (see below)
- **Knob automator** — slow, phrase-aligned autonomous drift when you leave the controls alone
- **PerfMonitor** — a dev-only health gate (press **D**) reporting frame rate, audio-context health, console errors, and heap growth
- **Error overlay** — a clear message if WebGL or audio fails to start

## Requirements

- Node.js 18+
- A modern browser with WebGL (desktop Chrome, Firefox, or Safari)
- macOS, Windows, or Linux

## Development

```bash
npm install
npm run dev
```

Open **http://localhost:5173/** and click **Click to begin** to start audio.

## Production build

```bash
npm run build
npm run preview
```

Output goes to `dist/` with relative asset paths (`base: './'`) suitable for GitHub Pages, Netlify, Cloudflare Pages, etc. Three.js and Tone.js are split into separate vendor chunks for independent caching.

## Testing

```bash
npm test          # run once
npm run test:watch
```

Unit tests cover music theory helpers and harmonic field transitions.

## Controls

### Sound knobs

| Knob | Range | Effect |
|------|-------|--------|
| Warmth | Warm ↔ Bright | Tilt EQ and voice filter brightness |
| Space | Intimate ↔ Vast | Reverb, delay, stereo width, bus balance |
| Activity | Still ↔ Drifting | Voice change rate and harmonic event density |
| Memory | New ↔ Recall | Phrase recall weight in the harmonic field |
| Entropy | Stable ↔ Morph | Mode drift and timbral instability |
| Pulse | Calm ↔ Driving | Tempo modulation and delay feel |

### Vision knobs

| Knob | Range | Effect |
|------|-------|--------|
| Grain | Fine ↔ Dense | Ghost particle count and ink opacity |
| Ripple | Smooth ↔ Jagged | Path wobble, noise, spectrum ripples on bodies |
| Drift | Tight ↔ Mist | Trail length (ink persistence), field rotation, fog density |
| Focus | Ghosts ↔ Bodies | Layer balance: **70/30** (left) · **50/50** (center) · **30/70** (right) |

### Shortcuts & readout

| Input | Action |
|-------|--------|
| **Double-click** or **F11** | Hide / show both rails (full-bleed view) |
| **D** | Toggle the PerfMonitor health readout |
| **Light field / Dark field** | Toggle visual palette (right rail header) |
| **Mov** button | Advance movement phase |
| **Shift + Mov** | Skip to next movement |
| **Form** button | Nudge visual morphology emphasis |

## Tech stack

| Layer | Technology |
|-------|------------|
| App | Vite 6, TypeScript |
| Audio | Tone.js 15 |
| Visuals | Three.js, simplex-noise |
| Analysis | `Tone.Analyser` FFT (512 bins) |
| Tests | Vitest |

## Project structure

```
src/
  audio/          Conductor, ConductorSkill, HarmonicField, ConductorFx,
                  MusicalClock, voices, clips
  visual/         Visualizer, ArtDirectorSkill, FluidField, LayerBalance,
                  ScenePalette
  visual/three/   GhostField, ExtrusionField, TrailPass, ghost/milky shaders
  ui/             Controls, SessionReadout, CymaticsOverlay, VisualScope,
                  KnobAutomator, ThemeToggle
  diagnostics/    PerfMonitor
```

## Design notes

- No percussion — interest comes from harmonic color, texture, ensemble gestures, and the recurring flourishes
- Voices never all play at full volume simultaneously
- **Two creative roles:** the Conductor Skill directs the audio (intensity, stereo image, flourish cadence) and the Art Director Skill directs the visuals (fog, focus, mood, constellations) — both read the same shared harmonic context, so picture and sound stay in step
- **Visual palette:** strict depth-pass monochrome. Light field (`#ececec`) with dark ink ghosts is the default; dark field inverts to luminous ghosts on a deep `#08080f` ground, with bodies tinted into the same blue-black family
- **Ink-in-water:** ghosts deposit semi-transparent strokes into a fade buffer each frame; older ink slowly bleaches back toward the field color — Drift toward Mist lengthens the dissolve
- Ghosts carry motion and memory; bodies carry sculptural mass — **Focus** sets the mix

## License

MIT — see [LICENSE](./LICENSE).
