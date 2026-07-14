import * as THREE from 'three';
import type { AudioFeatures, HarmonicContext, VisualKnobs } from '../../audio/types';
import { getThemePalette, type SceneTheme } from '../ScenePalette';
import { applyGhostTheme, createGhostMaterial, type GhostMaterial } from '../three/ghostMaterial';
import {
  createFlowField,
  flowCharacterFor,
  type FlowParams,
  type FlowVector,
} from './flow';

const CAPACITY = 3000;

/** World-unit bounds of the current plane (wider than tall, like a map).
 * The plane lives at PLANE_Z, close to the camera and OUTSIDE the scaled
 * worldGroup, sized so the camera's frustum (fov 42, z about 16, plus its
 * drift orbit) stays filled edge to edge. */
const BOUND_X = 7.5;
const BOUND_Y = 4.5;
const PLANE_Z = 9;

/** Spectral lanes — each particle rides one band's energy. */
const LANE_BASS = 0;
const LANE_MIDS = 1;
const LANE_HIGHS = 2;

interface CurrentParticle {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  age: number;
  lifetime: number;
  lane: number;
  jitter: number;
  active: boolean;
}

function makeParticle(): CurrentParticle {
  return {
    x: 0,
    y: 0,
    z: 0,
    prevX: 0,
    prevY: 0,
    age: 0,
    lifetime: 6,
    lane: LANE_MIDS,
    jitter: 1,
    active: false,
  };
}

/**
 * Wind-map currents — free particles advected through an audio-shaped
 * curl-noise vector field (hint.fm/wind, abstracted away from geography).
 * The TrailPass feedback turns the moving points into flowing streamlines;
 * the `trails` knob owns how long they linger.
 */
export class CurrentsField {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly material: GhostMaterial;
  private readonly pool: CurrentParticle[] = [];
  private readonly positions = new Float32Array(CAPACITY * 3);
  private readonly heats = new Float32Array(CAPACITY);
  private readonly depths = new Float32Array(CAPACITY);
  private readonly velocities = new Float32Array(CAPACITY * 2);
  private readonly sizes = new Float32Array(CAPACITY);
  private readonly field = createFlowField();
  private readonly flowParams: FlowParams = { scale: 0.055, warp: 0.15, evolve: 0 };
  private readonly vec: FlowVector = { vx: 0, vy: 0 };
  private evolveRate = 0.02;
  private theme: SceneTheme;
  private activeCount = 0;
  // Smoothed lane levels so particle speeds breathe instead of flickering.
  private readonly laneLevels = [0, 0, 0];
  /** Art Director palette mood (-1 cool .. +1 warm); see GhostField. */
  moodBlend = 0;
  private readonly tintedFog = new THREE.Color();

  constructor(parent: THREE.Object3D, theme: SceneTheme = 'light') {
    this.theme = theme;
    const palette = getThemePalette(theme);
    this.material = createGhostMaterial(palette.ghostFog, theme);
    for (let i = 0; i < CAPACITY; i++) this.pool.push(makeParticle());

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

  update(
    dt: number,
    features: AudioFeatures,
    harmonic: HarmonicContext,
    knobs: VisualKnobs,
    breathe: number,
  ): void {
    // Field character morphs with the movement phase — never pops.
    const character = flowCharacterFor(harmonic.movementPhase);
    const ease = 1 - Math.exp(-dt / 8);
    this.flowParams.scale += (character.scale - this.flowParams.scale) * ease;
    const warpTarget = character.warp * (0.4 + knobs.ripple * 1.2);
    this.flowParams.warp += (warpTarget - this.flowParams.warp) * ease;
    this.evolveRate += (character.evolveRate - this.evolveRate) * ease;
    this.flowParams.evolve += dt * this.evolveRate * (0.5 + knobs.drift);

    const laneSmooth = 1 - Math.exp(-dt / 0.5);
    this.laneLevels[LANE_BASS]! += (features.bass - this.laneLevels[LANE_BASS]!) * laneSmooth;
    this.laneLevels[LANE_MIDS]! += (features.mids - this.laneLevels[LANE_MIDS]!) * laneSmooth;
    this.laneLevels[LANE_HIGHS]! += (features.highs - this.laneLevels[LANE_HIGHS]!) * laneSmooth;

    // Ensemble swells and beats read as gusts — squalls crossing the map.
    const gust = harmonic.ensemblePulse * 0.7 + harmonic.beatPulse * 0.3;

    // Focus trades many faint threads for fewer, bolder ribbons.
    const countMul = 1.15 - knobs.focus * 0.55;
    const sizeMul = 0.75 + knobs.focus * 0.9;
    const alphaMul = 0.85 + knobs.focus * 0.55;

    const activity = harmonic.groupActivity;
    const activitySum =
      (activity.bed ?? 0) +
      (activity.melody ?? 0) +
      (activity.shimmer ?? 0) +
      (activity.air ?? 0) +
      (activity.foundation ?? 0) +
      (activity.flurry ?? 0) +
      (activity.clips ?? 0);
    const aliveTarget = Math.min(
      CAPACITY,
      Math.floor(
        (500 + activitySum * 320) * (0.5 + knobs.grain * 1.1) * (0.55 + breathe * 0.45) * countMul,
      ),
    );

    const dark = this.theme === 'dark';
    const mat = this.material.uniforms;
    mat.uSizeScale.value = 0.46 * sizeMul * (0.7 + knobs.grain * 0.5);
    mat.uAlpha.value = (dark ? 0.3 : 0.28) * alphaMul;
    mat.uFogDensity.value = (dark ? 0.036 : 0.032) * (0.6 + knobs.fog * 0.8);
    this.tintedFog.copy(getThemePalette(this.theme).ghostFog);
    const tint = this.moodBlend * 0.04;
    this.tintedFog.r = Math.max(0, Math.min(1, this.tintedFog.r + tint));
    this.tintedFog.b = Math.max(0, Math.min(1, this.tintedFog.b - tint));
    mat.uFogColor.value.copy(this.tintedFog);

    // Slow enough that per-frame motion stays under the point diameter, so
    // the trail buffer fuses successive stamps into a continuous streamline.
    const baseSpeed = 0.75 + knobs.drift * 1.9;
    let alive = 0;
    for (const p of this.pool) if (p.active) alive++;

    // Spawn toward the target gradually; retire the oldest when over target.
    let toSpawn = Math.min(Math.ceil(CAPACITY * dt * 0.6), aliveTarget - alive);
    let toRetire = alive - aliveTarget;

    let i = 0;
    this.activeCount = 0;
    for (const p of this.pool) {
      if (!p.active && toSpawn > 0) {
        this.spawn(p, harmonic);
        toSpawn--;
      }
      if (!p.active) {
        this.sizes[i] = 0;
        i++;
        continue;
      }

      p.age += dt;
      if (p.age > p.lifetime || Math.abs(p.x) > BOUND_X || Math.abs(p.y) > BOUND_Y) {
        if (toRetire > 0) {
          toRetire--;
          p.active = false;
          this.sizes[i] = 0;
          i++;
          continue;
        }
        this.spawn(p, harmonic);
      }

      this.field(p.x, p.y, this.flowParams, this.vec);
      const mag = Math.hypot(this.vec.vx, this.vec.vy);
      const inv = mag > 1e-6 ? 1 / mag : 0;
      // Keep the field's calm-vs-fast regions but bound the range so no
      // region ever freezes solid or streaks off in one frame.
      const laneLevel = this.laneLevels[p.lane]!;
      const speed =
        baseSpeed *
        p.jitter *
        (0.3 + Math.min(1.6, mag * 3) * 0.7) *
        (0.35 + laneLevel * 1.4) *
        (1 + gust * 1.4);
      p.prevX = p.x;
      p.prevY = p.y;
      p.x += this.vec.vx * inv * speed * dt;
      p.y += this.vec.vy * inv * speed * dt;

      const j = i * 3;
      this.positions[j] = p.x;
      this.positions[j + 1] = p.y;
      this.positions[j + 2] = p.z;
      // Fade in over the first half second and out over the last second so
      // respawns never pop against the trail buffer.
      const fadeIn = Math.min(1, p.age * 2);
      const fadeOut = Math.min(1, Math.max(0, (p.lifetime - p.age) * 1));
      this.heats[i] = Math.min(1, laneLevel * 0.9 + gust * 0.5) * fadeIn * fadeOut;
      this.depths[i] = p.lane === LANE_BASS ? 0.85 : p.lane === LANE_MIDS ? 0.5 : 0.25;
      const k = i * 2;
      const invDt = dt > 1e-6 ? 1 / dt : 0;
      this.velocities[k] = (p.x - p.prevX) * invDt * 0.12;
      this.velocities[k + 1] = (p.y - p.prevY) * invDt * 0.12;
      this.sizes[i] = fadeIn * fadeOut;
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

  /** Respawn with a lane drawn from the ensemble and a lane-biased latitude:
   * the foundation feeds the lower third of the map, shimmer/air the top. */
  private spawn(p: CurrentParticle, harmonic: HarmonicContext): void {
    const a = harmonic.groupActivity;
    const wBass = 0.25 + (a.foundation ?? 0) + (a.bed ?? 0) * 0.7;
    const wMids = 0.35 + (a.melody ?? 0) + (a.clips ?? 0) * 0.6;
    const wHighs = 0.25 + (a.shimmer ?? 0) + (a.air ?? 0) * 0.7 + (a.flurry ?? 0);
    let roll = Math.random() * (wBass + wMids + wHighs);
    if ((roll -= wBass) < 0) p.lane = LANE_BASS;
    else if ((roll -= wMids) < 0) p.lane = LANE_MIDS;
    else p.lane = LANE_HIGHS;

    const laneCenter = p.lane === LANE_BASS ? -0.55 : p.lane === LANE_MIDS ? 0 : 0.55;
    p.x = (Math.random() * 2 - 1) * BOUND_X;
    p.y = Math.max(
      -BOUND_Y,
      Math.min(BOUND_Y, (laneCenter + (Math.random() * 2 - 1) * 0.6) * BOUND_Y),
    );
    p.z = PLANE_Z + (Math.random() * 2 - 1) * 0.8;
    p.prevX = p.x;
    p.prevY = p.y;
    p.age = 0;
    p.lifetime = 4 + Math.random() * 8;
    p.jitter = 0.7 + Math.random() * 0.6;
    p.active = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
