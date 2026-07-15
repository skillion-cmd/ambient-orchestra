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
- Mode: the Drift/Calibrate toggle is `#mode-toggle`; body has
  `data-mode`. Knob persistence writes `ao-knobs` (calibrate only,
  debounced 500ms).
- Right-rail toggles (`#rail-right-toggle`): theme button says the
  *destination* ("Dark field" when light), same for Field/Currents
  ("Currents" when in field mode).
- Seed localStorage via `page.addInitScript` to test stored-calibration
  paths (`ao-knobs`, `ao-mode`, `ao-theme`, `ao-visual-mode`).

Screenshots after ~5s of runtime give the trail buffer time to develop —
a fresh switch looks empty.

## Gotchas

- `/favicon.ico` 404s in the console — pre-existing, ignore.
- Visuals parented inside `worldGroup` are scaled ~2.3x; scene-level
  planes must be sized to the camera frustum (fov 42, camera z ≈ 16 ± drift).
