import type { HarmonicContext, VisualKnobs } from '../audio/types';
import type { VisualReadoutState } from '../visual/VisualReadout';
import { FORM_LABELS } from '../visual/VisualForm';
import { resolveLayerBalance } from '../visual/LayerBalance';
import type { ArtDirectorDirectives } from '../visual/ArtDirectorSkill';
import { ScopeCanvas } from './ScopeCanvas';

const DEFAULT_W = 220;
const H = 182;

interface Palette {
  text: string;
  muted: string;
  faint: string;
  border: string;
}

/**
 * Visual-side data panel: current form, particle population, ghost/body layer
 * balance, palette mood, and fog depth. Mirrors the audio-side cymatics
 * overlay so the two rails read as a matched instrument pair.
 *
 * Split the same way the session readout is: `element` reports and cannot be
 * pressed, `controls` holds the one button — next form — that used to be
 * hidden inside the readout row wearing a label's clothes.
 */
export class VisualScope {
  readonly element: HTMLDivElement;
  readonly controls: HTMLElement;
  private readonly formValue: HTMLElement;
  private readonly formHint: HTMLElement;
  private readonly formMeta: HTMLElement;
  private readonly canvas: ScopeCanvas;
  private readonly ctx: CanvasRenderingContext2D;
  private palette: Palette;

  // Smoothed display values.
  private particles = 0;
  private ghost = 0.5;
  private mood = 0;
  private fog = 1;
  private room = 0;

  constructor(private readonly onNextForm: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'visual-scope';

    const row = document.createElement('div');
    row.className = 'readout-row';
    const tag = document.createElement('span');
    tag.className = 'readout-tag';
    tag.textContent = 'Form';
    this.formValue = document.createElement('span');
    this.formValue.className = 'readout-value';
    this.formHint = document.createElement('span');
    this.formHint.className = 'readout-hint';
    this.formMeta = document.createElement('span');
    this.formMeta.className = 'readout-meta';
    row.append(tag, this.formValue, this.formHint, this.formMeta);

    this.canvas = new ScopeCanvas(H, DEFAULT_W);
    this.ctx = this.canvas.ctx;

    this.element.append(row, this.canvas.element);
    this.canvas.observe(this.element);
    this.palette = this.readPalette();

    this.controls = document.createElement('div');
    this.controls.className = 'readout-actions';
    const formBtn = document.createElement('button');
    formBtn.type = 'button';
    formBtn.className = 'readout-action';
    formBtn.textContent = 'Next form';
    formBtn.title = 'Nudge the field towards another morphology';
    formBtn.addEventListener('click', () => this.onNextForm());
    this.controls.appendChild(formBtn);
  }

  refreshTheme(): void {
    this.palette = this.readPalette();
  }

  update(
    visual: VisualReadoutState,
    knobs: VisualKnobs,
    art: ArtDirectorDirectives,
    harmonic: HarmonicContext,
  ): void {
    this.formValue.textContent = FORM_LABELS[visual.form];
    this.formHint.textContent = visual.awaitingTarget ? `→ ${FORM_LABELS[visual.targetForm]}` : '';
    this.formMeta.textContent = String(visual.particleCount);

    const pTarget = visual.particleTarget > 0 ? visual.particleCount / visual.particleTarget : 0;
    const focus = Math.max(0, Math.min(1, knobs.focus + art.focusOffset));
    const balance = resolveLayerBalance(focus);

    const k = 0.12;
    this.particles += (Math.min(1, pTarget) - this.particles) * k;
    this.ghost += (balance.ghostWeight / (balance.ghostWeight + balance.bodyWeight) - this.ghost) * k;
    this.mood += (art.moodBlend - this.mood) * k;
    this.fog += (art.fogMultiplier - this.fog) * k;
    this.room += (harmonic.roomPosition - this.room) * k;

    this.draw();
  }

  private draw(): void {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, H);
    c.font = "9px 'SF Mono', 'Menlo', 'Consolas', monospace";
    c.textBaseline = 'middle';

    this.bar('PARTICLES', 18, this.particles);
    this.splitBar('LAYER', 50, this.ghost, 'GHOST', 'BODY');
    this.splitBar('MOOD', 82, (this.mood + 1) / 2, 'COOL', 'WARM');
    this.bar('FOG', 114, Math.max(0, Math.min(1, (this.fog - 0.7) / 0.6)));
    this.splitBar('ROOM', 146, this.room, 'HERE', 'NEXT');
  }

  /** Left-to-right fill bar. */
  private bar(label: string, y: number, value: number): void {
    const c = this.ctx;
    const barX = 64;
    const barW = this.canvas.width - barX - 4;
    c.fillStyle = this.palette.muted;
    c.textAlign = 'left';
    c.fillText(label, 2, y);
    c.fillStyle = this.palette.border;
    c.fillRect(barX, y - 0.5, barW, 1);
    c.fillStyle = this.palette.text;
    c.fillRect(barX, y - 1.5, barW * Math.max(0, Math.min(1, value)), 3);
  }

  /** Center-anchored bar for bipolar values (0..1, 0.5 = neutral). */
  private splitBar(label: string, y: number, value: number, leftLab: string, rightLab: string): void {
    const c = this.ctx;
    const barX = 64;
    const barW = this.canvas.width - barX - 4;
    const mid = barX + barW / 2;
    c.fillStyle = this.palette.muted;
    c.textAlign = 'left';
    c.fillText(label, 2, y - 6);
    c.fillStyle = this.palette.faint;
    c.fillText(leftLab, barX, y + 7);
    c.textAlign = 'right';
    c.fillText(rightLab, barX + barW, y + 7);

    c.fillStyle = this.palette.border;
    c.fillRect(barX, y - 0.5, barW, 1);
    // center tick
    c.fillRect(mid - 0.5, y - 3, 1, 6);
    // fill from center toward the dominant side
    const offset = (Math.max(0, Math.min(1, value)) - 0.5) * barW;
    c.fillStyle = this.palette.text;
    if (offset >= 0) c.fillRect(mid, y - 1.5, offset, 3);
    else c.fillRect(mid + offset, y - 1.5, -offset, 3);
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
