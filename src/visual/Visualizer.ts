import * as THREE from 'three';
import type { HarmonicContext, VisualKnobs } from '../audio/types';
import { DEFAULT_KNOBS } from '../audio/types';
import type { AudioFeatures } from '../audio/types';
import { AudioFeatureSmoother } from './AudioFeatures';
import { FluidField } from './FluidField';
import { resolveVisualKnobs, type VisualKnobParams } from './VisualKnobParams';
import { resolveLayerBalance } from './LayerBalance';
import type { ArtDirectorDirectives } from './ArtDirectorSkill';
import {
  applySceneFog,
  getThemePalette,
  loadStoredTheme,
  type SceneTheme,
} from './ScenePalette';
import { ExtrusionField } from './three/ExtrusionField';
import { GhostField } from './three/GhostField';
import { TrailPass } from './three/TrailPass';
import { CurrentsField } from './currents/CurrentsField';
import { loadStoredVisualMode, type VisualMode } from './VisualMode';

const MAX_DPR = 1.5;

export type VisualizerInitResult = 'ok' | 'webgl-unavailable';

/**
 * Layered ambient field — unified ink-in-water trails on a pale field.
 */
export class Visualizer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly worldGroup = new THREE.Group();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly trailPass: TrailPass;
  private readonly smoother = new AudioFeatureSmoother();
  private readonly fluid = new FluidField();
  private readonly ghosts: GhostField;
  private readonly bodies: ExtrusionField;
  /** Wind-map currents layer — built lazily on the first switch. */
  private currents: CurrentsField | null = null;
  private visualMode: VisualMode;
  private readonly spectrumScratch = new Float32Array(64);
  private readonly trailBg = new THREE.Color();
  private theme: SceneTheme;
  private width = 0;
  private height = 0;
  private cameraDrift = 0;
  private breathe = 0.5;
  private artFocusOffset = 0;
  private artFogMultiplier = 1;
  private visualParams: VisualKnobParams = resolveVisualKnobs(DEFAULT_KNOBS.visual);

  constructor(private readonly canvas: HTMLCanvasElement, theme: SceneTheme = loadStoredTheme()) {
    this.theme = theme;
    const palette = getThemePalette(theme);
    this.trailBg.copy(palette.sceneFog);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(palette.sceneBg, 1);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    applySceneFog(this.scene, theme);
    this.scene.add(this.worldGroup);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.camera.position.set(0, 0.5, 16);

    this.trailPass = new TrailPass(this.renderer, this.trailBg);
    this.ghosts = new GhostField(this.worldGroup, theme);
    this.bodies = new ExtrusionField(this.worldGroup);
    this.bodies.setTheme(theme);
    this.visualMode = loadStoredVisualMode();
    if (this.visualMode === 'currents') this.ensureCurrents();
    this.resize();
  }

  static tryCreate(canvas: HTMLCanvasElement): { visualizer: Visualizer | null; error: VisualizerInitResult } {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl') ?? probe.getContext('experimental-webgl');
      if (!gl) {
        return { visualizer: null, error: 'webgl-unavailable' };
      }
      return { visualizer: new Visualizer(canvas), error: 'ok' };
    } catch {
      return { visualizer: null, error: 'webgl-unavailable' };
    }
  }

  /** Apply autonomous Art Director directives — call before update(). */
  applyDirectives(d: ArtDirectorDirectives): void {
    this.artFogMultiplier = d.fogMultiplier;
    this.ghosts.moodBlend = d.moodBlend;
    if (this.currents) this.currents.moodBlend = d.moodBlend;
    this.artFocusOffset = d.focusOffset;
    if (d.constellationTrigger) this.ghosts.triggerConstellation();
  }

  setVisualMode(mode: VisualMode): void {
    if (mode === this.visualMode) return;
    this.visualMode = mode;
    if (mode === 'currents') this.ensureCurrents();
  }

  getVisualMode(): VisualMode {
    return this.visualMode;
  }

  private ensureCurrents(): CurrentsField {
    if (!this.currents) {
      // Scene-level, NOT inside worldGroup: the world scale (~2.3x) would
      // push most of the current plane outside the frustum and shove what's
      // left into the pale far-fog depth band.
      this.currents = new CurrentsField(this.scene, this.theme);
    }
    return this.currents;
  }

  setTheme(theme: SceneTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    const palette = getThemePalette(theme);
    this.trailBg.copy(palette.sceneFog);
    this.trailPass.setBackground(this.trailBg);
    this.trailPass.resize(this.canvas.width, this.canvas.height);
    this.renderer.setClearColor(palette.sceneBg, 1);
    applySceneFog(this.scene, theme);
    this.ghosts.setTheme(theme);
    this.bodies.setTheme(theme);
    this.currents?.setTheme(theme);
  }

  getTheme(): SceneTheme {
    return this.theme;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / Math.max(1, this.height);
    this.camera.updateProjectionMatrix();
    this.trailPass.resize(this.canvas.width, this.canvas.height);
  }

  update(
    rawFeatures: AudioFeatures,
    dt: number,
    knobs: VisualKnobs,
    harmonic: HarmonicContext,
    spectrum?: Float32Array,
  ): void {
    const features = this.smoother.update(rawFeatures, dt);
    const state = this.fluid.update(harmonic, dt, knobs, features);
    const bands = this.spectrumScratch;

    if (spectrum && spectrum.length > 0) {
      const step = Math.max(1, Math.floor(spectrum.length / bands.length));
      for (let i = 0; i < bands.length; i++) {
        let sum = 0;
        const start = i * step;
        const end = Math.min(spectrum.length, start + step);
        for (let j = start; j < end; j++) sum += spectrum[j]!;
        bands[i] = sum / Math.max(1, end - start);
      }
    } else {
      bands.fill(0);
      bands[0] = features.bass;
      bands[Math.floor(bands.length * 0.35)] = features.mids;
      bands[Math.floor(bands.length * 0.7)] = features.highs;
    }

    const breatheTarget =
      0.3 +
      features.overall * 0.38 +
      state.swell * 0.28 +
      harmonic.ensemblePulse * 0.14 +
      features.mids * 0.08;
    const breatheSmooth = 1 - Math.exp(-dt / 0.22);
    this.breathe += (breatheTarget - this.breathe) * breatheSmooth;

    const focus = Math.max(0, Math.min(1, knobs.focus + this.artFocusOffset));
    const balance = resolveLayerBalance(focus);

    // Fog knob rides over the art director's phase breathing (neutral at 0.5).
    const fogK = 0.5 + knobs.fog;
    this.ghosts.fogMultiplier = this.artFogMultiplier * fogK;
    const sceneFog = this.scene.fog as THREE.FogExp2 | null;
    if (sceneFog) sceneFog.density = getThemePalette(this.theme).fogDensity * fogK;

    const inCurrents = this.visualMode === 'currents' && this.currents;
    if (inCurrents) {
      this.visualParams = resolveVisualKnobs(knobs);
      this.currents!.update(dt, features, harmonic, knobs, this.breathe);
    } else {
      this.visualParams = this.ghosts.update(
        dt,
        state,
        features,
        harmonic,
        knobs,
        this.breathe,
        balance,
      );
      this.bodies.update(dt, state, features, harmonic, knobs, bands, this.breathe, balance);
    }

    this.cameraDrift += dt * (0.08 + knobs.drift * 0.12);
    const inhale = harmonic.inhaleGesture;
    const spaceThrow = harmonic.spaceThrowGesture;
    const camR = 15.5 + state.swell * 1.8 - inhale * 2.5 + spaceThrow * 1.8;
    this.camera.position.x = Math.sin(this.cameraDrift * 0.35) * 2.8;
    this.camera.position.y = 0.4 + Math.sin(this.cameraDrift * 0.22) * 1.15 + features.mids * 0.4;
    this.camera.position.z = camR + Math.cos(this.cameraDrift * 0.18) * 1.0;
    this.camera.lookAt(0, state.swell * 0.3, 0);

    // Cap the zoom so large windows stay framed-out like small ones — more of
    // the field stays visible (denser, busier composition) instead of zooming
    // into a few huge tubes.
    const baseScale = Math.min(Math.min(this.width, this.height) * 0.0042, 2.3);
    this.worldGroup.scale.setScalar(
      baseScale * (1 - inhale * 0.15 + spaceThrow * 0.22),
    );

    this.ghosts.group.visible = !inCurrents && balance.ghostWeight > 0.08;
    this.bodies.group.visible = !inCurrents && balance.bodyWeight > 0.08;
    if (this.currents) this.currents.group.visible = !!inCurrents;

    // Currents lean on the trail buffer much harder — the streaks ARE the
    // visual — so the trails knob gets a lower fade floor there.
    const baseTrail = inCurrents
      ? 0.01 + (1 - knobs.trails) * 0.07
      : this.visualParams.trailFade * (0.38 + balance.ghostWeight * 0.34);
    const trailFade =
      baseTrail * (1 + inhale * 2.8) * Math.max(0.35, 1 - spaceThrow * 0.45);
    const rt = this.trailPass.beginFrame(trailFade);
    this.renderer.setRenderTarget(rt);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.trailPass.endFrame();
  }

  dispose(): void {
    this.trailPass.dispose();
    this.ghosts.dispose();
    this.currents?.dispose();
    this.renderer.dispose();
  }

  getReadoutState(harmonic: HarmonicContext) {
    const body = this.bodies.getReadoutState(harmonic);
    const inCurrents = this.visualMode === 'currents' && this.currents;
    return {
      ...body,
      particleCount: inCurrents ? this.currents!.getActiveCount() : this.ghosts.getActiveCount(),
      particleTarget: Math.floor(this.visualParams.particleTarget * (0.55 + this.breathe * 0.45)),
    };
  }

  requestNextForm(): void {
    this.bodies.requestNextForm();
  }
}
