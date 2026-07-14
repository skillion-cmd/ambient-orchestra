import type { AppKnobs, HarmonicContext } from '../audio/types';
import { DEFAULT_KNOBS } from '../audio/types';
import type { AppMode } from './AppMode';
import { Knob } from './Knob';
import { KnobAutomator } from './KnobAutomator';

type KnobBinding = {
  section: 'sound' | 'visual';
  key: keyof AppKnobs['sound'] | keyof AppKnobs['visual'];
  knob: Knob;
};

interface KnobSpec {
  key: keyof AppKnobs['sound'] | keyof AppKnobs['visual'];
  label: string;
  left: string;
  right: string;
  section: 'sound' | 'visual';
}

// Internal keys are engine plumbing; labels are the user-facing levers.
const AUDIO_KNOBS: KnobSpec[] = [
  { key: 'pulse', label: 'Tempo', left: 'Slow', right: 'Fast', section: 'sound' },
  { key: 'activity', label: 'Density', left: 'Sparse', right: 'Lush', section: 'sound' },
  { key: 'memory', label: 'Melody', left: 'Texture', right: 'Tune', section: 'sound' },
  { key: 'entropy', label: 'Variation', left: 'Settled', right: 'Wandering', section: 'sound' },
  { key: 'warmth', label: 'Brightness', left: 'Dark', right: 'Bright', section: 'sound' },
  { key: 'space', label: 'Space', left: 'Close', right: 'Cathedral', section: 'sound' },
  { key: 'foundation', label: 'Sub', left: 'Light', right: 'Heavy', section: 'sound' },
  { key: 'width', label: 'Width', left: 'Mono', right: 'Wide', section: 'sound' },
  { key: 'texture', label: 'Texture', left: 'Pure', right: 'Grainy', section: 'sound' },
];

const VISUAL_KNOBS: KnobSpec[] = [
  { key: 'grain', label: 'Grain', left: 'Fine', right: 'Dense', section: 'visual' },
  { key: 'ripple', label: 'Ripple', left: 'Smooth', right: 'Jagged', section: 'visual' },
  { key: 'drift', label: 'Drift', left: 'Tight', right: 'Mist', section: 'visual' },
  { key: 'focus', label: 'Focus', left: 'Ghosts', right: 'Bodies', section: 'visual' },
  { key: 'trails', label: 'Trails', left: 'Crisp', right: 'Streaks', section: 'visual' },
  { key: 'fog', label: 'Fog', left: 'Clear', right: 'Dense', section: 'visual' },
];

export class Controls {
  /** Audio knob grid — mounts into the left rail. */
  readonly audioElement: HTMLElement;
  /** Visual knob grid — mounts into the right rail. */
  readonly visualElement: HTMLElement;
  private readonly automator = new KnobAutomator();
  private readonly bindings: KnobBinding[] = [];
  private mode: AppMode = 'drift';
  private readonly initialKnobs: AppKnobs;

  constructor(
    private readonly onKnobsChange: (knobs: AppKnobs) => void,
    initial?: AppKnobs,
  ) {
    this.initialKnobs = initial ?? DEFAULT_KNOBS;
    this.audioElement = this.createGrid(AUDIO_KNOBS);
    this.audioElement.classList.add('knob-grid--three');
    this.visualElement = this.createGrid(VISUAL_KNOBS);
    if (initial) this.automator.setKnobs(initial);
    this.automator.setFullAuto(true);
  }

  getKnobs(): AppKnobs {
    return this.automator.getKnobs();
  }

  /** Seed widgets and engine from a stored calibration. */
  setKnobs(knobs: AppKnobs): void {
    for (const b of this.bindings) {
      const val =
        b.section === 'sound'
          ? knobs.sound[b.key as keyof AppKnobs['sound']]
          : knobs.visual[b.key as keyof AppKnobs['visual']];
      b.knob.setValue(val);
    }
    this.automator.syncFromUser(knobs);
    this.onKnobsChange(this.automator.getKnobs());
  }

  setMode(mode: AppMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'drift') {
      // Resume drifting from wherever the user left the knobs.
      this.automator.syncFromUser(this.automator.getKnobs());
      this.automator.setFullAuto(true);
    } else {
      this.automator.setFullAuto(false);
    }
  }

  /** Autonomous drift — call each frame while in Drift mode */
  update(dt: number, harmonic: HarmonicContext): void {
    if (this.mode === 'calibrate') return;
    const userDragging = this.bindings.some((b) => b.knob.isDragging());
    const prev = this.automator.getKnobs();
    const next = this.automator.update(dt, harmonic, userDragging);

    if (!userDragging) {
      let uiChanged = false;
      for (const b of this.bindings) {
        const val =
          b.section === 'sound'
            ? next.sound[b.key as keyof AppKnobs['sound']]
            : next.visual[b.key as keyof AppKnobs['visual']];
        if (Math.abs(b.knob.getValue() - val) > 0.002) {
          b.knob.setValue(val);
          uiChanged = true;
        }
      }
      if (uiChanged || soundKnobsChanged(prev.sound, next.sound) || visualKnobsChanged(prev.visual, next.visual)) {
        this.onKnobsChange(next);
      }
    }
  }

  private createGrid(items: KnobSpec[]): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'knob-grid';

    for (const item of items) {
      const initial =
        item.section === 'sound'
          ? this.initialKnobs.sound[item.key as keyof AppKnobs['sound']]
          : this.initialKnobs.visual[item.key as keyof AppKnobs['visual']];

      const knob = new Knob(item.label, item.left, item.right, initial, (value) => {
        const current = this.automator.getKnobs();
        if (item.section === 'sound') {
          current.sound[item.key as keyof AppKnobs['sound']] = value;
        } else {
          current.visual[item.key as keyof AppKnobs['visual']] = value;
        }
        this.automator.syncFromUser(current);
        this.onKnobsChange(this.automator.getKnobs());
      });

      this.bindings.push({ section: item.section, key: item.key, knob });
      grid.appendChild(knob.element);
    }

    return grid;
  }
}

function soundKnobsChanged(
  a: AppKnobs['sound'],
  b: AppKnobs['sound'],
): boolean {
  const keys = Object.keys(a) as (keyof AppKnobs['sound'])[];
  return keys.some((k) => Math.abs(a[k] - b[k]) > 0.001);
}

function visualKnobsChanged(
  a: AppKnobs['visual'],
  b: AppKnobs['visual'],
): boolean {
  const keys = Object.keys(a) as (keyof AppKnobs['visual'])[];
  return keys.some((k) => Math.abs(a[k] - b[k]) > 0.001);
}
