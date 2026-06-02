import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import type { AudioFeatures, HarmonicContext, VisualKnobs } from '../../audio/types';
import type { FluidState } from '../FluidField';
import type { VisualForm } from '../VisualForm';
import { resolveVisualKnobs, type VisualKnobParams } from '../VisualKnobParams';
import type { LayerBalance } from '../LayerBalance';
import { layerScale } from '../LayerBalance';
import type { VisualReadoutState } from '../VisualReadout';
import { createMilkyMaterial, type MilkyMaterial } from './milkyMaterial';
import type { SceneTheme } from '../ScenePalette';
import { getThemePalette } from '../ScenePalette';
import {
  dominantForm,
  lerpMorphology,
  morphologyFromHarmonic,
  nudgeMorphology,
  type MorphologyWeights,
} from './Morphology';

const STRAND_COUNT = 10;
const CURVE_POINTS = 72;
const TUBE_SEGMENTS = 96;
const TUBE_RADIUS = 0.24;
const RADIAL_SEGMENTS = 10;

interface Strand {
  mesh: THREE.Mesh;
  phase: number;
  layer: number;
  bandOffset: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleSpectrum(spectrum: Float32Array, t: number): number {
  if (spectrum.length === 0) return 0;
  const idx = clamp01(t) * (spectrum.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(spectrum.length - 1, lo + 1);
  return lerp(spectrum[lo]!, spectrum[hi]!, idx - lo);
}

/**
 * Sparse milky bodies — v1 tubes with breathe, morphology morph, grow/shrink.
 */
export class ExtrusionField {
  readonly group = new THREE.Group();
  private readonly strands: Strand[] = [];
  private readonly material: MilkyMaterial;
  private readonly pathNoise = createNoise3D(() => 17.3);
  private readonly spectrum = new Float32Array(64);
  private morphology: MorphologyWeights = { network: 0.72, sphere: 0.18, waveform: 0.1 };
  private targetMorphology: MorphologyWeights = { ...this.morphology };
  private breathe = 0.55;
  private time = 0;
  private swell = 0;
  private params = resolveVisualKnobs({ grain: 0.45, ripple: 0.5, drift: 0.4, focus: 0.28 });

  constructor(parent: THREE.Group) {
    this.material = createMilkyMaterial() as MilkyMaterial;
    parent.add(this.group);

    for (let i = 0; i < STRAND_COUNT; i++) {
      const mesh = this.buildStrandMesh(i);
      this.group.add(mesh);
      this.strands.push({
        mesh,
        phase: (i / STRAND_COUNT) * Math.PI * 2,
        layer: i / (STRAND_COUNT - 1),
        bandOffset: i / STRAND_COUNT,
      });
    }
  }

  update(
    dt: number,
    state: FluidState,
    features: AudioFeatures,
    harmonic: HarmonicContext,
    knobs: VisualKnobs,
    spectrum: Float32Array,
    breathe: number,
    balance: LayerBalance,
  ): VisualKnobParams {
    this.params = resolveVisualKnobs(knobs);
    this.time += dt;
    this.breathe = breathe;
    this.smoothSpectrum(spectrum, dt);

    this.swell =
      state.swell + features.bass * 0.14 + harmonic.ensemblePulse * 0.22 + state.morph * 0.05;

    this.targetMorphology = morphologyFromHarmonic(harmonic);
    const morphSmooth = 1 - Math.exp(-dt / 4);
    this.morphology = lerpMorphology(this.morphology, this.targetMorphology, morphSmooth);

    const bodyScale = layerScale(balance.bodyWeight);

    const wobble = this.params.orbitWobble * 0.008;
    const ripple = this.params.loopAmpScale * (0.35 + features.mids * 0.45);
    const drift = this.time * (this.params.loopSpeed * 0.12 + state.flowRate * 0.08);
    const swell = this.swell * (1 + features.overall * 0.25) * (0.65 + breathe * 0.55);

    this.group.visible = balance.bodyWeight > 0.08;
    this.group.rotation.y += dt * this.params.fieldRotation * 0.08;
    this.group.rotation.x = Math.sin(this.time * 0.07) * 0.12 * this.params.spinRate;

    const mat = this.material.uniforms;
    mat.time.value = this.time;
    mat.grain.value = 0.02 + knobs.grain * 0.045;
    mat.milky.value = 0.45 + state.ghostMix + knobs.drift * 0.35;
    mat.fogDensity.value = 0.032 + knobs.drift * 0.04 + state.ghostMix * 0.02;
    mat.uPresence.value = 0.18 + balance.bodyWeight * 0.95;

    for (const strand of this.strands) {
      this.updateStrand(
        strand,
        drift,
        wobble,
        ripple,
        swell,
        state,
        features,
        harmonic,
        breathe,
        bodyScale,
      );
    }

    return this.params;
  }

  requestNextForm(): VisualForm {
    this.morphology = nudgeMorphology(this.morphology);
    return dominantForm(this.morphology);
  }

  getReadoutState(harmonic: HarmonicContext): VisualReadoutState {
    const target = dominantForm(morphologyFromHarmonic(harmonic));
    const current = dominantForm(this.morphology);
    return {
      form: current,
      targetForm: target,
      particleCount: STRAND_COUNT,
      particleTarget: STRAND_COUNT,
      awaitingTarget: target !== current,
    };
  }

  dispose(): void {
    for (const strand of this.strands) {
      strand.mesh.geometry.dispose();
    }
    this.material.dispose();
  }

  setTheme(theme: SceneTheme): void {
    const palette = getThemePalette(theme);
    this.material.uniforms.uDarkField.value = theme === 'dark' ? 1 : 0;
    this.material.uniforms.fogColor.value.copy(palette.milkyFog);
  }

  private smoothSpectrum(raw: Float32Array, dt: number): void {
    const smooth = 1 - Math.exp(-dt / 0.08);
    const len = Math.min(this.spectrum.length, raw.length);
    for (let i = 0; i < len; i++) {
      this.spectrum[i]! += (raw[i]! - this.spectrum[i]!) * smooth;
    }
  }

  private buildStrandMesh(index: number): THREE.Mesh {
    const points = this.buildSinglePath(
      index / (STRAND_COUNT - 1),
      0,
      'network',
      0,
      0,
      0,
      1,
      { swell: 0, contourDepth: 0.5, turbulence: 0.4 } as FluidState,
      { bass: 0, mids: 0, highs: 0, overall: 0 },
      { ensemblePulse: 0 } as HarmonicContext,
    );
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(
      curve,
      TUBE_SEGMENTS,
      TUBE_RADIUS * (0.75 + (index % 5) * 0.06),
      RADIAL_SEGMENTS,
      false,
    );
    return new THREE.Mesh(geometry, this.material);
  }

  private updateStrand(
    strand: Strand,
    drift: number,
    wobble: number,
    ripple: number,
    swell: number,
    state: FluidState,
    features: AudioFeatures,
    harmonic: HarmonicContext,
    breathe: number,
    bodyScale: number,
  ): void {
    const m = this.morphology;
    const nets = this.buildSinglePath(
      strand.layer,
      strand.phase,
      'network',
      drift,
      wobble,
      ripple,
      swell,
      state,
      features,
      harmonic,
      strand.bandOffset,
    );
    const spheres = this.buildSinglePath(
      strand.layer,
      strand.phase,
      'sphere',
      drift,
      wobble,
      ripple,
      swell,
      state,
      features,
      harmonic,
      strand.bandOffset,
    );
    const waves = this.buildSinglePath(
      strand.layer,
      strand.phase,
      'waveform',
      drift,
      wobble,
      ripple,
      swell,
      state,
      features,
      harmonic,
      strand.bandOffset,
    );

    const pointCount = Math.max(
      6,
      Math.floor(CURVE_POINTS * (0.32 + breathe * 0.58) * (0.45 + bodyScale * 0.65)),
    );
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < pointCount; i++) {
      const fullIdx = Math.floor((i / (pointCount - 1)) * (CURVE_POINTS - 1));
      points.push(
        nets[fullIdx]!
          .clone()
          .multiplyScalar(m.network)
          .add(spheres[fullIdx]!.clone().multiplyScalar(m.sphere))
          .add(waves[fullIdx]!.clone().multiplyScalar(m.waveform)),
      );
    }

    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const radius =
      TUBE_RADIUS *
      (0.58 + strand.layer * 0.32 + swell * 0.16) *
      (0.82 + sampleSpectrum(this.spectrum, strand.bandOffset) * 0.32) *
      (0.75 + breathe * 0.35) *
      (0.42 + bodyScale * 0.72);

    strand.mesh.geometry.dispose();
    strand.mesh.geometry = new THREE.TubeGeometry(
      curve,
      Math.max(16, Math.floor(TUBE_SEGMENTS * breathe)),
      radius,
      RADIAL_SEGMENTS,
      false,
    );
  }

  private buildSinglePath(
    layer: number,
    phase: number,
    form: VisualForm,
    drift: number,
    wobble: number,
    ripple: number,
    swell: number,
    state: FluidState,
    features: AudioFeatures,
    harmonic: HarmonicContext,
    bandOffset = layer,
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const depth = state.contourDepth * 8;
    const turb = state.turbulence;

    for (let i = 0; i < CURVE_POINTS; i++) {
      const t = i / (CURVE_POINTS - 1);
      const spec = sampleSpectrum(this.spectrum, t * 0.85 + bandOffset * 0.12);
      const audioLift = spec * ripple * 3.2;

      let x = 0;
      let y = 0;
      let z = 0;

      switch (form) {
        case 'network':
          x = lerp(-7, 7, t) + Math.sin(t * Math.PI * 2 + phase + drift) * (2.2 + wobble * 40);
          y =
            lerp(-5.5, 5.5, layer) +
            Math.sin(t * 4 + drift * 0.7 + phase) * (1.4 + audioLift);
          z =
            Math.sin(t * Math.PI + phase * 0.5 + drift * 0.4) * (2.5 + depth) +
            this.pathNoise(t * 1.4, layer * 2, drift * 0.2) * turb * 2.2;
          break;
        case 'sphere': {
          const theta = t * Math.PI * 2 + phase + drift * 0.25;
          const phi = layer * Math.PI + Math.sin(drift + t * 3) * 0.35;
          const r = 4.2 + swell * 1.8 + audioLift * 0.8;
          x = Math.cos(theta) * Math.sin(phi) * r;
          y = Math.sin(theta) * Math.sin(phi) * r * 0.85;
          z = Math.cos(phi) * r + this.pathNoise(theta, phi, drift) * wobble * 20;
          break;
        }
        case 'waveform': {
          const band =
            layer < 0.34 ? features.bass : layer < 0.67 ? features.mids : features.highs;
          const angle = t * Math.PI * 2 + phase * 0.3;
          const radius =
            3.2 +
            band * 2.8 +
            Math.sin(angle * 6 + drift * 2) * (0.4 + spec * 1.6) +
            harmonic.ensemblePulse * 0.9;
          x = Math.cos(angle) * radius;
          y = Math.sin(angle * 2 + drift) * (0.8 + audioLift * 0.5);
          z = Math.sin(angle) * radius + layer * 2.4 - 1.2;
          break;
        }
      }

      const jitter =
        this.pathNoise(t * 3 + phase, layer * 4, drift) * this.params.noiseJitter * 4;
      points.push(new THREE.Vector3(x + jitter, y + jitter * 0.6, z + jitter * 0.8));
    }

    return points;
  }
}

export { SCENE_BG } from '../ScenePalette';
