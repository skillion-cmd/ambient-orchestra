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
- **Master FX chain** — chorus, glue compression, delay, 14s reverb, stereo widener, tilt EQ, 30Hz rumble filter, limiter
- **FFT analysis** — bass / mids / highs / overall bands plus full spectrum for visual detail

### Play — the orchestra as an instrument

A third mode beside Drift and Calibrate. The same voices, the same harmonic
field, the same room, but with a polyphonic instrument at the front of it.

- **A keyboard that means what it says** — every key sounds the pitch written
  on it, because the panel draws a piano and a drawn piano is a promise about
  which note is under your finger. An **In key** toggle keeps you inside the
  key the piece is already in: the handful of keys outside it fall onto the
  nearest note inside, and the on-screen keyboard draws those recessed and
  labels each with the note it lands on, so the aid is visible rather than a
  keybed that has quietly slid out from under you
- **Eight voices** — Glass, Choir, Bell, Crystal, Strings, Warm, Reed and Ghost,
  each a playable reading of a voice the orchestra already has. Same timbres,
  performance envelopes: the generative versions open over two to six seconds,
  which is right for a bed that swells in and wrong for a key you press
- **The orchestra follows you** — hold a shape and the ensemble comes round to
  it: the pads and beds re-voice onto the chord you are holding, on a bar line,
  a few bars after your hands settle. It arrives *in time* rather than the
  instant you press, so the whole ensemble turns together instead of the beds
  lurching under your fingers, and the panel says where the move has got to
  (`ensemble listening` → `holding — waiting for the bar` → `ensemble took your
  chord`) so the wait reads as the orchestra taking your cue rather than as
  nothing happening. Hold one note and it voices a triad on that degree; hold a
  shape and it takes the shape. Passing notes never count — the wait restarts
  every time the held shape changes, so a run through a chord on the way
  somewhere else is never mistaken for an instruction
- **And it answers you** — play a phrase, stop, and the melody voice picks your
  line up at its next boundary and plays it back as a recall: cut and re-timed
  to the phase it lands in, in the ensemble's own voice, rather than a
  recording of you played back. It keeps it as a stored hook afterwards, so
  what you played resurfaces later the way the field's own hooks do
- **Melody or Beat** — the same keybed plays either half of the orchestra. In
  Beat it is a kit, twelve pieces to the octave laid out for a hand rather
  than a scale: kick, snare, both hats, two toms and the ride on the white
  keys, the sub, clap, shaker, rim and crackle on the black ones. The pitched
  pieces take the field's current root, so a kick you play is in the key of
  whatever is going on, and it takes the generative kit's own route into the
  mix rather than the melodic instrument's — a drum wants neither the 90Hz
  highpass that is most of a kick, nor a 14s reverb, nor a compressor where
  every hit ducks the field. The duck flips with it: playing keys the melody
  and air make room, playing drums it is the Conductor's beat that steps back
  and the melody that stays put
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
  One control moves its level, how far the orchestra leans away, *and* how many
  bars it takes to come round to a chord you are holding, because those are the
  same decision made three times: how much of this piece is yours. Front turns
  on the next bar (~2s in practice), With takes two (~10s), Behind takes four
  (~21s) and lets the walk make its own moves in between. **With** is the
  default: in front, but inside the piece
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
- **Art Director Skill (autonomous)** — a visual creative-direction layer: modulates **fog depth** per phase, drives **dreamlike focus arcs** (slow oscillation plus event-triggered snaps), shifts the **palette mood** with the harmony (warmer on tonic, cooler on tension), and triggers **constellation moments** on bloom. Every directive except the constellation reaches all three visuals through the shared drive
- **Ink-in-water trails** — a unified WebGL fade buffer accumulates ghost strokes into soft pools that slowly dissolve back into the field
- **Light / dark field** — pale `#ececec` default with dark charcoal ink; a luminous **dark field** on a deep blue-black `#08080f` ground, with bodies tinted to share the field's chroma
- **Harmonic chroma** — the harmony is the one thing in the field allowed any
  colour: tonic warms toward amber, dominant and colour chords cool toward
  blue-violet, and the corridor between rooms drifts it back to neutral. It is
  chromesthesia at the level of the chord rather than the note — a note-to-hue
  mapping would put colour on every event, and the restraint is most of what
  makes the field read as ink, weather and sand rather than as a visualiser.
  The whole range end to end is about three percent of saturation, measured:
  enough to feel the light in the room change, under the threshold where you
  would name a colour. All four layers carry it at the same weight, so it is
  the same light falling on all three visuals
- **Breathe** — quiet passages retract; loud ensemble moments expand radius, length, and ghost density
- **Morphology** — shape blends continuously with movement phase (network / sphere / waveform paths); no hard form cuts
- **Audio-reactive** — FFT spectrum deforms tube paths and thickness; harmonic swell drives fog, camera, and pulse
- **Focus balance** — crossfade ghost vs body presence from 70/30 to 50/50 to 30/70
- **Three visuals, one field** — *Ink* is the layered ghost/body world above; *Currents* is a wind map, streamline particles advected through an audio-shaped curl-noise field; *Resonance* is a **Chladni plate**, grains settling onto the nodal lines of a standing wave. All three read the same audio and the same harmonic context
- **One drive, three readings** — every field works from a single reading of
  the piece (`FieldDrive`): the Art Director's focus arc and fog breathing,
  the palette mood, and one shared vocabulary of events — a strike, a phrase
  closing, the breath drawn before a gesture, the field thrown open, and the
  doorway. Each visual answers the same event in its own terms rather than
  listening for its own private subset, so switching mode changes the noun
  and not the language. A phrase closing is a ring through the ink, a band of
  brighter air crossing the wind map, and a softer second strike on the
  plate; the inhale contracts Ink and drops the wind, and on the plate does
  the opposite — a still plate draws its figure sharply. Crossing between
  rooms is the largest strike the piece has, and now reaches all three
  instead of only moving the camera
- **A played chord marks the field** — Play's note attack is part of the same
  drive, so the instrument blooms whichever visual is on screen: playing the
  orchestra leaves a mark on the room rather than only in the mix
- **Resonance answers the harmony, not the level** — the plate's mode numbers come from the chord being held (the third of the chord sets one, the top of it the other), so a chord change is a figure change and the plate is showing you the interval. Ensemble gestures strike it: the grains jump and the figure reassembles. The camera settles square onto it, because a figure read at an angle shears into an unreadable diamond
- **The plate leans towards the window without becoming it** — a Chladni
  figure is a *bounded* object: its diagonals run corner to corner, its
  lines close on themselves or meet the edge, and it is symmetric under a
  quarter turn, which only a square has. Cut to a 16:9 window it lost all
  of that — the diagonals stopped somewhere in the middle of the screen, the
  outer thirds were pattern with no figure in them, and the left and right
  edges landed mid-cell. It read as wallpaper, which is the one thing a
  Chladni figure is not. So the plate takes the *square root* of the
  window's aspect and stops leaning at 4:3, and the field frames it: a plate
  on a bench, with room around it. Its bounds still come from the camera
  frustum and still reflow live as the window changes
- **What little shape it does take is split between cells and stretch** —
  half absorbed by scaling the mode numbers, which adds cells without
  distorting them, and half arriving as stretch. Both halves stay under
  about 15%, which is well below what the eye reads as a distortion, and it
  is the right way round: the eye is reading the symmetry and the closed
  lines, not measuring the cells
- **The plate is sized to the field you can actually see** — on a phone the
  bottom of the screen is a sheet of controls, and a plate centred in the
  *window* sat almost entirely behind it. What is left is a short, wide
  letterbox, which is a shape the plate is perfectly happy to take
- **Sand covers the same fraction of the plate at every size** — grains are
  drawn in screen pixels, so a small plate draws smaller sand and keeps the
  count, and a plate with room to spread keeps the desktop's grain and takes
  the extra room as more sand. Getting that wrong is not subtle in either
  direction: hold the count and the grain and a phone plate goes half solid;
  shrink the grain and scale the count by area and the same figure arrives
  as a scatter of dust. The plate's agitation is scaled the same way, so a
  small plate settles as sharply as a large one rather than being shaken
  apart by a throw calibrated for three times its width

### UI

Two edge rails frame an open center, each pairing live data with the knobs that drive it — and in Play the center is where the instrument stands:

- **Left rail — Audio:** movement / phase readout, a **cymatics panel** (scrolling waveform, beat markers, bass/mid/high spectrum, live key + mode + chord function, and a console-style ensemble meter), and the audio knob grid
- **Right rail — Visual:** form readout, a **visual scope** (particle population, ghost↔body layer balance, cool↔warm mood, fog depth), and the visual knob grid
- **Top centre — what you are looking at:** the Ink / Currents / Resonance switch and the light / dark field toggle, mirroring Drift / Calibrate / Play at the bottom. Outside the rails, so both stay reachable in Drift
- **10 knobs** — six sound, four vision (see below)
- **Piece picker (Calibrate only)** — choose a length and a world and play that piece now, instead of waiting for two weighted draws to agree. Drift keeps its unpredictability; direct control belongs to Calibrate
- **Play stage (Play only)** — the instrument stands in the middle of the screen, above the mode switch and clear of both rails: Melody / Beat, connected controller, eight voices (or the black-key kit legend), the in-key / chromatic toggle, octave, blend, the field's live key, what is sounding in full size, and a keyboard wide enough to hit, every cap carrying the pitch it will sound. The rails keep what they are for — the engine, and the knobs that steer it
- **Knob automator** — slow, phrase-aligned autonomous drift when you leave the controls alone
- **PerfMonitor** — a dev-only health gate (press **D**) reporting frame rate, audio-context health, console errors, and heap growth
- **Error overlay** — a clear message if WebGL or audio fails to start

### Readout or control: one rule

Each rail is two named bands, because it was carrying two completely
different kinds of thing in the same 9px type and there was no way to tell
them apart except by clicking:

- **Readout · live** — what the engine is doing. No box anywhere in it, muted
  ink, and the two canvases have pointer events off entirely, so a thumb
  cannot even test them. A dot next to the header breathes, which is the one
  animated thing in the rail and says "this is arriving on its own" faster
  than a word can.
- **Controls · tap · drag** — what changes it. Everything in the band has a
  1px box, full-contrast ink, a press state and a focus ring.

**If it has a box around it, you can touch it.** That rule now holds across
the whole interface — the mode and view switches, the piece picker, the play
panel, and the two rails.

Two things moved to make it true. The phase name in the movement row *was* a
button dressed as a label, and shift-clicking it skipped the movement — a
control that looked like text, plus one that was invisible and impossible to
reach from a phone, which has no shift key. Both are now ordinary buttons in
the controls band: **Next phase** and **Next movement**, with **Next form**
opposite them in the visual rail. The knob dials grew a filled arc, so a dial
shows its value on itself and reads as something set to a position rather
than as a ring drawn for decoration.

### On a phone

Below 820px — a phone, or a narrow desktop window — two 268px rails and a
field worth looking at cannot stand side by side, so the rails stop being
rails. The mode switch, a tab bar and one panel at a time become a single
sheet docked to the bottom edge, capped at two thirds of the screen so the
field keeps the rest. Nothing moves in the DOM: the wrapper is
`display: contents` on a wide screen and a flex column below the breakpoint.

- **Tabs** follow the mode — Audio / Visual in Calibrate, with Play added and
  selected first in Play mode. Drift has no tabs, because Drift has no
  controls on any screen size
- **Hide** collapses the sheet to just the mode switch and the tabs, so the
  field has the whole screen and getting back is one tap. It is what a
  double-click does on a wide screen
- **Controls come first in the sheet**, readout under them: you can only see
  one band at a time down there, and what you opened Calibrate for is the
  knobs, not the graph of what they did
- **Knobs take a finger** — 46px dials on any touchscreen, pointer-captured
  so the drag survives sliding off, and `touch-action: none` so a vertical
  drag turns the knob instead of scrolling the sheet. A second finger can
  work a knob while the first holds a chord
- **One octave of keys** in Play instead of two: fifteen white keys on a
  390px screen is 24px each, which is narrower than the finger aiming at
  them. Eight keys is about 44px, and the octave stepper covers the rest of
  the range. The keyboard is sticky to the bottom of the sheet, so its
  settings scroll behind it rather than taking it off screen. The computer
  keybed and any MIDI controller keep their full two-octave span either way
- Both data panels are drawn to the width of the column they are in rather
  than a fixed 220px, and MIDI learn folds away — eight cells across is
  unusable at this width, and Web MIDI barely exists on a phone

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

Unit tests cover music theory helpers, harmonic field transitions, event
scheduling, the Play keybed mapping and mix model, stored calibrations, and
MIDI device profiles and learned bindings.

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
| **Double-click** or **F11** | Hide / show both rails (full-bleed view). On a phone, collapse the dock — same as the **Hide** button |
| **D** | Toggle the PerfMonitor health readout (Drift and Calibrate — in Play, D is a key) |
| **Ink / Currents / Resonance** | Switch visual (top centre) |
| **Light field / Dark field** | Toggle visual palette (top centre) |
| **A**–**;** / **W E T Y U O P** (Play) | Computer keybed — white keys and black keys |
| **Z** / **X** (Play) | Shift the keybed down / up an octave |
| **Next phase** button | Advance movement phase |
| **Next movement** button | Dissolve this piece and begin another |
| **Next form** button | Nudge visual morphology emphasis |
| **↑ ↓ ← →** on a focused knob | Move it by 2 (hold **shift** for 10); **home** / **end** for either end |

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
                  NeighbourRoom, ScheduleTime, voices, clips
  visual/         Visualizer, ArtDirectorSkill, FluidField, LayerBalance,
                  ScenePalette
  visual/three/   GhostField, ExtrusionField, TrailPass, ghost/milky shaders
  audio/          ... PlayInstrument, PlayPresets, PlayMapping, PlayBlend
  input/          MidiInput, MidiMap, KeyboardInput, PlayController
  ui/             Controls, SessionReadout, CymaticsOverlay, VisualScope,
                  KnobAutomator, ThemeToggle, VisualModeToggle, PlayPanel
  diagnostics/    PerfMonitor
```

## Design notes

- **Percussion is common, never assumed** — at rest about a third of movements draw a silent pulse profile and never hear one, a quarter take the felt-not-heard sub heartbeat, and the rest get a full kit. Tempo steers that hard, from a kit on a fifth of movements at the bottom of the knob to half of them at the top. A fragment never gets a kit: there is no room to establish a pattern and leave again
- **Duration is structure** — a one-minute fragment next to a fifteen-minute epic is what makes a sequence read as composed rather than generated, so the length of a piece is drawn before its shape is
- **Swell is balance, not volume** — the ambient curves carry everything one minute and sit near-inaudible under a melody or a texture the next, a swing of about 23dB. Every layer sits on a ring the focus point can reach the edge of, so each one both takes the front and falls all the way back; nothing rests at the centre where it could never recede. The front is never empty
- **A beat receding is not the same as a pad receding** — the rotation's floor is per layer, because the layers don't mean the same thing. A pad at -22dB is the piece breathing out and you never notice it has gone; a beat at -22dB is the groove stopping and the piece losing the thread. The beat floors at -8dB and the sub at -11dB — pulled back, still keeping time — while the ambient layers keep the full depth
- **Night pieces have sections** — sixteen bars at a time, the 2-step either holds its lurch or locks into four on the floor, weighted by phase so the crest of a piece is where the grid arrives. The lurch only reads as deliberate once you have heard what it is departing from. Every eighth bar takes a turnaround fill, which is what tells you where a section ended
- **No two dips may multiply into a dropout** — the session arc, the long-form near-silence dip, the exhale vacuum gesture and the per-voice phase level are four independent things pulling the level down, and they reach their deepest at the same moment: the end of a piece. Together they hit about -20dB, which is not a piece breathing out, it is a piece stopping and starting again. Gestures now floor themselves against wherever the arc already is, and the dip stays out of the dissolve and the exhale
- **A skip is a scheduling budget, not a synth** — Tone schedules from the main thread, looking a fixed distance ahead, so that window is the whole frame budget: anything that blocks longer than it lands its events in the past, where they are dropped rather than played late. Drift and Calibrate take a quarter second of headroom, which nobody can hear. Play goes tighter than the default, because there the number is how long after your finger the note speaks
- **Two rooms, always** — the neighbouring room runs its own key, its own arc and its own voices behind a wall filter. Crossing the threshold hands its key to the main room and gives the neighbour a new one, and the swap happens at the point of deepest blur so it lands inside the smear rather than as a cut
- Voices never all play at full volume simultaneously
- **The bottom of the mix is guarded** — the pad and melody path is highpassed at 90Hz, but the two paths that carry the actual low end, the dry sub and the dry beat, take a shortcut past it on purpose. A 30Hz rumble filter before the master limiter is what stands under *them*: sub-audible energy never arrives as a note on any speaker anyone is likely to own, but it still moves the cone, still spends headroom, and still intermodulates with what you can hear — the whole mix going gritty on the low notes rather than just the low notes going gritty. The kick sits an octave above where it started, at 37–58Hz, the same range the deep-pressure sub works in: a kick you can hear land rather than one you can only feel the speaker fail to reproduce. Measured at the output, the band below 32Hz went from 3.6dB under the audible bass to about 12dB under it, while the audible bass got slightly louder
- **Nothing schedules at `Tone.now()`** — it is not a clock you can call twice. It reads the audio context, which advances once per render quantum, so every call inside one JavaScript turn hands back the same value — and `clockStep` deliberately runs several engine sub-steps in one turn whenever it is catching up after a stall. Two events at one time on one voice is a thrown `RangeError`, and the throw took the rest of the voice loop with it: every voice after the offending one was skipped for that step, levels and fades frozen while their sound carried on. A flourish glitching in the melody register left the kit and the sub stuck mid-ramp, so the bass was what you heard break. Voices schedule through a per-node clock that cannot repeat a time (`ScheduleTime`), and the loop survives a voice that fails anyway
- **A `Tone.Loop` callback runs where nothing can catch it** — out in the transport's own tick, so a throw there takes the rest of that tick's scheduled events with it, whichever voice they belonged to. Two things were throwing: percussion voiced with `sustain: 0` was scheduling a release that did nothing audible and could still land after its own next attack, and a clip was ramping a filter frequency an LFO was already driving. Both are now what they should have been — attack-only drums, one writer per parameter
- **Playing is not conducting** — the instrument takes the front of the mix and the orchestra leans away, but the orchestra never stops composing. The key you are playing in is the key the piece drifted to on its own, and it will drift again underneath you. A note already sounding keeps the pitch it was struck at; only the next one hears the new key
- **Playing is joining, not switching on** — an instrument that entered at unity next to layer buses sitting near half, and dropped the whole ensemble 10dB the instant a key went down, is a synth over a backing track that has been told to get out of the way. Every part of the mix answer is proportional instead: the level, the register the ensemble makes room in, how far it leans, and how much of the piece's own arc the instrument rides
- **Two creative roles:** the Conductor Skill directs the audio (intensity, stereo image, flourish cadence) and the Art Director Skill directs the visuals (fog, focus, mood, constellations) — both read the same shared harmonic context, so picture and sound stay in step
- **Visual palette:** strict depth-pass monochrome. Light field (`#ececec`) with dark ink ghosts is the default; dark field inverts to luminous ghosts on a deep `#08080f` ground, with bodies tinted into the same blue-black family
- **Ink-in-water:** ghosts deposit semi-transparent strokes into a fade buffer each frame; older ink slowly bleaches back toward the field color — Drift toward Mist lengthens the dissolve. The buffer is half-float: it feeds back into itself every frame, and at 8 bits the convergence stalls once a pixel is within a few levels of the background, which printed a permanent ghost of the last image onto the mostly-empty Resonance plate
- Ghosts carry motion and memory; bodies carry sculptural mass — **Focus** sets the mix

## License

MIT — see [LICENSE](./LICENSE).
