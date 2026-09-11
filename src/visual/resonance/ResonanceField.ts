import * as THREE from 'three';
import type { AudioFeatures, HarmonicContext, VisualKnobs } from '../../audio/types';
import { getThemePalette, type SceneTheme } from '../ScenePalette';
import { applyGhostTheme, createGhostMaterial, type GhostMaterial } from '../three/ghostMaterial';
import { modeForChord, plateAt, type PlateGradient, type PlateMode } from './plate';

const CAPACITY = 4000;

/**
 * The plate is square, and small enough to be seen whole.
 *
 * Unlike the currents plane — deliberately oversized, because a wind map
 * has no edges and you are looking at part of one — a Chladni figure is a
 * single object with a shape, and half of one is not the figure. These
 * bounds put the whole plate inside the frustum at the camera's resting
 * distance, with margin on a wide window, which is also what a plate looks
 * like: a square on a bench, not a wall.
 */
const BOUND_X = 2.4;
const BOUND_Y = 2.4;
const PLANE_Z = 9;

interface Grain {
  x: number;
  y: number;
  z: number;
  /** Seconds left before this grain is re-scattered somewhere new. */
  life: number;
  size: number;
  active: boolean;
}

function makeGrain(): Grain {
  return { x: 0, y: 0, z: 0, life: 0, size: 1, active: false };
}

/**
 * Resonance — a Chladni plate driven by the orchestra.
 *
 * Grains walk downhill on |ψ| until they are sitting on the nodal lines,
 * and the plate's own motion throws them back off again: the jitter each
 * grain takes is proportional to how far it is from a line (the antinodes
 * are where a real plate is moving most) times how loud the piece is right
 * now. So a quiet passage draws the figure sharply and a bloom shakes it
 * apart, which is what a plate actually does.
 *
 * The figure follows the harmony rather than the level — see `plate.ts`.
 * Ensemble swells and beats arrive as strikes: the plate is hit, every
 * grain jumps, and the figure reassembles over the next second or two.
 */
export class ResonanceField {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly material: GhostMaterial;
  private readonly pool: Grain[] = [];
  private readonly positions = new Float32Array(CAPACITY * 3);
  private readonly heats = new Float32Array(CAPACITY);
  private readonly depths = new Float32Array(CAPACITY);
  private readonly velocities = new Float32Array(CAPACITY * 2);
  private readonly sizes = new Float32Array(CAPACITY);
  private readonly grad: PlateGradient = { psi: 0, du: 0, dv: 0 };
  /** Held as floats so a chord change morphs between figures. */
  private readonly mode: PlateMode = { n: 3, m: 5 };
  private target: PlateMode = { n: 3, m: 5 };
  /** Decaying strike energy — the plate having just been hit. */
  private strike = 0;
  private lastGestureId = -1;
  private drive = 0;
  private theme: SceneTheme;
  private activeCount = 0;
  /** Art Director palette mood (-1 cool .. +1 warm); see GhostField. */
  moodBlend = 0;
  private readonly tintedFog = new THREE.Color();

  constructor(parent: THREE.Object3D, theme: SceneTheme = 'light') {
    this.theme = theme;
    const palette = getThemePalette(theme);
    this.material = createGhostMaterial(palette.ghostFog, theme);
    for (let i = 0; i < CAPACITY; i++) this.pool.push(makeGrain());

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aHeat', new THREE.BufferAttribute(this.heats, 1));
    geometry.setAttribute('aDepth', new THREE.BufferAttribute(this.depths, 1));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocities, 2));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    parent.add(this.group);
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    applyGhostTheme(this.material, theme, getThemePalette(theme).ghostFog);
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  /** The figure currently on the plate, for the readout. */
  getMode(): PlateMode {
    return { n: this.mode.n, m: this.mode.m };
  }

  update(
    dt: number,
    features: AudioFeatures,
    harmonic: HarmonicContext,
    knobs: VisualKnobs,
    breathe: number,
  ): void {
    this.target = modeForChord(harmonic);
    // Morph rather than cut. Drift sets how fast the plate retunes: tight is
    // a figure that snaps to each chord, misty is one still on its way to
    // the last one when the next arrives.
    const retune = 1 - Math.exp(-dt / (1.6 + (1 - knobs.drift) * 5));
    this.mode.n += (this.target.n - this.mode.n) * retune;
    this.mode.m += (this.target.m - this.mode.m) * retune;

    // The plate is struck by the ensemble, not by the level: a gesture, a
    // beat, or walking through the doorway.
    if (harmonic.gestureId !== this.lastGestureId) {
      this.lastGestureId = harmonic.gestureId;
      this.strike = Math.min(1, this.strike + harmonic.ensemblePulse * 0.8 + 0.2);
    }
    this.strike = Math.max(
      0,
      Math.max(this.strike - dt * 0.9, harmonic.beatPulse * 0.45 + harmonic.doorwayPulse * 0.7),
    );

    const driveTarget = features.overall * 0.6 + features.mids * 0.25 + features.bass * 0.15;
    this.drive += (driveTarget - this.drive) * (1 - Math.exp(-dt / 0.35));

    const aliveTarget = Math.min(
      CAPACITY,
      Math.floor(CAPACITY * (0.32 + knobs.grain * 0.68) * (0.6 + breathe * 0.4)),
    );

    const dark = this.theme === 'dark';
    const mat = this.material.uniforms;
    // Focus trades a fine dusting for coarser, heavier grains.
    mat.uSizeScale.value = 0.19 * (0.7 + knobs.focus * 0.9) * (0.75 + knobs.grain * 0.4);
    mat.uAlpha.value = (dark ? 0.34 : 0.32) * (0.85 + knobs.focus * 0.4);
    mat.uFogDensity.value = (dark ? 0.03 : 0.028) * (0.6 + knobs.fog * 0.8);
    this.tintedFog.copy(getThemePalette(this.theme).ghostFog);
    const tint = this.moodBlend * 0.04;
    this.tintedFog.r = Math.max(0, Math.min(1, this.tintedFog.r + tint));
    this.tintedFog.b = Math.max(0, Math.min(1, this.tintedFog.b - tint));
    mat.uFogColor.value.copy(this.tintedFog);

    // How hard the grains are thrown about, and how fast they settle back.
    const agitation = (0.03 + this.drive * 0.38 + this.strike * 0.75) * (0.4 + knobs.ripple * 1.2);
    const settle = 3.2 + knobs.drift * 2.6;

    let alive = 0;
    for (const g of this.pool) if (g.active) alive++;
    let toSpawn = Math.min(Math.ceil(CAPACITY * dt * 0.5), aliveTarget - alive);
    let toRetire = alive - aliveTarget;

    let i = 0;
    this.activeCount = 0;
    for (const g of this.pool) {
      if (!g.active && toSpawn > 0) {
        this.scatter(g);
        toSpawn--;
      }
      if (!g.active) {
        this.sizes[i] = 0;
        i++;
        continue;
      }

      g.life -= dt;
      if (g.life <= 0) {
        if (toRetire > 0) {
          toRetire--;
          g.active = false;
          this.sizes[i] = 0;
          i++;
          continue;
        }
        // Re-scattered rather than removed: a plate keeps its sand, and a
        // slow turnover is what keeps the figure from looking like a
        // photograph of itself.
        this.scatter(g);
      }

      const u = g.x / BOUND_X;
      const v = g.y / BOUND_Y;
      plateAt(u, v, this.mode, this.grad);
      const { psi, du, dv } = this.grad;
      const mag = Math.hypot(du, dv);
      const prevX = g.x;
      const prevY = g.y;

      if (mag > 1e-5) {
        // A damped Newton step onto the nearest nodal line. ψ/|∇ψ| is how
        // far away that line is under a linear reading of the surface, so
        // the grain *arrives* — and the step vanishes as it gets there,
        // which is what draws the line tight. Walking a fixed distance
        // downhill instead, which is the obvious first try, sends every
        // grain skidding across the plate and piles them against the edges:
        // the gradient is steepest exactly where you want the smallest
        // step.
        const k = Math.min(0.4, settle * dt);
        const toLine = (k * psi) / (mag * mag);
        g.x -= toLine * du * BOUND_X;
        g.y -= toLine * dv * BOUND_Y;
      }

      // The plate's own motion. Strongest at the antinodes, which is why the
      // grains end up anywhere else.
      const bounce = agitation * Math.min(1, Math.abs(psi)) * dt * 2.4;
      g.x += (Math.random() - 0.5) * bounce;
      g.y += (Math.random() - 0.5) * bounce;
      // A grain shaken off the plate is gone, and a new one is sprinkled on.
      // Clamping instead would park it against the edge, where it is not
      // settled on anything and reads as a frame around the figure.
      if (Math.abs(g.x) > BOUND_X || Math.abs(g.y) > BOUND_Y) this.scatter(g);

      const j = i * 3;
      this.positions[j] = g.x;
      this.positions[j + 1] = g.y;
      this.positions[j + 2] = g.z;
      // Settled grains are the bright ones — the figure lights up as it
      // resolves and greys out while it is being shaken apart.
      this.heats[i] = Math.max(0, 1 - Math.abs(psi) * 1.6);
      this.depths[i] = 0.35 + this.heats[i]! * 0.5;
      const k = i * 2;
      const invDt = dt > 1e-6 ? 1 / dt : 0;
      this.velocities[k] = (g.x - prevX) * invDt * 0.1;
      this.velocities[k + 1] = (g.y - prevY) * invDt * 0.1;
      this.sizes[i] = g.size;
      this.activeCount++;
      i++;
    }
    for (; i < CAPACITY; i++) this.sizes[i] = 0;

    const geo = this.points.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aHeat').needsUpdate = true;
    geo.getAttribute('aDepth').needsUpdate = true;
    geo.getAttribute('aVelocity').needsUpdate = true;
    geo.getAttribute('aSize').needsUpdate = true;
  }

  /** Drop a grain somewhere new on the plate. */
  private scatter(g: Grain): void {
    g.x = (Math.random() * 2 - 1) * BOUND_X;
    g.y = (Math.random() * 2 - 1) * BOUND_Y;
    g.z = PLANE_Z + (Math.random() * 2 - 1) * 0.25;
    g.life = 6 + Math.random() * 14;
    g.size = 0.6 + Math.random() * 0.7;
    g.active = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
