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
import { KitPanel } from './ui/KitPanel';
import { StagePanel } from './ui/StagePanel';
import { PlayController } from './input/PlayController';
import {
  hitCount,
  KIT_PATTERN_PRESETS,
  loadStoredPattern,
  patternFromPreset,
  storePattern,
} from './audio/KitPattern';
import { KIT_LAYOUT } from './audio/PlayKit';
import {
  defaultPerformance,
  loadStoredPerformance,
  storePerformance,
} from './audio/Performance';
import { DEFAULT_BLEND_ID, DEFAULT_VOICE_MODE } from './audio/PlayBlend';
import { DEFAULT_PRESET_ID, findPreset } from './audio/PlayPresets';
import { VisualModeToggle } from './ui/VisualModeToggle';
import { Dock } from './ui/Dock';
import { railSection } from './ui/RailSection';
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
const playStage = document.getElementById('play-stage')!;
const dockElement = document.getElementById('dock')!;
const dockBar = document.getElementById('dock-bar')!;
const dockTabs = document.getElementById('dock-tabs')!;
const dockCollapse = document.getElementById('dock-collapse') as HTMLButtonElement;
const viewToggleSlot = document.getElementById('view-toggle')!;
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
// Two named bands rather than one column of small type. Everything in the
// readout band is the engine talking and cannot be pressed; everything in the
// controls band has a box around it and can. Before the split, the phase name
// was a button that looked like a word and the cymatics canvas was a picture
// that looked like a button.
const audioReadout = railSection('readout', 'Readout');
const audioControls = railSection('controls', 'Controls');
const sessionReadout = new SessionReadout(
  () => audioEngine.requestNextPhase(),
  () => audioEngine.requestNextMovement(),
);
const cymaticsOverlay = new CymaticsOverlay();
const piecePicker = new PiecePicker((request) => audioEngine.requestPiece(request));
audioReadout.body.append(sessionReadout.element, cymaticsOverlay.element);
audioControls.body.append(sessionReadout.controls, piecePicker.element, controls.audioElement);
leftData.appendChild(audioReadout.element);
leftKnobs.appendChild(audioControls.element);

// ——— Play: the instrument at the front of the mix ———
const storedPlay = loadStoredPlayState();
const playPanel = new PlayPanel(
  {
    presetId: findPreset(storedPlay?.presetId ?? DEFAULT_PRESET_ID).id,
    // Chromatic by default. The panel draws a piano, and the first thing a
    // player does with a drawn piano is check that a key sounds the note
    // written on it. In-key is the aid, one click away, and it is now honest
    // enough to be one — but the unaided instrument has to be literal.
    tuning: storedPlay?.tuning ?? 'chromatic',
    octaveShift: storedPlay?.octaveShift ?? 0,
    blend: storedPlay?.blend ?? DEFAULT_BLEND_ID,
    voiceMode: storedPlay?.voiceMode ?? DEFAULT_VOICE_MODE,
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
    onVoiceMode: (voiceMode) => {
      playController.setVoiceMode(voiceMode);
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
audioEngine.setPlayVoiceMode(initialPlay.voiceMode);
playPanel.setStatus('idle', null);
// Centre stage, not in the rail. The rails are for watching the engine work;
// the instrument is the thing you are actually using in Play, and it was the
// one surface here you had to hunt for. CSS hides the stage in the other two
// modes, the way it always hid the panel.
playStage.appendChild(playPanel.element);

// ——— Kit: the loop you build rather than play ———
// Same centre stage as the instrument, and the same rule: one panel per mode,
// gated in CSS. The grid is the only surface in the app that *makes*
// something the engine then plays back, so it owns a pattern and hands it to
// the sequencer on every edit.
const kitPanel = new KitPanel(
  // A first session opens on a groove rather than on 192 empty cells. It is
  // saved the moment anything is changed, and never before — an untouched
  // starter pattern is not someone's work, and storing it would mean a
  // second session could never be given a different one.
  loadStoredPattern() ?? patternFromPreset(KIT_PATTERN_PRESETS[0]!, 2),
  {
    onPattern: (pattern) => {
      audioEngine.setKitPattern(pattern);
      storePattern(pattern);
    },
    onPlaying: (playing) => audioEngine.setKitLoopPlaying(playing),
    onAudition: (piece) => {
      // The kit is laid out by semitone from C, and in Kit mode every key is
      // a drum — so the row label plays its own piece through exactly the
      // path a pressed key would take.
      const note = 60 + KIT_LAYOUT.indexOf(piece);
      playController.noteOn(note, 0.8);
      playController.noteOff(note);
    },
  },
);
audioEngine.setKitPattern(kitPanel.getPattern());
playStage.appendChild(kitPanel.element);

// ——— Stage: the performance, written down ———
const stagePanel = new StagePanel(loadStoredPerformance() ?? defaultPerformance(), {
  onChange: (performance) => storePerformance(performance),
  onStart: (performance) => audioEngine.startPerformance(performance),
  onStop: () => audioEngine.stopPerformance(),
});
playStage.appendChild(stagePanel.element);

// ——— The phone layout ———
// Below the width where two rails and a field fit side by side, the rails,
// the instrument and the mode switch become one bottom sheet with tabs. The
// dock publishes that state as attributes on <body>; the stylesheet does the
// rest, and no node moves between the two layouts.
// Read by syncFieldInset, which the Dock calls from its own constructor —
// before `dock` itself is bound, so it cannot ask the dock.
let dockCompact = false;
const dock = new Dock(dockBar, dockTabs, dockCollapse, mode, {
  onCompactChange: (compact) => {
    dockCompact = compact;
    playPanel.setCompact(compact);
    syncFieldInset();
  },
  onLayoutChange: () => syncFieldInset(),
});

/**
 * Tell the field how much of the screen the sheet is standing on.
 *
 * Only Resonance acts on it, and it has to: the plate is one object, and
 * centred in the window on a phone it sat almost entirely behind the
 * controls. On a wide screen the dock generates no box at all, so there is
 * nothing covered and the measurement is skipped rather than read off a
 * zero-sized rect.
 */
function syncFieldInset(): void {
  if (!visualizer) return;
  if (!dockCompact) {
    visualizer.setFieldInset(0);
    return;
  }
  const height = window.innerHeight;
  const covered = Math.max(0, height - dockElement.getBoundingClientRect().top);
  visualizer.setFieldInset(height > 0 ? covered / height : 0);
}

// ——— Right rail: visual ———
const visualReadoutSection = railSection('readout', 'Readout');
const visualControlsSection = railSection('controls', 'Controls');
const visualScope = new VisualScope(() => visualizer?.requestNextForm());
visualReadoutSection.body.appendChild(visualScope.element);
visualControlsSection.body.append(visualScope.controls, controls.visualElement);
rightData.appendChild(visualReadoutSection.element);
rightKnobs.appendChild(visualControlsSection.element);

// ——— Top centre: what you are looking at ———
// Which visual and which field, in the open above the canvas rather than in
// the right rail — they are the two switches you reach for while watching,
// and in Drift the rail that used to hold them isn't there.
const visualModeToggle = new VisualModeToggle(loadStoredVisualMode(), (visualMode) => {
  visualizer?.setVisualMode(visualMode);
});

const themeToggle = new ThemeToggle(initialTheme, (theme) => {
  // Store the preference; applyFieldTheme decides what the field actually
  // shows, since a running night piece keeps the dark field until it ends.
  storeTheme(theme);
  applyFieldTheme(audioEngine.getHarmonicContext().character);
});
viewToggleSlot.append(visualModeToggle.element, themeToggle.element);

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
  dock.setMode(next);
  // The keybed is live wherever there is something to play with it: an
  // instrument in Play, the kit in Kit — where typing a key auditions a piece
  // against the grid you are writing.
  playController.setActive(next === 'play' || next === 'kit');
  // The engine stops the loop and the set on its way out of their modes; the
  // panels have to hear about it or their buttons keep claiming otherwise.
  if (next !== 'kit') kitPanel.setPlaying(false);
  if (next !== 'stage') stagePanel.setRunning(false);
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
playController.setActive(mode === 'play' || mode === 'kit');
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
      playPanel.update(
        harmonic,
        audioEngine.getPlayHeldKeys(),
        audioEngine.getPlaySounding(),
        audioEngine.getEnsembleDuckDepth(),
        audioEngine.getPlayFollow(),
      );
    } else if (mode === 'kit') {
      kitPanel.update(harmonic, audioEngine.getKitSequencer().getDisplayStep(), audioEngine.getBpm());
    } else if (mode === 'stage') {
      const performance = audioEngine.getPerformanceState();
      stagePanel.update(
        performance.state,
        performance.position,
        audioEngine.getBpm(),
        hitCount(kitPanel.getPattern()),
      );
      // A set that ran out gives the button back rather than sitting there
      // saying Stop over an orchestra that is no longer being conducted.
      if (performance.state === 'done' || performance.state === 'idle') {
        stagePanel.setRunning(false);
      }
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

window.addEventListener('resize', () => {
  visualizer?.resize();
  syncFieldInset();
});

window.addEventListener('beforeunload', () => {
  visualizer?.dispose();
  playController.dispose();
  audioEngine.dispose();
});

function toggleRails(): void {
  // In the phone layout the rails are one docked sheet, so the thing to get
  // out of the way is the sheet — hiding its panels would leave the tab bar
  // stranded at the bottom of the screen with nothing under it.
  if (dock.isCompact()) {
    dock.toggleCollapsed();
    return;
  }
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
    viewToggleSlot.hidden = false;
    playStage.hidden = false;
    dockBar.hidden = false;
    // The sheet only takes its full height once the panels are revealed.
    syncFieldInset();
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
  // D is a white key wherever the keybed is live — the health readout gives
  // it up rather than firing every time you play an E.
  if ((e.key === 'd' || e.key === 'D') && mode !== 'play' && mode !== 'kit') {
    perfMonitor.toggle();
  }
});
