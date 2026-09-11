import * as THREE from 'three';
import type { AudioFeatures, HarmonicContext, VisualKnobs } from '../../audio/types';
import { getThemePalette, type SceneTheme } from '../ScenePalette';
import type { FieldDrive } from '../FieldDrive';
import { moodChroma } from '../Chroma';
import { applyGhostTheme, createGhostMaterial, type GhostMaterial } from '../three/ghostMaterial';
import {
  modeAspectFor,
  modeForChord,
  plateAt,
  type PlateGradient,
  type PlateMode,
} from './plate';

/**
 * Grains at the baseline square plate, and the ceiling above it.
 *
 * What has to stay constant across plate sizes is how much of the plate the
 * sand covers — count times grain area over plate area. Hold that, and a
 * small plate is simply the same plate seen smaller, which is the one thing
 * that reliably still reads as a Chladni figure.
 *
 * Getting it wrong is not subtle in either direction. A grain is sized in
 * screen pixels, so keeping the count and shrinking the plate buries the
 * figure under its own sand — at a phone's letterbox the plate went half
 * solid. Shrinking the grains but scaling the count by area leaves the
 * lines drawn a third as heavily, which is a scatter of dust where a figure
 * should be. Both were tried on the way here.
 */
const GRAINS_PER_SQUARE = 4000;
const CAPACITY = 8000;

/**
 * The plate's size when the window is square, and the reference the grain
 * density is measured against.
 *
 * The bounds come from the camera frustum with a margin, so the edges stay
 * on screen and it reads as a plate on a bench rather than a wall — and the
 * shape it takes leans towards the window's without becoming it, which is
 * what keeps the figure a figure. See `plateAspectFor`.
 */
const BASE_HALF_EXTENT = 2.4;
export const PLANE_Z = 9;

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
  private boundX = BASE_HALF_EXTENT;
  private boundY = BASE_HALF_EXTENT;
  /** Held as floats so a chord change morphs between figures. */
  private readonly mode: PlateMode = { n: 3, m: 5 };
  private target: PlateMode = { n: 3, m: 5 };
  private level = 0;
  private theme: SceneTheme;
  private activeCount = 0;

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

  /**
   * Resize the plate to the window.
   *
   * Grains already on it keep their world positions, so a window drag
   * reshapes the plate rather than restarting it: those now *outside* it are
   * re-scattered by the escape check on the next frame, and the figure
   * redraws around the rest.
   *
   * Growing needs the nudge below, because nothing pushes a grain outwards.
   * Left alone, the sand stays where it was and the new plate fills only as
   * grains reach the end of their six-to-twenty-second lives — so tapping
   * Show on a phone gave a small figure adrift in a large empty plate for
   * the best part of half a minute. Cutting the remaining lives short
   * re-sprinkles the whole plate through the path that already exists, and
   * the figure reassembles over a second or two, which reads as the plate
   * being struck.
   */
  setExtent(halfWidth: number, halfHeight: number): void {
    const nextX = Math.max(0.5, halfWidth);
    const nextY = Math.max(0.5, halfHeight);
    const grew = nextX > this.boundX * 1.05 || nextY > this.boundY * 1.05;
    this.boundX = nextX;
    this.boundY = nextY;
    if (!grew) return;
    for (const g of this.pool) {
      if (g.active) g.life = Math.min(g.life, 0.2 + Math.random() * 1.4);
    }
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
    drive: FieldDrive,
  ): void {
    const breathe = drive.breathe;
    this.target = modeForChord(harmonic);
    // Morph rather than cut. Drift sets how fast the plate retunes: tight is
    // a figure that snaps to each chord, misty is one still on its way to
    // the last one when the next arrives.
    const retune = 1 - Math.exp(-dt / (1.6 + (1 - knobs.drift) * 5));
    this.mode.n += (this.target.n - this.mode.n) * retune;
    this.mode.m += (this.target.m - this.mode.m) * retune;

    // The plate is struck by the ensemble, not by the level: a gesture, a
    // beat, or walking through the doorway. That envelope is the shared
    // drive's now, so the same hit lights the ink and gusts the wind map.
    const levelTarget = features.overall * 0.6 + features.mids * 0.25 + features.bass * 0.15;
    this.level += (levelTarget - this.level) * (1 - Math.exp(-dt / 0.35));

    // How big this plate is against the baseline square one — the geometric
    // mean of its half-extents, so it is one isotropic number whatever shape
    // the window asked for. The grain count, the grain size and the
    // agitation are all measured in it.
    const size = Math.sqrt((this.boundX * this.boundY) / (BASE_HALF_EXTENT * BASE_HALF_EXTENT));
    // Sand shrinks with the plate, down to the plate, and no further: a
    // plate with room to spread keeps the grain the desktop has always had
    // and takes the extra room as more sand instead.
    const grainScale = Math.min(1, size);
    // Constant coverage: (plate area) / (grain area), both relative to the
    // baseline. Below full size the two cancel and the count holds; above
    // it, the grain is pinned and this is the old area scaling.
    const coverage = (size / grainScale) ** 2;
    const aliveTarget = Math.min(
      CAPACITY,
      Math.floor(GRAINS_PER_SQUARE * coverage * (0.32 + knobs.grain * 0.68) * (0.6 + breathe * 0.4)),
    );

    const dark = this.theme === 'dark';
    const mat = this.material.uniforms;
    // Focus trades a fine dusting for coarser, heavier grains — from the
    // drive, so the director's focus arc reaches the plate too.
    mat.uSizeScale.value =
      0.19 * grainScale * (0.7 + drive.focus * 0.9) * (0.75 + knobs.grain * 0.4);
    mat.uAlpha.value = (dark ? 0.34 : 0.32) * (0.85 + drive.focus * 0.4);
    mat.uFogDensity.value = (dark ? 0.03 : 0.028) * drive.fog;
    moodChroma(drive.mood, mat.uChroma.value);

    // Some of the plate's shape as extra cells, the rest as a little
    // stretch. All of it as cells is what cost the figure its corners.
    const modeAspect = modeAspectFor(this.boundX / this.boundY);

    // How hard the grains are thrown about, and how fast they settle back.
    // A phrase closing is a second, softer strike; the field thrown open
    // scatters the plate wide.
    //
    // Scaled by the plate, because the throw is a world distance and the
    // settling step that fights it is measured in plate widths. Left
    // absolute, the same agitation that draws a clean figure on a full-size
    // plate shakes a small one — a phone's letterbox — into loose sand. It
    // is the physical reading too: a smaller plate flexes less.
    let agitation =
      (0.03 + this.level * 0.38 + drive.strike * 0.75 + drive.ripple * 0.35 + drive.expand * 0.5) *
      (0.4 + knobs.ripple * 1.2) *
      size;
    // The inhale does the opposite here to everywhere else, and it should:
    // the breath before a gesture is the plate going still, and a still
    // plate is one that draws its figure sharply. Ink contracts, the wind
    // map drops, and Resonance comes into focus — one event, three readings.
    agitation *= 1 - drive.inhale * 0.6;
    const settle = (3.2 + knobs.drift * 2.6) * (1 + drive.inhale * 0.8);

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

      const u = g.x / this.boundX;
      const v = g.y / this.boundY;
      plateAt(u, v, this.mode, this.grad, modeAspect);
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
        g.x -= toLine * du * this.boundX;
        g.y -= toLine * dv * this.boundY;
      }

      // The plate's own motion. Strongest at the antinodes, which is why the
      // grains end up anywhere else.
      const bounce = agitation * Math.min(1, Math.abs(psi)) * dt * 2.4;
      g.x += (Math.random() - 0.5) * bounce;
      g.y += (Math.random() - 0.5) * bounce;
      // A grain shaken off the plate is gone, and a new one is sprinkled on.
      // Clamping instead would park it against the edge, where it is not
      // settled on anything and reads as a frame around the figure.
      if (Math.abs(g.x) > this.boundX || Math.abs(g.y) > this.boundY) this.scatter(g);

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
    g.x = (Math.random() * 2 - 1) * this.boundX;
    g.y = (Math.random() * 2 - 1) * this.boundY;
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
