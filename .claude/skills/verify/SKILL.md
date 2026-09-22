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
  mouse-up (pointer events, so Playwright's mouse and `Input.dispatchTouchEvent`
  both drive them). Read back via the sibling `.knob-value` text, or the
  dial's own `--knob-turn` custom property and `aria-valuenow`. 200px of
  travel is the full 0–1 sweep. A focused dial also takes arrow keys, home
  and end.
- Mode: `#mode-toggle` holds five buttons in order — Drift, Calibrate, Play,
  Kit, Stage — and body carries `data-mode`. Knob persistence writes
  `ao-knobs` (every mode but Drift, debounced 500ms).
- Each rail is two `.rail-section` bands — `.rail-section--readout` (nothing
  in it is pressable; both canvases are `.scope-canvas` with pointer events
  off) and `.rail-section--controls`. The movement row is now text only:
  `.readout-value` holds the phase name, and the buttons that were hidden in
  it are `.readout-action` buttons in the controls band, captioned `Next
  phase`, `Next movement` and `Next form`. There is no shift-click path any
  more.
- Top-centre view toggles (`#view-toggle`, revealed on start like
  `#mode-toggle`): a three-button visual group (`Ink | Currents |
  Resonance`, the active one carrying `is-active`) and the theme button,
  which says its *destination* ("Dark field" when light).
- Seed localStorage via `page.addInitScript` to test stored-calibration
  paths (`ao-knobs`, `ao-mode`, `ao-theme`, `ao-visual-mode`).
- Movements draw a random length and pulse profile, so most paths are
  unreachable by waiting. Force them: `?scale=fragment|short|standard|long|epic`
  `?pulse=silent|felt|kit` and `?character=open|night` (they compose).
  `?character=night` is the only practical way to hear the 2-step: it forces
  garage tempo, the minor mode pool, and the vinyl crackle bed. `?scale=fragment` also gets you
  a doorway crossing every ~80s — the walk into the neighbouring room is
  forced as each movement runs out, and shows up as `between rooms` in the
  left-rail sub-line, followed by a new movement index.

- The Calibrate rail has a piece picker (`.piece-picker`, hidden in Drift
  and in Play): a length row then an `OPEN | NIGHT | PLAY` row. Clicking Play
  queues the choice and triggers the usual dissolve-and-skip, so allow ~25s
  before the new piece reports in the readout.

- Play mode (`.play-panel` inside `#play-stage` — fixed centre-screen above
  the mode toggle, revealed on start like `#mode-toggle`, hidden in Drift and
  Calibrate; it is no longer in the left rail). Playwright cannot present a
  MIDI device, so the computer keyboard is the automatable path — everything
  below works headless:
  - Notes: `page.keyboard.down('a')` etc. on the tracker layout (`a s d f g
    h j k l ;` white, `w e t y u o p` black, `z`/`x` octave). `.play-notes`
    reports the *sounded* pitches. In the default chromatic tuning those are
    the keys pressed — `a s d f g` gives `C4 D4 E4 F4 G4` in any key. In
    In-key they differ only for the keys outside the field's key: in G
    lydian `a` (C4) sounds `B3`, everything else in the scale sounds itself.
  - `.play-key-cap.is-held` counts the lit keys on the on-screen keyboard;
    the caps themselves are clickable via `pointerdown` / `pointerup`.
  - Each white cap's `textContent` is the pitch that key will sound and its
    `title` is the full story (`C4 — outside G lydian, sounds B3`). That is
    the assertion worth making about the keybed: strike each white key
    through `getPlayInstrument().noteOn` and compare `getSoundingNotes()`
    against the cap's own text — they have to match for all fifteen, in both
    tunings. Keys outside the field's key carry `is-outside` in either
    tuning; `.play-key` sums it up (`G lydian — every key sounds itself`).
  - The ensemble duck shows as `.play-notes.is-ducked`, and the line reads
    `orchestra held back` while it is still leaning away — a few seconds
    after the last note-off, since the duck follows play energy and that
    decays rather than switching off.
  - Preset row is `.play-presets button`; the tuning toggle, octave steppers
    and the Behind/With/Front blend row are each a `.play-row` (`.play-blend`
    for the last). Panel state persists to `ao-play`
    (`{presetId, tuning, octaveShift, blend, voiceMode}`); learned MIDI
    bindings to `ao-midi-map`. Both seed cleanly via `page.addInitScript`. A
    stored state from before `blend` or `voiceMode` existed backfills rather
    than resetting.
  - Melody / Beat is `.play-voice-mode button`. In Beat the preset, tuning and
    octave rows are `hidden`, the white key caps carry their piece as text,
    `.play-kit-legend` names the five black-key pieces, and `.play-notes`
    reports the pieces just struck (`Kick · Hat`) rather than pitches — they
    decay after ~1.6s, so read it right after the key-down. The kit is laid
    out from C: `a` is the kick, `d` the snare, `f`/`g` the hats.
  - Restoring `ao-mode: 'play'` from storage arms the keybed on load, so a
    seeded Play session answers typed keys without touching the mode toggle.

- Kit mode (`.kit-panel`, in the same `#play-stage` as the instrument — one
  panel per mode, gated in CSS, so assert on the panel and not on the stage):
  - The grid is `.kit-grid-row` (12, in drum-machine order: ride at the top,
    kick at the bottom) each holding a `.kit-piece` label button and 16
    `.kit-cell`s. A cell cycles silent → `is-on` → `is-on is-accent` →
    silent on successive clicks, and its `aria-label` says which
    (`Ride, bar 1 step 2: accent`). Shift-clicking a `.kit-piece` clears
    that row; clicking it auditions the piece.
  - `.kit-bars button` is the 2 / 4 / 8 loop length and `.kit-pages button`
    the bar pager — note both rows open with a `.kit-row-label` span, so the
    first *button* is `:nth-child(2)`. Growing the loop tiles: after 2 → 8,
    bar 5 holds what bar 1 holds. The pager does not follow the playhead; the
    bar being played carries `is-sounding` instead.
  - `.kit-play` starts the loop. `.kit-cell.is-playhead` is the sounding
    column and is only drawn on the bar being edited, so a check for it has
    to poll until the playhead reaches that page (12 cells when it does).
    `window.__ao.getKitSequencer().getDisplayStep()` is the same number
    without the DOM, and `isKitLoopPlaying()` the state.
  - The pattern persists to `ao-kit` (`{bars, rows: {piece: "0102…"}}`, one
    digit per step, silent rows omitted) and seeds cleanly via
    `addInitScript`. A first session with nothing stored opens on the Four
    preset rather than an empty grid.
  - The keybed stays live in Kit and strikes the kit whatever Play's own
    Melody/Beat is set to — `getPlayVoiceMode()` still reports what Play was
    left on, while `getPlaySounding()` returns piece names.

- Stage mode (`.stage-panel`, same stage):
  - `.stage-cue` cards, each with two `select`s (phase then length — the
    length one is `.stage-select:nth-of-type(2)`), five `.stage-layer`
    toggles, a `.stage-kit` toggle and four `.stage-cue-tools` buttons
    (↑ ↓ duplicate remove, in that order). `.stage-add` appends.
    `.stage-cue.is-live` is the cue being heard.
  - `.stage-start` runs the set; `.stage-status` says where it has got to
    (`starting on the next bar` → `cue 2 of 4 — Bloom, 3 bars left`), and
    `.stage-total` the length. The set persists to `ao-stage`.
  - `window.__ao.getPerformanceState()` gives `{state, position}` without the
    DOM, and `getTransportBar()` the bar it counts in. Cue boundaries land on
    bar lines: sampling that inside the page (a `setInterval` pushing to an
    array, read back in one `evaluate`) is the only way to measure them —
    driving the sampling from Node adds seconds of round-trip lag to a heavy
    WebGL page and makes correct timings look wrong.
  - `startFresh: 'night'|'open'` makes the set wait for a requested piece
    before its first cue — allow ~15s for the dissolve bridge, and expect
    `getHarmonicContext().movementIndex` to change at the moment it opens.
  - A cue's layer mask multiplies the bus gains, so a cue that drops the pads
    shows up as `padBus.gain.value` near 0.06 of where it was, and the buses
    come back when the set is stopped.

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
  - Neither tuning transposes: a key sounds in the octave it was played in,
    so the tuning toggle changes which notes are reachable and never which
    register your hands are standing in. If flipping it moves the pitch by
    more than a semitone on a key that is in the scale, the mapper has gone
    back to walking degrees.

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
two bands: worst-frame peak below 32Hz against 32–120Hz. Sub-audible energy is
inaudible by definition, so it cannot be found by listening and does not show
up in a peak meter either — the gap between those two bands is the number that
moves. It should sit around 12dB; when it was 3.6dB the kick's fundamental was
at 18–29Hz.

Screenshots after ~5s of runtime give the trail buffer time to develop —
a fresh switch looks empty.

## Gotchas

- `/favicon.ico` 404s in the console — pre-existing, ignore.
- `D` toggles the PerfMonitor everywhere but Play and Kit: in both of those
  it is a white key, and the shortcut stands down rather than firing every
  time you play an E. Note also that `.perf-monitor` is an empty zero-height div until
  a frame writes into it, so assert on its presence, not `isVisible`.
- The left rail's `.rail-data` scrolls (`min-height: 0; overflow-y: auto`) so
  a tall panel can't walk the knob grid off the bottom. An element below the
  fold is scrolled, not missing — `scrollIntoViewIfNeeded()` before clicking.
  In the compact layout the `.rail` itself is the scroller instead.
- Below 820px viewport width the layout switches to the phone dock and a lot
  of the above moves. `document.body` carries `data-layout`
  (`compact`/`wide`), `data-panel` (`audio`/`visual`/`play`, absent in Drift)
  and `data-dock` (`open`/`collapsed`). The tab bar is `#dock-bar` (revealed
  on start like `#mode-toggle`), its tabs `#dock-tabs button`, and
  `#dock-collapse` toggles the sheet. Panels that aren't selected are
  `display: none`, so an element screenshot of the hidden rail hangs the same
  way it does in Drift — switch tabs first. Play draws one octave there
  (13 `.play-key-cap`s, not 25) and hides `.play-learn`; crossing the
  breakpoint with `setViewportSize` rebuilds the keys.
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
- The Resonance plate is deliberately *not* the shape of the window: it takes
  the square root of the window's aspect, caps at 4:3, and is fitted to the
  field left over above the phone dock (`Visualizer.setFieldInset`). So on a
  wide screen it stands in the middle with margins either side, and on a
  phone it is a letterbox above the sheet — both are correct. Judge it on
  whether the diagonals reach the plate's own corners; when they stop
  short, the plate has been cut too wide.
