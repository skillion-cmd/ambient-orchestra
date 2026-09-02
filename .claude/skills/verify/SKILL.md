---
name: verify
description: Build, launch, and drive Ambient Orchestra in a headless browser to verify changes end-to-end.
---

# Verifying Ambient Orchestra

Vite + TypeScript app; the surface is a WebGL/WebAudio page. Tests
(`npm test`) and `npx tsc --noEmit` are CI's job — real verification is
driving the page in a browser.

## Launch

```bash
npm ci                                  # once
npm run dev -- --port 5173 --strictPort # background
```

## Drive (headless Chromium + Playwright)

Playwright isn't a project dep — install it in a scratch dir, and use the
pre-installed browser (`ls /opt/pw-browsers/` for the current version):

```js
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
});
```

Flows that matter:

- Click `#start-btn` (the user gesture that unlocks Tone.js). Audio is
  verified indirectly: the cymatics BASS/MID bars and the advancing BAR
  counter prove the analyser sees a live signal.
- Knobs: mouse-down on a `.knob-dial`, move vertically in small steps,
  mouse-up. Read back via the sibling `.knob-value` text.
- Mode: the Drift/Calibrate/Play toggle is `#mode-toggle` (three buttons,
  in that order); body has `data-mode`. Knob persistence writes `ao-knobs`
  (Calibrate and Play, debounced 500ms).
- Right-rail toggles (`#rail-right-toggle`): theme button says the
  *destination* ("Dark field" when light), same for Field/Currents
  ("Currents" when in field mode).
- Seed localStorage via `page.addInitScript` to test stored-calibration
  paths (`ao-knobs`, `ao-mode`, `ao-theme`, `ao-visual-mode`).
- Movements draw a random length and pulse profile, so most paths are
  unreachable by waiting. Force them: `?scale=fragment|short|standard|long|epic`
  `?pulse=silent|felt|kit` and `?character=open|night` (they compose).
  `?character=night` is the only practical way to hear a night piece: it
  forces a club tempo, the minor mode pool, and the vinyl crackle bed.
  `?groove=house|techno|two-step` pins which night and implies
  `character=night`. `?scale=fragment` also gets you
  a doorway crossing every ~80s — the walk into the neighbouring room is
  forced as each movement runs out, and shows up as `between rooms` in the
  left-rail sub-line, followed by a new movement index.

- The Calibrate rail has a piece picker (`.piece-picker`, hidden in Drift
  and in Play): a length row then an `OPEN | NIGHT | PLAY` row. Clicking Play
  queues the choice and triggers the usual dissolve-and-skip, so allow ~25s
  before the new piece reports in the readout.

- Play mode (`.play-panel`, the picker's slot, hidden in Drift and
  Calibrate). Playwright cannot present a MIDI device, so the computer
  keyboard is the automatable path — everything below works headless:
  - Notes: `page.keyboard.down('a')` etc. on the tracker layout (`a s d f g
    h j k l ;` white, `w e t y u o p` black, `z`/`x` octave). `.play-notes`
    reports the *sounded* pitches, which in the default in-key tuning are
    not the keys pressed — `a d g j` in G lydian gives `G4 B4 D5 F#5`.
  - `.play-key-cap.is-held` counts the lit keys on the on-screen keyboard;
    the caps themselves are clickable via `pointerdown` / `pointerup`.
  - The ensemble duck shows as `.play-notes.is-ducked`, and the line reads
    `orchestra held back` while it is still leaning away — a few seconds
    after the last note-off, since the duck follows play energy and that
    decays rather than switching off.
  - Preset row is `.play-presets button`; the tuning toggle, octave steppers
    and the Behind/With/Front blend row are each a `.play-row` (`.play-blend`
    for the last). Panel state persists to `ao-play`
    (`{presetId, tuning, octaveShift, blend}`); learned MIDI bindings to
    `ao-midi-map`. Both seed cleanly via `page.addInitScript`. A stored state
    from before `blend` existed backfills rather than resetting.
  - Restoring `ao-mode: 'play'` from storage arms the keybed on load, so a
    seeded Play session answers typed keys without touching the mode toggle.

### Verifying a groove

Patterns are the ground truth and they are readable straight off the voice,
which is far quicker and less ambiguous than onset-detecting the audio:

```js
const kit = window.__ao.conductor['voices'].find((v) => v.id === 'pulseKit');
// kit.kickPattern / hatPattern / openHatPattern / clapPattern / clickPattern
// kit.swing, kit.nudges, kit.builtStyle
```

`clubBass.pattern` (per-step `{degree, octave}`) and `clubStab.pattern` read
the same way. Render a 16-boolean pattern as `x`/`.` and a four-four kick is
`x...x...x...x...` at a glance.

Two things gate them. **The kit starts at the gather**, so a `?scale=long`
piece sits in drift for minutes first — jump it:
`window.__ao.conductor.harmonicField.getMovement().jumpToPhase('gather')`,
then allow ~20s for the fade-in. And the **bassline and stabs follow the
kit**, so they are absent until it is actually active.

The sidechain pump can be seen but not precisely measured from the main
thread: polling `clubBass.duck.gain.value` shows it dipping once per beat and
recovering, but a busy-wait loop reads a flat 1.0 — blocking the main thread
stops Tone's transport scheduling the pump at all — and `getValueAtTime` does
not report automation scheduled ahead. Poll while yielding, and expect the
observed floor to sit above the real one.

### Verifying the mix, not just the DOM

Nothing about balance is legible from the page, so the dev build hangs the
engine on `window.__ao` (`import.meta.env.DEV` — it is not in a production
bundle). That is the way to check a mix change:

```js
await page.evaluate(() => {
  const e = window.__ao;
  return { play: e.playBus.gain.value, melody: e.melodyBus.gain.value,
           pad: e.padBus.gain.value, duck: e.getEnsembleDuckDepth() };
});
```

Two things about that engine handle are worth knowing before you use it.

`Tone.Limiter.reduction` (and `Tone.Compressor.reduction`) **lies here** — the
pulse limiter has been seen reporting −13dB of gain reduction while its input
and output peaks matched to three decimals. Measure a limiter by tapping both
sides, never by reading `reduction`.

`engine.update(dt)` can be called directly, and calling it many times in one
`page.evaluate` reproduces exactly what `clockStep` does after a stall: several
engine sub-steps in one JavaScript turn, all reading the same `Tone.now()`.
That is the shape of bug an ordinary real-time run finds only every few
minutes, so it is the fastest way to test anything about scheduling:

```js
await page.evaluate(() => {
  const thrown = [];
  for (let i = 0; i < 800; i++) {
    try { window.__ao.update(0.25); } catch (e) { thrown.push(e.message); }
  }
  return thrown;
});
```

`getPlayInstrument().noteOn(midi, velocity)` plays at a chosen velocity,
which the computer keybed (fixed 0.7) and the on-screen keys (0.75) cannot.
`setBlend('behind'|'with'|'front')` switches the balance without clicking.
To hear one thing at a time, zero `melodyBus`/`padBus`/`airBus`/`subBus`/
`pulseBus` and read `getSpectrum()` — but note it is normalised
`(dB + 100) / 100`, so silence reads as a large constant, not zero. Only
differences from a measured floor mean anything, and a 14s reverb tail keeps
that floor moving for a while after you stop.
  - Scale tuning voices two octaves above `rootMidi` (the field's *bass*),
    which keeps it within an octave of chromatic on the same key. If a change
    makes those two jump apart, that lift is what moved.

Two shapes of scheduling bug live here, and they fail in different places:

- Inside `engine.update()` — a voice's `onUpdate` throws, the Conductor
  catches it and warns once per voice. Reproduce with the `update(0.25)` loop
  above.
- Inside a `Tone.Loop` callback — the transport's own tick, which nothing in
  the engine wraps, so the throw takes the rest of that tick's events with it
  whatever voice they belonged to. These only appear in real time, minutes
  apart. `?character=night&pulse=kit` provokes them fastest: it is the
  busiest scheduler in the app.

Watch `page.on('pageerror')` on any long run. The orchestra is scheduled
audio, so its failures are thrown exceptions rather than wrong pixels, and
they arrive minutes apart — a run that produced no errors is only evidence if
it was long enough. Filter tone.js frames out of the stack to see the app
frame that scheduled the event.

To check the low end, read the output analyser's `getFloatFrequencyData` in
two bands: worst-frame peak below 30Hz against 36–120Hz. Sub-audible energy is
inaudible by definition, so it cannot be found by listening and does not show
up in a peak meter either — the gap between those two bands is the number that
moves. Expect around 20dB.

**Set `fftSize = 32768` for this and nothing less.** The default 2048 gives
23Hz-wide bins, so the lowest usable bin is centred at 23Hz and a 37Hz kick
smears straight into it — the "sub-audible" reading then mostly measures how
much *audible* bass there is, and moves 10dB between runs of the same build
for no reason. At 32768 the bins are ~1.5Hz and the two bands are actually
separate. Leave a gap between them (30Hz and 36Hz, not 32 and 32) so
spectral leakage from the kick's fundamental has somewhere to go.

Screenshots after ~5s of runtime give the trail buffer time to develop —
a fresh switch looks empty.

## Gotchas

- `/favicon.ico` 404s in the console — pre-existing, ignore.
- `D` toggles the PerfMonitor in Drift and Calibrate only: in Play it is a
  white key, and the shortcut stands down rather than firing every time you
  play an E. Note also that `.perf-monitor` is an empty zero-height div until
  a frame writes into it, so assert on its presence, not `isVisible`.
- The left rail's `.rail-data` scrolls (`min-height: 0; overflow-y: auto`) so
  a tall panel can't walk the knob grid off the bottom. An element below the
  fold is scrolled, not missing — `scrollIntoViewIfNeeded()` before clicking.
- The engine no longer runs on `requestAnimationFrame` — it advances from
  the audio clock on a `setInterval`. To simulate a backgrounded tab, stub
  `window.requestAnimationFrame` so it *stores* the pending callback rather
  than dropping it, then restore it and re-invoke that callback; the frame
  loop re-schedules itself through `window.requestAnimationFrame`, so a
  naive `() => 0` stub kills the loop permanently and can't be resumed.
- The rails are hidden in Drift mode (`body[data-mode='drift'] .rail`), so an
  element screenshot of `#rail-left` hangs until it times out. Click
  `#mode-toggle`'s Calibrate button first. Reading rail text via
  `page.evaluate` works either way — hidden elements are still in the DOM.
- Visuals parented inside `worldGroup` are scaled ~2.3x; scene-level
  planes must be sized to the camera frustum (fov 42, camera z ≈ 16 ± drift).
