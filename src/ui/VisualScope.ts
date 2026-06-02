import type { VisualKnobs } from '../audio/types';
import type { VisualReadoutState } from '../visual/VisualReadout';
import { FORM_LABELS } from '../visual/VisualForm';
import { resolveLayerBalance } from '../visual/LayerBalance';
import type { ArtDirectorDirectives } from '../visual/ArtDirectorSkill';

const W = 220;
const H = 150;

interface Palette {
  text: string;
  muted: string;
  faint: string;
  border: string;
}

/**
 * Visual-side data panel for the right rail: current form, particle population,
 * ghost/body layer balance, palette mood, and fog depth. Mirrors the audio-side
 * cymatics overlay so the two rails read as a matched instrument pair.
 */
export class VisualScope {
  readonly element: HTMLDivElement;
  private readonly formBtn: HTMLButtonElement;
  private readonly formHint: HTMLElement;
  private readonly formMeta: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private palette: Palette;

  // Smoothed display values.
  private particles = 0;
  private ghost = 0.5;
  private mood = 0;
  private fog = 1;

  constructor(parent: HTMLElement, private readonly onNextForm: () => void) {
    this.element = document.createElement('div');
    this.element.className = 'visual-scope';

    const row = document.createElement('div');
    row.className = 'readout-row';
    const tag = document.createElement('span');
    tag.className = 'readout-tag';
    tag.textContent = 'Form';
    this.formBtn = document.createElement('button');
    this.formBtn.type = 'button';
    this.formBtn.className = 'readout-action readout-action--primary';
    this.formBtn.title = 'Next form';
    this.formBtn.addEventListener('click', () => this.onNextForm());
    this.formHint = document.createElement('span');
    this.formHint.className = 'readout-hint';
    this.formMeta = document.createElement('span');
    this.formMeta.className = 'readout-meta';
    row.append(tag, this.formBtn, this.formHint, this.formMeta);

    this.canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(W * dpr);
    this.canvas.height = Math.floor(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable for visual scope');
    this.ctx = ctx;
    this.ctx.scale(dpr, dpr);

    this.element.append(row, this.canvas);
    parent.appendChild(this.element);
    this.palette = this.readPalette();
  }

  refreshTheme(): void {
    this.palette = this.readPalette();
  }

  update(visual: VisualReadoutState, knobs: VisualKnobs, art: ArtDirectorDirectives): void {
    this.formBtn.textContent = FORM_LABELS[visual.form];
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

    this.draw();
  }

  private draw(): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.font = "9px 'SF Mono', 'Menlo', 'Consolas', monospace";
    c.textBaseline = 'middle';

    this.bar('PARTICLES', 18, this.particles, false);
    this.splitBar('LAYER', 50, this.ghost, 'GHOST', 'BODY');
    this.splitBar('MOOD', 82, (this.mood + 1) / 2, 'COOL', 'WARM');
    this.bar('FOG', 114, Math.max(0, Math.min(1, (this.fog - 0.7) / 0.6)), false);
  }

  /** Left-to-right fill bar. */
  private bar(label: string, y: number, value: number, _split: boolean): void {
    const c = this.ctx;
    const barX = 64;
    const barW = W - barX - 4;
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
    const barW = W - barX - 4;
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
