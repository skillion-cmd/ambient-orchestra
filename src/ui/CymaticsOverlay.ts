import type { AudioFeatures, HarmonicContext, MovementPhase } from '../audio/types';
import type { LastTouchedKnob } from './Controls';

/** How long a touched knob's label/value replaces the KEY line. */
const TOUCH_ECHO_MS = 1500;

const PHASE_LABELS: Record<MovementPhase, string> = {
  drift: 'HAZE',
  gather: 'GATHER',
  bloom: 'BLOOM',
  hang: 'HANG',
  dissolve: 'MORPH',
  exhale: 'EXHALE',
};

const W = 220;
const H = 176;
const WAVE_H = 72;

/** Voice groups shown in the ensemble meter, in display order. */
const GROUP_ORDER = [
  ['bed', 'BED'],
  ['melody', 'MEL'],
  ['shimmer', 'SHM'],
  ['air', 'AIR'],
  ['foundation', 'FND'],
  ['flurry', 'FLR'],
  ['clips', 'CLP'],
] as const;

interface Palette {
  text: string;
  muted: string;
  faint: string;
  border: string;
}

/**
 * Minimal cymatics / sound-vibration readout in the upper-right corner.
 * Two interweaving sine curves driven by the spectrum, beat markers, and a
 * compact phase/band data block — matched to the existing monospace UI.
 */
export class CymaticsOverlay {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private palette: Palette;
  private phase = 0;
  private lastNow = performance.now();
  // Smoothed band levels for steadier bars/curves.
  private bass = 0;
  private mids = 0;
  private highs = 0;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'cymatics-overlay';

    this.canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(W * dpr);
    this.canvas.height = Math.floor(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable for cymatics overlay');
    this.ctx = ctx;
    this.ctx.scale(dpr, dpr);

    this.element.appendChild(this.canvas);
    parent.appendChild(this.element);
    this.palette = this.readPalette();
  }

  /** Re-read theme colors after a light/dark toggle. */
  refreshTheme(): void {
    this.palette = this.readPalette();
  }

  show(): void {
    this.element.classList.add('visible');
  }

  update(
    features: AudioFeatures,
    harmonic: HarmonicContext,
    lastTouched: LastTouchedKnob | null = null,
  ): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastNow) / 1000, 0.05);
    this.lastNow = now;
    this.phase += dt * 0.9;

    const k = 1 - Math.exp(-dt / 0.18);
    this.bass += (features.bass - this.bass) * k;
    this.mids += (features.mids - this.mids) * k;
    this.highs += (features.highs - this.highs) * k;

    const touch =
      lastTouched &&
      lastTouched.section === 'sound' &&
      now - lastTouched.at < TOUCH_ECHO_MS
        ? lastTouched
        : null;
    this.draw(harmonic, touch);
  }

  private draw(harmonic: HarmonicContext, touch: LastTouchedKnob | null): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);

    const midY = WAVE_H * 0.5;

    // ——— Beat markers (4 per bar) ———
    for (let b = 0; b < 4; b++) {
      const x = ((b + 0.5) / 4) * W;
      const isCurrent = b === harmonic.beatInBar;
      const tall = isCurrent ? WAVE_H * 0.42 : WAVE_H * 0.24;
      c.strokeStyle = isCurrent ? this.palette.muted : this.palette.border;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + 0.5, midY - tall);
      c.lineTo(x + 0.5, midY + tall);
      c.stroke();
      if (isCurrent && harmonic.ensemblePulse > 0.3) {
        c.fillStyle = this.palette.faint;
        c.beginPath();
        c.arc(x + 0.5, midY, 2, 0, Math.PI * 2);
        c.fill();
      }
    }

    // ——— Two interweaving sine curves ———
    const ampA = WAVE_H * 0.18 * (0.4 + this.bass * 1.6);
    const ampB = WAVE_H * 0.13 * (0.4 + this.highs * 1.8);
    this.drawCurve(midY, ampA, 1.4, this.phase, this.palette.text, 0.55);
    this.drawCurve(midY, ampB, 3.2, this.phase * 1.7 + 1.3, this.palette.text, 0.32);

    // ——— Divider ———
    c.strokeStyle = this.palette.border;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, WAVE_H + 0.5);
    c.lineTo(W, WAVE_H + 0.5);
    c.stroke();

    // ——— Data labels ———
    c.font = "9px 'SF Mono', 'Menlo', 'Consolas', monospace";
    c.textBaseline = 'middle';

    const mvIndex = String((harmonic.movementIndex % 100) + 1).padStart(2, '0');
    const phaseLabel = PHASE_LABELS[harmonic.movementPhase];
    const bar = String(harmonic.currentBar % 100).padStart(2, '0');
    c.fillStyle = this.palette.muted;
    c.textAlign = 'left';
    c.fillText(`M${mvIndex} ${phaseLabel}`, 2, WAVE_H + 16);
    c.textAlign = 'right';
    c.fillText(`BAR ${bar}`, W - 2, WAVE_H + 16);

    this.drawBands(WAVE_H + 32);

    // Key / mode line — briefly replaced by the knob being dragged so
    // calibration has a console echo next to the sound it changes.
    if (touch) {
      c.fillStyle = this.palette.muted;
      c.textAlign = 'left';
      c.fillText('SET', 2, WAVE_H + 48);
      c.fillStyle = this.palette.text;
      c.textAlign = 'right';
      const pct = String(Math.round(touch.value * 100)).padStart(2, '0');
      c.fillText(`${touch.label.toUpperCase()} ${pct}`, W - 2, WAVE_H + 48);
    } else {
      const key = `${harmonic.root.toUpperCase()} ${harmonic.mode.toUpperCase()}`;
      c.fillStyle = this.palette.muted;
      c.textAlign = 'left';
      c.fillText('KEY', 2, WAVE_H + 48);
      c.fillStyle = this.palette.text;
      c.textAlign = 'right';
      c.fillText(`${key} · ${harmonic.chordFunction.toUpperCase()}`, W - 2, WAVE_H + 48);
    }

    this.drawEnsemble(WAVE_H + 64, harmonic);
  }

  /** Console-style activity meter — one bar per voice group. */
  private drawEnsemble(top: number, harmonic: HarmonicContext): void {
    const c = this.ctx;
    c.fillStyle = this.palette.muted;
    c.textAlign = 'left';
    c.fillText('VOICES', 2, top);

    const barsTop = top + 8;
    const barsBottom = top + 26;
    const colW = W / GROUP_ORDER.length;
    c.textAlign = 'center';
    GROUP_ORDER.forEach(([groupKey, label], i) => {
      const value = harmonic.groupActivity[groupKey] ?? 0;
      const cx = i * colW + colW / 2;
      const h = (barsBottom - barsTop) * Math.min(1, value);
      // track
      c.fillStyle = this.palette.border;
      c.fillRect(cx - 5, barsBottom - 1, 10, 1);
      // level
      c.fillStyle = value > 0.02 ? this.palette.text : this.palette.faint;
      c.fillRect(cx - 5, barsBottom - h, 10, Math.max(1, h));
      // label
      c.fillStyle = this.palette.faint;
      c.fillText(label, cx, barsBottom + 8);
    });
  }

  private drawCurve(
    midY: number,
    amp: number,
    cycles: number,
    phase: number,
    color: string,
    alpha: number,
  ): void {
    const c = this.ctx;
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    const TAU = Math.PI * 2;
    for (let x = 0; x <= W; x += 2) {
      const y = midY + Math.sin((x / W) * TAU * cycles + phase) * amp;
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.globalAlpha = 1;
  }

  private drawBands(y: number): void {
    const c = this.ctx;
    const labels: Array<[string, number]> = [
      ['BASS', this.bass],
      ['MID', this.mids],
      ['HI', this.highs],
    ];
    const colW = W / 3;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    labels.forEach(([label, value], i) => {
      const x = i * colW + 2;
      c.fillStyle = this.palette.muted;
      c.fillText(label, x, y);
      const barX = x + 24;
      const barW = colW - 32;
      c.fillStyle = this.palette.border;
      c.fillRect(barX, y - 0.5, barW, 1);
      c.fillStyle = this.palette.text;
      c.fillRect(barX, y - 1, barW * Math.min(1, value), 2);
    });
  }

  private readPalette(): Palette {
    const s = getComputedStyle(document.documentElement);
    return {
      text: s.getPropertyValue('--ao-text').trim() || '#1a1a1a',
      muted: s.getPropertyValue('--ao-text-muted').trim() || 'rgba(26,26,26,0.42)',
      faint: s.getPropertyValue('--ao-text-faint').trim() || 'rgba(26,26,26,0.28)',
      border: s.getPropertyValue('--ao-border').trim() || 'rgba(26,26,26,0.14)',
    };
  }
}
