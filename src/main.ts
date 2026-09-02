import { AudioEngine } from './audio/AudioEngine';
import { ConductorSkill } from './audio/ConductorSkill';
import { Visualizer } from './visual/Visualizer';
import { ArtDirectorSkill, type ArtDirectorDirectives } from './visual/ArtDirectorSkill';
import { Controls } from './ui/Controls';
import { SessionReadout } from './ui/SessionReadout';
import { PiecePicker } from './ui/PiecePicker';
import { ThemeToggle } from './ui/ThemeToggle';
import { CymaticsOverlay } from './ui/CymaticsOverlay';
import { VisualScope } from './ui/VisualScope';
import { PerfMonitor } from './diagnostics/PerfMonitor';
import { applyUiTheme, loadStoredTheme, storeTheme, type SceneTheme } from './visual/ScenePalette';
import {
  isDirectMode,
  loadStoredKnobs,
  loadStoredMode,
  loadStoredPlayState,
  storeKnobs,
  storeMode,
  storePlayState,
  type AppMode,
} from './ui/AppMode';
import { ModeToggle } from './ui/ModeToggle';
import { PlayPanel } from './ui/PlayPanel';
import { PlayController } from './input/PlayController';
import { DEFAULT_BLEND_ID } from './audio/PlayBlend';
import { DEFAULT_PRESET_ID, findPreset } from './audio/PlayPresets';
import { VisualModeToggle } from './ui/VisualModeToggle';
import { loadStoredVisualMode } from './visual/VisualMode';
import { clockStep } from './audio/EngineClock';
import type { MovementCharacter } from './audio/types';

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
  if (isDirectMode(mode)) {
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
const piecePicker = new PiecePicker((request) => audioEngine.requestPiece(request));
leftData.insertBefore(sessionReadout.element, leftData.firstChild);
leftData.appendChild(piecePicker.element);
leftKnobs.appendChild(controls.audioElement);

// ——— Play: the instrument at the front of the mix ———
const storedPlay = loadStoredPlayState();
const playPanel = new PlayPanel(
  {
    presetId: findPreset(storedPlay?.presetId ?? DEFAULT_PRESET_ID).id,
    tuning: storedPlay?.tuning ?? 'scale',
    octaveShift: storedPlay?.octaveShift ?? 0,
    blend: storedPlay?.blend ?? DEFAULT_BLEND_ID,
  },
  {
    onPreset: (id) => {
      playController.setPreset(id);
      savePlayState();
    },
    onTuning: (tuning) => {
      playController.setTuning(tuning);
      savePlayState();
    },
    onOctave: (shift) => {
      playController.setOctave(shift);
      savePlayState();
    },
    onBlend: (blend) => {
      audioEngine.setBlend(blend);
      savePlayState();
    },
    onNoteOn: (note, velocity) => playController.noteOn(note, velocity),
    onNoteOff: (note) => playController.noteOff(note),
    onLearn: (target) => playController.setLearning(target),
    onConnectMidi: () => void playController.connect(),
  },
);

const playController = new PlayController(audioEngine, controls, {
  onStatus: (status, name) => playPanel.setStatus(status, name),
  onPreset: (id) => {
    playPanel.setPreset(id);
    savePlayState();
  },
  onOctave: (shift) => {
    playPanel.setOctave(shift);
    savePlayState();
  },
  onLearned: () => playPanel.setLearning(null),
  onNextForm: () => visualizer?.requestNextForm(),
});

function savePlayState(): void {
  storePlayState(playPanel.getState());
}

// Seed the instrument from what the panel restored.
const initialPlay = playPanel.getState();
playController.setPreset(initialPlay.presetId);
playController.setTuning(initialPlay.tuning);
playController.setOctave(initialPlay.octaveShift);
audioEngine.setBlend(initialPlay.blend);
playPanel.setStatus('idle', null);
leftData.appendChild(playPanel.element);

// ——— Right rail: visual ———
const visualScope = new VisualScope(rightData, () => visualizer?.requestNextForm());
rightKnobs.appendChild(controls.visualElement);

const themeToggle = new ThemeToggle(initialTheme, (theme) => {
  // Store the preference; applyFieldTheme decides what the field actually
  // shows, since a running night piece keeps the dark field until it ends.
  storeTheme(theme);
  applyFieldTheme(audioEngine.getHarmonicContext().character);
});
rightToggleSlot.appendChild(themeToggle.element);

const visualModeToggle = new VisualModeToggle(loadStoredVisualMode(), (visualMode) => {
  visualizer?.setVisualMode(visualMode);
});
rightToggleSlot.appendChild(visualModeToggle.element);

/**
 * Night pieces pull the field dark for their duration.
 *
 * The theme button still sets the base preference and is what a night piece
 * returns to when it ends — a piece borrows the field, it doesn't overwrite
 * a choice you made deliberately.
 */
let appliedTheme: SceneTheme = initialTheme;
function applyFieldTheme(character: MovementCharacter): void {
  const want: SceneTheme = character === 'night' ? 'dark' : themeToggle.getTheme();
  if (want === appliedTheme) return;
  appliedTheme = want;
  applyUiTheme(want);
  visualizer?.setTheme(want);
  cymaticsOverlay.refreshTheme();
  visualScope.refreshTheme();
}

function setMode(next: AppMode): void {
  mode = next;
  document.body.dataset.mode = next;
  storeMode(next);
  controls.setMode(next);
  audioEngine.setMode(next);
  playController.setActive(next === 'play');
  if (isDirectMode(next)) {
    // A calibration survives a Drift excursion.
    const stored = loadStoredKnobs();
    if (stored) controls.setKnobs(stored);
  }
  // Web MIDI prompts for permission, so it can only be asked for off the
  // click that switched modes — never on load.
  if (next === 'play') void playController.connect();
}

const modeToggle = new ModeToggle(mode, setMode);
modeToggleSlot.appendChild(modeToggle.element);
controls.setMode(mode);
audioEngine.setMode(mode);
// The restored mode has to arm the instrument too. Web MIDI still isn't asked
// for here — that needs a user gesture — but the computer keybed does not,
// and without this a session that reopened straight into Play showed the
// panel and answered nothing typed at it.
playController.setActive(mode === 'play');
// Dev-only handle for driving the page from a headless browser: the mix is
// the thing that needs verifying and none of it is legible from the DOM, so
// without this a check like "does a chord actually sit above the bed now"
// can only be done by ear. Stripped from the production bundle — `import.meta
// .env.DEV` is a compile-time constant, so the branch is dead code in a build.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__ao = audioEngine;
}

let lastTime = performance.now();
let lastAudioTime = 0;
let running = false;

/**
 * Advance the engine by however much audio time has passed.
 *
 * This is deliberately not driven by requestAnimationFrame. rAF stops in a
 * hidden tab, which used to freeze the Conductor while Tone's transport
 * kept firing the loops already running — the music kept sounding but
 * stopped composing. And rAF deltas were capped per frame, so any frame
 * rate below 20fps advanced the piece slower than real time. Taking time
 * from the audio clock on a timer fixes both, and a tab making sound is
 * exempt from the heavy timer throttling browsers apply to idle ones.
 */
function advanceEngine(): void {
  if (!running) return;

  const { steps, consumedTo } = clockStep(audioEngine.audioTime(), lastAudioTime);
  lastAudioTime = consumedTo;

  for (const step of steps) {
    audioEngine.update(step);
    audioEngine.applyDirectives(conductorSkill.update(audioEngine.getHarmonicContext(), step));
  }
}

const ENGINE_TICK_MS = 100;
setInterval(advanceEngine, ENGINE_TICK_MS);

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dtMs = now - lastTime;
  const dt = Math.min(dtMs / 1000, 0.05);
  lastTime = now;

  if (running && visualizer) {
    // Keep the engine in step with the audio clock on every visible frame
    // too, so a foregrounded tab still gets fine-grained scheduling rather
    // than the timer's coarser cadence.
    advanceEngine();

    const features = audioEngine.getAudioFeatures();
    const harmonic = audioEngine.getHarmonicContext();

    // Visual direction stays on the frame clock — it is what the eye sees.
    lastArt = artDirectorSkill.update(harmonic, features, dt);
    visualizer.applyDirectives(lastArt);
    applyFieldTheme(harmonic.character);

    controls.update(dt, harmonic);
    const visualReadout = visualizer.getReadoutState(harmonic);
    sessionReadout.update(audioEngine.getMovementReadoutState());
    visualizer.update(features, dt, controls.getKnobs().visual, harmonic, audioEngine.getSpectrum());
    cymaticsOverlay.update(features, harmonic, controls.getLastTouched());
    if (mode === 'play') {
      const instrument = audioEngine.getPlayInstrument();
      playPanel.update(
        harmonic,
        instrument.getHeldKeys(),
        instrument.getSoundingNotes(),
        audioEngine.getEnsembleDuckDepth(),
      );
    }
    visualScope.update(visualReadout, controls.getKnobs().visual, lastArt, harmonic);

    perfMonitor.frame(dtMs, {
      audioRunning: audioEngine.isContextRunning(),
      level: features.overall,
      phase: harmonic.movementPhase,
      bpm: audioEngine.getBpm(),
      beatScale: harmonic.harmonicBeatScale,
    });
  }
}

requestAnimationFrame(loop);

window.addEventListener('resize', () => visualizer?.resize());

window.addEventListener('beforeunload', () => {
  visualizer?.dispose();
  playController.dispose();
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
    lastAudioTime = audioEngine.audioTime();
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
  // D is a white key in Play mode — the health readout gives it up rather
  // than firing every time you play an E.
  if ((e.key === 'd' || e.key === 'D') && mode !== 'play') {
    perfMonitor.toggle();
  }
});
