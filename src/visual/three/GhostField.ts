import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import type { AudioFeatures, HarmonicContext, MovementPhase, VisualKnobs } from '../../audio/types';
import { DEFAULT_KNOBS } from '../../audio/types';
import { TAU } from '../AudioFeatures';
import type { FluidState } from '../FluidField';
import { resolveVisualKnobs, type VisualKnobParams } from '../VisualKnobParams';
import type { LayerBalance } from '../LayerBalance';
import { layerScale } from '../LayerBalance';
import { createGhostMaterial, applyGhostTheme, type GhostMaterial } from './ghostMaterial';
import { getThemePalette, type SceneTheme } from '../ScenePalette';

const CAPACITY = 800;
const RING_COUNT = 14;
const CORE_R = 3.8;

type LoopMode = 'ring' | 'breathe' | 'helical';

interface Ghost {
  loopPhase: number;
  loopPeriod: number;
  loopAmp: number;
  anchorAngle: number;
  anchorR: number;
  orbitRing: number;
  loopMode: LoopMode;
  depth: number;
  heat: number;
  active: boolean;
  prevX: number;
  prevY: number;
  prevZ: number;
  zPhase: number;
  /** One of two discrete size scales (already trimmed ~20%). */
  sizeClass: number;
}

// Two size scales; mean ≈ 0.8 → an overall ~20% reduction vs the prior 1.0.
const SIZE_SMALL = 0.65;
const SIZE_LARGE = 1.05;

const SHELL_BIAS: Partial<Record<MovementPhase, number>> = {
  gather: 0.35,
  bloom: 0.25,
  hang: 0.45,
  dissolve: 0.72,
  exhale: 0.85,
};

/**
 * Dense 3D ghost particles — volumetric ink-in-water with velocity-stretched sprites.
 */
export class GhostField {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly material: GhostMaterial;
  private readonly pool: Ghost[] = [];
  private readonly positions = new Float32Array(CAPACITY * 3);
  private readonly heats = new Float32Array(CAPACITY);
  private readonly depths = new Float32Array(CAPACITY);
  private readonly velocities = new Float32Array(CAPACITY * 2);
  private readonly sizes = new Float32Array(CAPACITY);
  private readonly flowNoise = createNoise2D(() => 13.7);
  private fieldAngle = 0;
  private time = 0;
  private swell = 0;
  private zSpread = 1;
  private lastGestureId = 0;
  private lastSurpriseFlash = 0;
  private lastPhase: MovementPhase = 'drift';
  private rippleT = 0;
  private lastCadenceRipple = 0;
  private cadenceWaveRadius = 0;
  private params = resolveVisualKnobs(DEFAULT_KNOBS.visual);
  private theme: SceneTheme = 'light';
  /** Art Director fog scaling (1 = neutral); see ArtDirectorSkill */
  fogMultiplier = 1;
  /** Decaying constellation strength — coherent emergent shape (0–1) */
  private constellationT = 0;
  /** Art Director palette mood (-1 cool .. +1 warm) */
  moodBlend = 0;
  private readonly tintedFog = new THREE.Color();

  constructor(parent: THREE.Group, theme: SceneTheme = 'light') {
    this.theme = theme;
    const palette = getThemePalette(theme);
    this.material = createGhostMaterial(palette.ghostFog, theme) as GhostMaterial;
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push(makeGhost());
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aHeat', new THREE.BufferAttribute(this.heats, 1));
    geometry.setAttribute('aDepth', new THREE.BufferAttribute(this.depths, 1));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocities, 2));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    this.points = new THREE.Points(geometry, this.material);
    this.group.add(this.points);
    parent.add(this.group);
  }

  update(
    dt: number,
    state: FluidState,
    features: AudioFeatures,
    harmonic: HarmonicContext,
    knobs: VisualKnobs,
    breathe: number,
    balance: LayerBalance,
  ): VisualKnobParams {
    this.params = resolveVisualKnobs(knobs);
    this.time += dt;
    this.fieldAngle += dt * (this.params.fieldRotation + state.flowRate * 0.12);
    this.swell = state.swell + features.bass * 0.1 + harmonic.ensemblePulse * 0.2;

    const ensembleZ = harmonic.ensemblePulse * 2.2;
    this.zSpread += (1 + ensembleZ - this.zSpread) * (1 - Math.exp(-dt / 0.35));

    if (harmonic.gestureId !== this.lastGestureId) {
      this.lastGestureId = harmonic.gestureId;
      for (const g of this.pool) {
        if (g.active) g.heat = Math.min(1, g.heat + harmonic.ensemblePulse * 0.35);
      }
    }

    if (harmonic.surpriseFlash > this.lastSurpriseFlash + 0.15) {
      this.rippleT = 1;
    }
    this.lastSurpriseFlash = harmonic.surpriseFlash;
    this.rippleT = Math.max(0, this.rippleT - dt * 0.55);

    if (harmonic.cadenceRipple > 0.65 && this.lastCadenceRipple <= 0.35) {
      this.cadenceWaveRadius = 0;
    }
    this.lastCadenceRipple = harmonic.cadenceRipple;
    if (harmonic.cadenceRipple > 0.02) {
      this.cadenceWaveRadius += dt * 10.5;
    } else {
      this.cadenceWaveRadius *= 0.9;
    }

    if (harmonic.movementPhase !== this.lastPhase) {
      this.onPhaseShift(harmonic.movementPhase);
      this.lastPhase = harmonic.movementPhase;
    }

    if (this.constellationT > 0.001) {
      this.constellationT = Math.max(0, this.constellationT - dt * 0.18);
    }

    const ghostScale = layerScale(balance.ghostWeight);
    const target = Math.floor(
      this.params.particleTarget * (0.55 + breathe * 0.45) * (0.55 + ghostScale * 0.75),
    );
    this.syncPopulation(target, harmonic.movementPhase);

    const mat = this.material.uniforms;
    const inhale = harmonic.inhaleGesture;
    const spaceThrow = harmonic.spaceThrowGesture;
    mat.uAlpha.value =
      this.params.dotAlpha *
      (1.55 + state.ghostMix * 0.9) *
      (0.7 + breathe * 0.38) *
      (0.5 + ghostScale * 0.9) *
      (1 + spaceThrow * 0.55) *
      (1 - inhale * 0.22);
    mat.uFogDensity.value =
      (0.04 + knobs.drift * 0.028 + spaceThrow * 0.012) * this.fogMultiplier;
    mat.uSizeScale.value =
      this.params.sizeScale * (1 + spaceThrow * 0.7) * (1 - inhale * 0.24);
    // Warm/cool palette tint from the Art Director — subtle hue offset.
    this.tintedFog.copy(getThemePalette(this.theme).ghostFog);
    const tint = this.moodBlend * 0.04;
    this.tintedFog.r = Math.max(0, Math.min(1, this.tintedFog.r + tint));
    this.tintedFog.b = Math.max(0, Math.min(1, this.tintedFog.b - tint));
    mat.uFogColor.value.copy(this.tintedFog);

    this.points.visible = balance.ghostWeight > 0.08;

    let i = 0;
    for (const g of this.pool) {
      if (!g.active) continue;
      this.advanceGhost(g, dt, features, breathe, harmonic);
      this.writeGhost(i, g, dt, breathe, harmonic);
      i++;
    }

    for (; i < CAPACITY; i++) {
      this.positions[i * 3 + 2] = -999;
    }

    this.points.geometry.attributes.position!.needsUpdate = true;
    this.points.geometry.attributes.aHeat!.needsUpdate = true;
    this.points.geometry.attributes.aDepth!.needsUpdate = true;
    this.points.geometry.attributes.aVelocity!.needsUpdate = true;
    this.points.geometry.attributes.aSize!.needsUpdate = true;
    this.points.geometry.setDrawRange(0, target);

    return this.params;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    applyGhostTheme(this.material, theme, getThemePalette(theme).ghostFog);
  }

  getActiveCount(): number {
    return this.pool.filter((g) => g.active).length;
  }

  /** Begin a constellation moment — particles briefly form a coherent spiral. */
  triggerConstellation(): void {
    this.constellationT = 1;
  }

  private onPhaseShift(phase: MovementPhase): void {
    const bias = SHELL_BIAS[phase];
    if (bias === undefined) return;
    for (const g of this.pool) {
      if (!g.active) continue;
      const targetRing = 1 + Math.floor(bias * (RING_COUNT - 2));
      g.orbitRing += (targetRing - g.orbitRing) * 0.35;
      if (phase === 'exhale' || phase === 'dissolve') {
        g.heat *= 0.82;
      }
    }
  }

  private writeGhost(
    i: number,
    g: Ghost,
    dt: number,
    breathe: number,
    harmonic: HarmonicContext,
  ): void {
    const inhale = harmonic.inhaleGesture;
    const spaceThrow = harmonic.spaceThrowGesture;
    const cadence = harmonic.cadenceRipple;

    let r = g.anchorR * (0.82 + breathe * 0.22);
    r *= 1 - inhale * 0.26;
    r *= 1 + spaceThrow * 0.34;

    if (cadence > 0.02) {
      const ringDist = Math.abs(g.anchorR - this.cadenceWaveRadius);
      const ring = Math.exp(-ringDist * 0.72) * cadence;
      g.heat = Math.min(1, g.heat + ring * 0.9);
      r += ring * 0.65;
      r += Math.sin(g.anchorAngle * 4 + this.time * 1.6) * ring * 0.12;
    }

    if (this.constellationT > 0.01) {
      // Coherent spiral petals form, then dissolve back to organic motion.
      const spiral = Math.sin(g.anchorAngle * 3 + g.orbitRing * 0.5 + this.time * 0.4);
      r += spiral * this.constellationT * 0.9;
      g.heat = Math.min(1, g.heat + this.constellationT * 0.4);
    }

    const helicalZ =
      g.loopMode === 'helical'
        ? Math.sin(g.zPhase + this.time * 0.4) * 2.8 * this.zSpread
        : Math.sin(g.anchorAngle * 2 + this.time * 0.3) * 0.35;
    const z = (g.depth - 0.5) * 7.5 * breathe * this.zSpread + helicalZ;

    const x = Math.cos(g.anchorAngle) * r;
    const y = Math.sin(g.anchorAngle) * r;

    if (this.rippleT > 0.01) {
      const wave = Math.sin(g.anchorAngle - this.rippleT * 4) * this.rippleT * 0.25;
      g.heat = Math.min(1, g.heat + wave);
    }

    const dx = x - g.prevX;
    const dy = y - g.prevY;
    const velScale = 6 / Math.max(dt, 0.008);
    this.velocities[i * 2] = dx * velScale;
    this.velocities[i * 2 + 1] = dy * velScale;

    g.prevX = x;
    g.prevY = y;
    g.prevZ = z;

    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.heats[i] = g.heat;
    this.depths[i] = g.depth;
    this.sizes[i] = g.sizeClass;
  }

  private advanceGhost(
    g: Ghost,
    dt: number,
    features: AudioFeatures,
    breathe: number,
    harmonic: HarmonicContext,
  ): void {
    const rate =
      (1 / g.loopPeriod) *
      this.params.loopSpeed *
      (0.75 + this.params.spinRate * 0.3) *
      (0.85 + breathe * 0.2);

    g.loopPhase += dt * rate;
    if (g.loopPhase >= 1) {
      g.loopPhase -= 1;
      g.anchorAngle += this.params.angularStep;
    }

    g.zPhase += dt * (0.35 + g.depth * 0.25);
    g.anchorR = ringRadius(g.orbitRing, this.swell) * (0.9 + breathe * 0.15);

    const s = g.loopPhase;
    const n = this.flowNoise(g.anchorAngle * 2, g.orbitRing + this.time * 0.05);
    const amp = g.loopAmp * this.params.loopAmpScale * breathe;

    switch (g.loopMode) {
      case 'ring':
        g.anchorAngle += s * TAU * this.params.spinRate * dt * 3 + this.fieldAngle * 0.002;
        g.anchorR += Math.sin(s * TAU * 2 + n) * amp * 0.3;
        break;
      case 'breathe': {
        const outward = Math.sin(s * Math.PI);
        g.anchorAngle += s * 0.35 * dt + n * 0.01;
        g.anchorR += outward * amp;
        g.heat = 0.28 + outward * 0.52;
        break;
      }
      case 'helical': {
        const lift = Math.sin(s * Math.PI);
        g.anchorAngle += s * 0.55 * dt + n * 0.015;
        g.anchorR += lift * amp * 0.85;
        g.heat = 0.32 + lift * 0.45;
        g.depth = 0.35 + lift * 0.35 + Math.sin(g.zPhase) * 0.12;
        break;
      }
    }

    const inner = g.orbitRing < RING_COUNT / 3;
    const mid = g.orbitRing < (RING_COUNT * 2) / 3;
    const band = inner ? features.bass : mid ? features.mids : features.highs;
    const spikeScale = inner ? 0.45 : mid ? 0.35 : 0.55;
    g.anchorR +=
      Math.sin(g.anchorAngle * 8 + this.time * 2) *
      band *
      amp *
      this.params.waveSpikeScale *
      spikeScale;

    if (harmonic.ensemblePulse > 0.2) {
      g.heat = Math.min(1, g.heat + harmonic.ensemblePulse * dt * 0.4);
    }
  }

  private syncPopulation(target: number, phase: MovementPhase): void {
    let active = this.pool.filter((g) => g.active).length;

    for (const g of this.pool) {
      if (active <= target) break;
      if (g.active) {
        g.active = false;
        active--;
      }
    }

    const shellBias = SHELL_BIAS[phase] ?? 0.5;

    for (const g of this.pool) {
      if (active >= target) break;
      if (!g.active) {
        g.active = true;
        const innerChance = phase === 'bloom' || phase === 'gather' ? 0.55 : 0.35;
        if (Math.random() < innerChance) {
          g.orbitRing = 1 + Math.floor(Math.random() * (RING_COUNT / 3));
          g.loopMode = Math.random() > 0.4 ? 'breathe' : 'helical';
          g.loopAmp = CORE_R * 0.12;
          g.depth = 0.25 + Math.random() * 0.35;
          g.heat = 0.38 + Math.random() * 0.22;
        } else {
          g.orbitRing =
            Math.floor(RING_COUNT / 3) +
            Math.floor(Math.random() * ((RING_COUNT * 2) / 3));
          g.loopMode = Math.random() > 0.55 ? 'ring' : 'helical';
          g.loopAmp = CORE_R * 0.06;
          g.depth = 0.45 + Math.random() * 0.45;
          g.heat = 0.28 + Math.random() * 0.2;
        }
        g.orbitRing = Math.max(
          1,
          Math.min(
            RING_COUNT - 2,
            Math.round(g.orbitRing * 0.65 + shellBias * (RING_COUNT - 2) * 0.35),
          ),
        );
        g.sizeClass = Math.random() < 0.62 ? SIZE_SMALL : SIZE_LARGE;
        g.loopPhase = Math.random();
        g.loopPeriod = (10 + Math.random() * 8) / this.params.loopSpeed;
        g.zPhase = Math.random() * TAU;
        g.anchorAngle = Math.random() * TAU;
        g.anchorR = ringRadius(g.orbitRing, 0);
        g.prevX = Math.cos(g.anchorAngle) * g.anchorR;
        g.prevY = Math.sin(g.anchorAngle) * g.anchorR;
        g.prevZ = 0;
        active++;
      }
    }
  }
}

function ringRadius(ring: number, swell: number): number {
  const t = ring / RING_COUNT;
  return CORE_R * (0.35 + t * 0.95) * (0.94 + swell * 0.12);
}

function makeGhost(): Ghost {
  return {
    loopPhase: 0,
    loopPeriod: 10,
    loopAmp: 0.3,
    anchorAngle: 0,
    anchorR: CORE_R,
    orbitRing: 1,
    loopMode: 'ring',
    depth: 0.5,
    heat: 0.4,
    active: false,
    prevX: 0,
    prevY: 0,
    prevZ: 0,
    zPhase: 0,
    sizeClass: SIZE_SMALL,
  };
}
