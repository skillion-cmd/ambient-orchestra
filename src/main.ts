import { AudioEngine } from './audio/AudioEngine';
import { ConductorSkill } from './audio/ConductorSkill';
import { Visualizer } from './visual/Visualizer';
import { ArtDirectorSkill, type ArtDirectorDirectives } from './visual/ArtDirectorSkill';
import { Controls } from './ui/Controls';
import { SessionReadout } from './ui/SessionReadout';
import { ThemeToggle } from './ui/ThemeToggle';
import { CymaticsOverlay } from './ui/CymaticsOverlay';
import { VisualScope } from './ui/VisualScope';
import { PerfMonitor } from './diagnostics/PerfMonitor';
import { applyUiTheme, loadStoredTheme, storeTheme } from './visual/ScenePalette';
import { loadStoredKnobs, loadStoredMode, storeKnobs, storeMode, type AppMode } from './ui/AppMode';
import { ModeToggle } from './ui/ModeToggle';

const initialTheme = loadStoredTheme();
applyUiTheme(initialTheme);

let mode: AppMode = loadStoredMode();
document.body.dataset.mode = mode;

const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
const railLeft = document.getElementById('rail-left')!;
const railRight = document.getElementById('rail-right')!;
const leftData = document.getElementById('rail-left-data')!;
const leftKnobs = document.getElementById('rail-left-knobs')!;
const rightData = document.getElementById('rail-right-data')!;
const rightKnobs = document.getElementById('rail-right-knobs')!;
const rightToggleSlot = document.getElementById('rail-right-toggle')!;
const modeToggleSlot = document.getElementById('mode-toggle')!;
const overlay = document.getElementById('overlay')!;
const errorOverlay = document.getElementById('error-overlay')!;
const errorMessage = document.getElementById('error-message')!;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;

function showFatalError(message: string): void {
  errorMessage.textContent = message;
  errorOverlay.classList.remove('hidden');
  overlay.classList.add('hidden');
  startBtn.disabled = true;
}

const { visualizer, error: visualError } = Visualizer.tryCreate(canvas);
if (!visualizer || visualError !== 'ok') {
  showFatalError(
    'WebGL is unavailable. Ambient Orchestra needs a GPU-accelerated browser to render the visual field.',
  );
}

const audioEngine = new AudioEngine();
const conductorSkill = new ConductorSkill();
const artDirectorSkill = new ArtDirectorSkill();
const perfMonitor = new PerfMonitor();
let lastArt: ArtDirectorDirectives = {
  fogMultiplier: 1,
  focusOffset: 0,
  moodBlend: 0,
  constellationTrigger: false,
};

let knobSaveTimeout: ReturnType<typeof setTimeout> | null = null;
const controls = new Controls((knobs) => {
  audioEngine.setKnobs(knobs);
  // Only a deliberate calibration is worth remembering — Drift churns values.
  if (mode === 'calibrate') {
    if (knobSaveTimeout) clearTimeout(knobSaveTimeout);
    knobSaveTimeout = setTimeout(() => storeKnobs(controls.getKnobs()), 500);
  }
}, loadStoredKnobs() ?? undefined);
audioEngine.setKnobs(controls.getKnobs());

// ——— Left rail: audio ———
const sessionReadout = new SessionReadout(
  () => audioEngine.requestNextPhase(),
  () => audioEngine.requestNextMovement(),
);
const cymaticsOverlay = new CymaticsOverlay(leftData);
leftData.insertBefore(sessionReadout.element, leftData.firstChild);
leftKnobs.appendChild(controls.audioElement);

// ——— Right rail: visual ———
const visualScope = new VisualScope(rightData, () => visualizer?.requestNextForm());
rightKnobs.appendChild(controls.visualElement);

const themeToggle = new ThemeToggle(initialTheme, (theme) => {
  storeTheme(theme);
  applyUiTheme(theme);
  visualizer?.setTheme(theme);
  cymaticsOverlay.refreshTheme();
  visualScope.refreshTheme();
});
rightToggleSlot.appendChild(themeToggle.element);

function setMode(next: AppMode): void {
  mode = next;
  document.body.dataset.mode = next;
  storeMode(next);
  controls.setMode(next);
  audioEngine.setMode(next);
  if (next === 'calibrate') {
    // A calibration survives a Drift excursion.
    const stored = loadStoredKnobs();
    if (stored) controls.setKnobs(stored);
  }
}

const modeToggle = new ModeToggle(mode, setMode);
modeToggleSlot.appendChild(modeToggle.element);
controls.setMode(mode);
audioEngine.setMode(mode);

let lastTime = performance.now();
let running = false;

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dtMs = now - lastTime;
  const dt = Math.min(dtMs / 1000, 0.05);
  lastTime = now;

  if (running && visualizer) {
    audioEngine.update(dt);
    const features = audioEngine.getAudioFeatures();
    const harmonic = audioEngine.getHarmonicContext();

    // Autonomous creative direction — Conductor shapes audio, Art Director visuals.
    audioEngine.applyDirectives(conductorSkill.update(harmonic, dt));
    lastArt = artDirectorSkill.update(harmonic, features, dt);
    visualizer.applyDirectives(lastArt);

    controls.update(dt, harmonic);
    const visualReadout = visualizer.getReadoutState(harmonic);
    sessionReadout.update(audioEngine.getMovementReadoutState());
    visualizer.update(features, dt, controls.getKnobs().visual, harmonic, audioEngine.getSpectrum());
    cymaticsOverlay.update(features, harmonic, controls.getLastTouched());
    visualScope.update(visualReadout, controls.getKnobs().visual, lastArt);

    perfMonitor.frame(dtMs, {
      audioRunning: audioEngine.isContextRunning(),
      level: features.overall,
      phase: harmonic.movementPhase,
    });
  }
}

requestAnimationFrame(loop);

window.addEventListener('resize', () => visualizer?.resize());

window.addEventListener('beforeunload', () => {
  visualizer?.dispose();
  audioEngine.dispose();
});

function toggleRails(): void {
  const hide = !railLeft.hidden;
  railLeft.hidden = hide;
  railRight.hidden = hide;
}

startBtn.addEventListener('click', async () => {
  if (!visualizer) return;
  try {
    await audioEngine.start();
    running = true;
    overlay.classList.add('hidden');
    railLeft.hidden = false;
    railRight.hidden = false;
    modeToggleSlot.hidden = false;
    cymaticsOverlay.show();
  } catch (err) {
    const msg =
      err instanceof Error && err.message.includes('AudioContext')
        ? 'Audio could not start. Try clicking again or check browser audio permissions.'
        : 'Audio failed to start. Refresh and click to begin again.';
    showFatalError(msg);
  }
});

document.addEventListener('dblclick', () => toggleRails());

document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    toggleRails();
  }
  if (e.key === 'd' || e.key === 'D') {
    perfMonitor.toggle();
  }
});
