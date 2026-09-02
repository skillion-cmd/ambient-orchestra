# Ambient Orchestra

A procedural ambient synth orchestra with a layered monochrome visual field. Dozens of generative voices blend in and out of a slowly evolving harmonic field, paired with an audio-reactive ink-and-tube visual that drifts in and out of focus.

Pieces run anywhere from forty-five seconds to a quarter of an hour, the layer holding the foreground rotates continuously, and about a third of them carry no beat at all — the ones that do can put a soft kit right at the front. There is always a second room playing next door; walking through the doorway is how one piece becomes the next.

Inspired by the idea that good ambient music flows in and out of interest within a space — Eno by way of Floating Points, Bicep, Aphex Twin, Caribou, and Nosaj Thing — and by the way the transition spaces at Paradiso blurred one room's set into another's.

## Features

### Audio

- **24 generative voices** — 19 synth voices (beds, melody, shimmer, air, flurry, plus a felt sub pulse and a granular texture) and 5 clip-based loop voices
- **Conductor + harmonic field** — Markov mode shifts, chord pools, dream melody phrases with recall, ensemble gestures
- **Conductor Skill (autonomous)** — a creative-direction layer over the technical conductor: shapes a session-wide **intensity arc** and a per-phase **stereo image** (intimate in drift/exhale, enveloping in bloom/hang)
- **Movement arc** — six phases per movement (Heat Haze → Gather → Bloom → Hang → Morph → Exhale) with a bar-synced clock
- **Duration classes** — every movement draws a length: `fragment` (45–95s), `short`, `standard`, `long`, or a rare `epic` of 12–15 minutes, held back until enough pieces have passed that arriving at one still means something. Phase timelines compress for a fragment and gain a third crest for the long forms
- **Foreground rotation** — a focus point wanders a ring of layers so pad, melody, air, sub and pulse trade the front of the mix continuously; whichever layer is nearest sits at full presence and the rest fall away to near-inaudible, without ever quite dropping out
- **The room next door** — a second generative engine in its own key, behind a lowpass wall and a distance send. A listener walk drifts toward it and back; crossing the threshold trades the two rooms
- **Pulse, sometimes** — a soft kit (euclidean kick, shaker and woody click, swung and humanised) on its own dry bus, on the movements that draw one
- **Night pieces (Burial)** — about a fifth of movements come up as a night piece: a 2-step shuffle at 128–140 where the kick lands on the one and then skips the third beat, a flat backbeat against it, hats filling the gaps unevenly, minor-weighted harmony, and vinyl surface noise running the whole way through. Timing offsets are fixed per pattern rather than jittered per hit — sequenced by eye, so the same hits land in the same wrong places every bar
- **Night pulls the field dark** — a night piece switches the visual field to the dark ground for its duration and returns to your chosen theme when it ends; the theme button sets that base preference rather than being overwritten
- **Engine on the audio clock** — scheduling is driven by the audio context clock on a timer, not by the frame loop, so a backgrounded tab keeps composing instead of holding whatever texture it was on, and a low frame rate no longer slows the music down
- **Half-time decoupling** — the transport reaches 140, but everything melodic is stretched by whichever power of two brings its felt pulse back near the resting tempo, so a night piece's pads hang under its drums instead of sprinting with them
- **Phrase-aligned automation** — autonomous knob drift locks to 8/16-bar boundaries and moves in coordinated clusters, so the piece reads as sections rather than arrhythmic drift
- **Flourishes throughout** — sparkle runs and melodic flurries recur on a cadence that ebbs and flows within each movement (denser in bloom/hang, sparser in the troughs)
- **New textures** — a Bicep/Caribou-style felt sub **pulse** (bloom/hang) and Aphex/Nosaj-style **granular degradation** (dissolve/exhale)
- **HRTF binaural positioning** — select voices (distant bell, harmonic ghost, sparkle, flurry) are spatialised in true 3D with graceful stereo fallback
- **Master FX chain** — chorus, glue compression, delay, 14s reverb, stereo widener, tilt EQ, limiter
- **FFT analysis** — bass / mids / highs / overall bands plus full spectrum for visual detail

### Play — the orchestra as an instrument

A third mode beside Drift and Calibrate. The same voices, the same harmonic
field, the same room, but with a polyphonic instrument at the front of it.

- **Plays in the key the piece is already in** — the white keys walk the current
  scale degrees, so the layout follows the harmonic field as it drifts and
  nothing you play is out of key. Black keys are the passing tones between
  degrees. A **Chromatic** toggle gives a literal keyboard instead
- **Eight voices** — Glass, Choir, Bell, Crystal, Strings, Warm, Reed and Ghost,
  each a playable reading of a voice the orchestra already has. Same timbres,
  performance envelopes: the generative versions open over two to six seconds,
  which is right for a bed that swells in and wrong for a key you press
- **The orchestra makes room where you are** — the Conductor keeps composing,
  and the ensemble leans away in your register rather than everywhere: the
  melody and air voices share the keybed's range and step well back, the pads
  carrying the harmony you are playing over stay, and the sub and the beat
  barely move, because nothing you play is down there. Playing *the orchestra*,
  not over a backing track
- **In proportion to what you are playing** — how far the ensemble leans away
  tracks how much of the instrument is in use, continuously. One held note is
  not a chord and doesn't move the room like one; the decay is slow enough that
  the gaps between phrases don't make the orchestra surge in and out
- **Behind / With / Front** — where the instrument sits against the ensemble.
  One control moves both its own level and how far the orchestra leans away,
  because those are the same decision made twice. **With** is the default: in
  front, but inside the piece
- **In the room, not behind its wall** — the instrument shares the delay,
  reverb, width and tilt of the space, and joins the chain after the room
  filter and outside the glue compressor, so walking toward the doorway muffles
  the room and never muffles your hands. It does ride the session arc partly,
  by an amount the blend sets: an instrument that held one level while the
  piece swelled and receded around it was the one thing in the room not
  breathing
- **Voiced like a mix, not a monitor** — velocity has real range end to end, a
  chord is trimmed for the notes in it so six fingers aren't six times one, and
  the bus is level-matched against the layer buses with a shallow compressor
  above it. Nothing here reaches for a limiter to hold itself down
- **Works with nothing plugged in** — a QWERTY keybed on the tracker layout
  (`A`–`;` white, `W`/`E`/`T`/`Y`/`U`/`O`/`P` black, `Z`/`X` for octave) and a
  clickable on-screen keyboard, so Play needs no hardware
- **Velocity, sustain, bend and mod** — sustain pedal (CC64) holds through
  key-ups, pitch bend runs ±2 semitones, and the mod wheel opens each voice's
  filter above its resting brightness rather than being the only thing between
  you and a muffled instrument

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
- **Piece picker (Calibrate only)** — choose a length and a world and play that piece now, instead of waiting for two weighted draws to agree. Drift keeps its unpredictability; direct control belongs to Calibrate
- **Play panel (Play only)** — the instrument's own surface in the same slot: connected controller, eight voices, the in-key / chromatic toggle with the field's live key beside it, octave, what is sounding, and a two-octave on-screen keyboard
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

Movements draw their length, pulse profile and character at random, so waiting
for a particular one is impractical. Three dev-only query params force the draw:

- `?scale=fragment` (or `short`, `standard`, `long`, `epic`) — pins every
  movement to that duration class, the only way to hear a 45-second fragment or
  a 15-minute epic on demand.
- `?pulse=kit` (or `felt`, `silent`) — pins the pulse profile. A third of
  movements carry no beat and a fragment never gets a kit, so this is how you
  reach a particular one on demand.
- `?character=night` (or `open`) — pins the world. Night pieces are a
  minority draw, so this is how you hear the 2-step at garage tempo on demand.

They compose: `?scale=long&character=night`.

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

Unit tests cover music theory helpers, harmonic field transitions, the Play
keybed mapping and mix model, stored calibrations, and MIDI device profiles
and learned bindings.

## Controls

### Sound knobs

| Knob | Range | Effect |
|------|-------|--------|
| Warmth | Warm ↔ Bright | Tilt EQ and voice filter brightness |
| Space | Intimate ↔ Vast | Reverb, delay, stereo width, bus balance |
| Activity | Still ↔ Drifting | Voice change rate and harmonic event density |
| Memory | New ↔ Recall | Phrase recall weight in the harmonic field |
| Entropy | Stable ↔ Morph | Mode drift and timbral instability |
| Pulse | Calm ↔ Driving | Tempo (up to 140 BPM in Calibrate), delay feel, and how often a night piece comes up |

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
| **D** | Toggle the PerfMonitor health readout (Drift and Calibrate — in Play, D is a key) |
| **Light field / Dark field** | Toggle visual palette (right rail header) |
| **A**–**;** / **W E T Y U O P** (Play) | Computer keybed — white keys and black keys |
| **Z** / **X** (Play) | Shift the keybed down / up an octave |
| **Mov** button | Advance movement phase |
| **Shift + Mov** | Skip to next movement |
| **Form** button | Nudge visual morphology emphasis |

## MIDI controllers

Play mode speaks Web MIDI (Chrome, Edge, Safari 18+, Firefox 108+; needs a
secure context, so `localhost` or HTTPS). Switching to Play asks for
permission — refusing it just falls back to the computer keyboard.

| Control | Does |
|---------|------|
| Keys | Play, velocity-sensitive |
| Pads 1–8 | Select a voice |
| Pads 9–16 | Phase · Movement · Space · Inhale · Vacuum · Thin · Form · All notes off |
| Knobs 1–8 | The sound knobs, with soft takeover — a pot stays inert until it passes through the current value, so it picks the knob up instead of snapping it |
| Sustain (CC64) | Holds notes through key-up |
| Pitch bend | ±2 semitones |
| Mod (CC1) | Opens the voice's filter |

Built against the **Akai MPK Mini** and the **Novation Launchkey Mini**, which
have factory profiles. Any other controller falls back to a generic profile and
still plays.

Those profiles are a convenience, not a contract: both units are
user-programmable and their factory CC assignments differ between hardware
revisions and between the presets stored on the device. Where a knob or pad
doesn't land where the profile expects, open **MIDI learn** in the play panel,
arm the slot, and move the control — the binding wins over the profile and
persists across sessions.

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
                  MusicalClock, Movement, LayerPresence, RoomWalk,
                  NeighbourRoom, voices, clips
  visual/         Visualizer, ArtDirectorSkill, FluidField, LayerBalance,
                  ScenePalette
  visual/three/   GhostField, ExtrusionField, TrailPass, ghost/milky shaders
  audio/          ... PlayInstrument, PlayPresets, PlayMapping, PlayBlend
  input/          MidiInput, MidiMap, KeyboardInput, PlayController
  ui/             Controls, SessionReadout, CymaticsOverlay, VisualScope,
                  KnobAutomator, ThemeToggle, PlayPanel
  diagnostics/    PerfMonitor
```

## Design notes

- **Percussion is common, never assumed** — at rest about a third of movements draw a silent pulse profile and never hear one, a quarter take the felt-not-heard sub heartbeat, and the rest get a full kit. Tempo steers that hard, from a kit on a fifth of movements at the bottom of the knob to half of them at the top. A fragment never gets a kit: there is no room to establish a pattern and leave again
- **Duration is structure** — a one-minute fragment next to a fifteen-minute epic is what makes a sequence read as composed rather than generated, so the length of a piece is drawn before its shape is
- **Swell is balance, not volume** — the ambient curves carry everything one minute and sit near-inaudible under a melody or a texture the next, a swing of about 23dB. Every layer sits on a ring the focus point can reach the edge of, so each one both takes the front and falls all the way back; nothing rests at the centre where it could never recede. The front is never empty
- **Two rooms, always** — the neighbouring room runs its own key, its own arc and its own voices behind a wall filter. Crossing the threshold hands its key to the main room and gives the neighbour a new one, and the swap happens at the point of deepest blur so it lands inside the smear rather than as a cut
- Voices never all play at full volume simultaneously
- **Playing is not conducting** — the instrument takes the front of the mix and the orchestra leans away, but the orchestra never stops composing. The key you are playing in is the key the piece drifted to on its own, and it will drift again underneath you. A note already sounding keeps the pitch it was struck at; only the next one hears the new key
- **Playing is joining, not switching on** — an instrument that entered at unity next to layer buses sitting near half, and dropped the whole ensemble 10dB the instant a key went down, is a synth over a backing track that has been told to get out of the way. Every part of the mix answer is proportional instead: the level, the register the ensemble makes room in, how far it leans, and how much of the piece's own arc the instrument rides
- **Two creative roles:** the Conductor Skill directs the audio (intensity, stereo image, flourish cadence) and the Art Director Skill directs the visuals (fog, focus, mood, constellations) — both read the same shared harmonic context, so picture and sound stay in step
- **Visual palette:** strict depth-pass monochrome. Light field (`#ececec`) with dark ink ghosts is the default; dark field inverts to luminous ghosts on a deep `#08080f` ground, with bodies tinted into the same blue-black family
- **Ink-in-water:** ghosts deposit semi-transparent strokes into a fade buffer each frame; older ink slowly bleaches back toward the field color — Drift toward Mist lengthens the dissolve
- Ghosts carry motion and memory; bodies carry sculptural mass — **Focus** sets the mix

## License

MIT — see [LICENSE](./LICENSE).
