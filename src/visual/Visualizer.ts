import * as THREE from 'three';
import type { HarmonicContext, VisualKnobs } from '../audio/types';
import { DEFAULT_KNOBS } from '../audio/types';
import type { AudioFeatures } from '../audio/types';
import { AudioFeatureSmoother } from './AudioFeatures';
import { FluidField } from './FluidField';
import { resolveVisualKnobs, type VisualKnobParams } from './VisualKnobParams';
import { resolveLayerBalance } from './LayerBalance';
import type { ArtDirectorDirectives } from './ArtDirectorSkill';
import { FieldDriveSource } from './FieldDrive';
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
import { PLANE_Z as RESONANCE_PLANE_Z, ResonanceField } from './resonance/ResonanceField';
import { plateAspectFor } from './resonance/plate';
import { loadStoredVisualMode, type VisualMode } from './VisualMode';

const MAX_DPR = 1.5;

/**
 * Where the camera sits when nothing is pulling it. The plate is sized
 * against this, so the two have to be one number — a camera that rested
 * somewhere else would frame a plate cut to fit a place it never is.
 */
const CAMERA_REST_Z = 15.5;

/** How much of the frustum the plate fills, leaving it edges to be seen by. */
const PLATE_FILL = 0.94;

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
  /** Chladni plate layer — also lazy; most sessions never ask for it. */
  private resonance: ResonanceField | null = null;
  private visualMode: VisualMode;
  private readonly spectrumScratch = new Float32Array(64);
  private readonly trailBg = new THREE.Color();
  private theme: SceneTheme;
  private width = 0;
  private height = 0;
  /** Fraction of the viewport's bottom edge the phone dock is covering. */
  private fieldInsetBottom = 0;
  private cameraDrift = 0;
  private breathe = 0.5;
  /** One reading of the piece, handed to whichever field is on screen. */
  private readonly driveSource = new FieldDriveSource();
  private art: ArtDirectorDirectives = {
    fogMultiplier: 1,
    focusOffset: 0,
    moodBlend: 0,
    constellationTrigger: false,
  };
  /** 0 = the ink field's orbit, 1 = square onto the resonance plate. */
  private planeLock = 0;
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
    if (this.visualMode === 'resonance') this.ensureResonance();
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

  /**
   * Apply autonomous Art Director directives — call before update().
   *
   * Fog, focus and mood are held for the frame's FieldDrive rather than
   * pushed at one field: they used to reach the ink field only, which is
   * why the director's focus arc and phase fog were invisible in two of the
   * three visuals. The constellation stays an ink-only one-shot — it is a
   * shape made out of ghosts, and there is nothing to make it from
   * elsewhere.
   */
  applyDirectives(d: ArtDirectorDirectives): void {
    this.art = d;
    if (d.constellationTrigger) this.ghosts.triggerConstellation();
  }

  setVisualMode(mode: VisualMode): void {
    if (mode === this.visualMode) return;
    this.visualMode = mode;
    if (mode === 'currents') this.ensureCurrents();
    if (mode === 'resonance') this.ensureResonance();
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

  private ensureResonance(): ResonanceField {
    if (!this.resonance) {
      // Scene-level for the same reason the currents plane is: the plate is
      // a flat figure read head-on, and the world scale would push most of
      // it out of frame.
      this.resonance = new ResonanceField(this.scene, this.theme);
      this.syncPlateExtent();
    }
    return this.resonance;
  }

  /**
   * Size the plate to the window.
   *
   * The frustum at the plate's depth is what "fits the screen" actually
   * means here, so it is measured rather than guessed — but the plate is
   * cut to a shape that *leans* towards the window rather than matching it
   * (see `plateAspectFor`), and then made the largest rectangle of that
   * shape that fits. On a 16:9 window that is a plate a little wider than
   * tall standing in the middle of the field, which is a plate; taking the
   * window's full 16:9 gave a figure with no corners and no edges, which is
   * wallpaper.
   */
  private syncPlateExtent(): void {
    if (!this.resonance) return;
    const distance = CAMERA_REST_Z - RESONANCE_PLANE_Z;
    const frustumHalfHeight = Math.tan((this.camera.fov * Math.PI) / 360) * distance;
    const frustumHalfWidth = frustumHalfHeight * this.camera.aspect;
    // The free field, not the window: on a phone the bottom of the screen is
    // a sheet of controls, and a plate centred in the window sat almost
    // entirely behind it. What is left is a short, wide letterbox, which is
    // a shape the plate is perfectly happy to take.
    const halfVisible = frustumHalfHeight * (1 - this.fieldInsetBottom);
    const aspect = plateAspectFor(frustumHalfWidth / halfVisible);
    const halfHeight = Math.min(halfVisible, frustumHalfWidth / aspect) * PLATE_FILL;
    this.resonance.setExtent(halfHeight * aspect, halfHeight);
    // Stand it in the middle of what can be seen.
    this.resonance.group.position.y = frustumHalfHeight * this.fieldInsetBottom;
  }

  /**
   * How much of the bottom of the viewport is covered by something opaque —
   * the phone dock, and nothing else so far. 0 on a wide screen.
   *
   * Only the plate reads it. The ink field and the wind map are full-bleed
   * washes with no single object in them to be hidden; a Chladni figure is
   * one object, and half of one is not a figure.
   */
  setFieldInset(bottom: number): void {
    const next = Math.max(0, Math.min(0.8, bottom));
    if (Math.abs(next - this.fieldInsetBottom) < 0.004) return;
    this.fieldInsetBottom = next;
    this.syncPlateExtent();
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
    this.resonance?.setTheme(theme);
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
    this.syncPlateExtent();
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

    // The one reading of the piece every field works from. Focus and fog
    // carry the Art Director inside them, so a field consuming the drive
    // gets the director's arc whether or not it knows he exists.
    const drive = this.driveSource.update(harmonic, knobs, this.art, this.breathe, dt);
    const balance = resolveLayerBalance(drive.focus);

    const sceneFog = this.scene.fog as THREE.FogExp2 | null;
    if (sceneFog) sceneFog.density = getThemePalette(this.theme).fogDensity * (0.5 + knobs.fog);

    const inCurrents = this.visualMode === 'currents' && this.currents;
    const inResonance = this.visualMode === 'resonance' && this.resonance;
    if (inCurrents) {
      this.visualParams = resolveVisualKnobs(knobs);
      this.currents!.update(dt, features, harmonic, knobs, drive);
    } else if (inResonance) {
      this.visualParams = resolveVisualKnobs(knobs);
      this.resonance!.update(dt, features, harmonic, knobs, drive);
    } else {
      this.visualParams = this.ghosts.update(
        dt,
        state,
        features,
        harmonic,
        knobs,
        drive,
        balance,
      );
      this.bodies.update(dt, state, features, harmonic, knobs, bands, drive, balance);
    }

    this.cameraDrift += dt * (0.08 + knobs.drift * 0.12);
    const inhale = drive.inhale;
    const spaceThrow = drive.expand;
    const camR = CAMERA_REST_Z + state.swell * 1.8 - inhale * 2.5 + spaceThrow * 1.8;

    // A figure has to be looked at square. The orbit that makes the ink
    // field feel like a space you are moving through shears a Chladni
    // figure into an unreadable diamond — the symmetry *is* the image, and
    // it only reads head-on. So in Resonance the camera settles onto the
    // plate's axis, keeping a fraction of the drift so it is still a camera
    // and not a screenshot. Eased rather than switched, so changing mode
    // glides rather than cuts.
    this.planeLock += ((inResonance ? 1 : 0) - this.planeLock) * (1 - Math.exp(-dt / 1.4));
    const orbit = 1 - this.planeLock * 0.88;

    this.camera.position.x = Math.sin(this.cameraDrift * 0.35) * 2.8 * orbit;
    this.camera.position.y =
      (0.4 + Math.sin(this.cameraDrift * 0.22) * 1.15 + features.mids * 0.4) * orbit;
    this.camera.position.z = camR + Math.cos(this.cameraDrift * 0.18) * 1.0;
    this.camera.lookAt(0, state.swell * 0.3 * orbit, 0);

    // Cap the zoom so large windows stay framed-out like small ones — more of
    // the field stays visible (denser, busier composition) instead of zooming
    // into a few huge tubes.
    const baseScale = Math.min(Math.min(this.width, this.height) * 0.0042, 2.3);
    this.worldGroup.scale.setScalar(
      baseScale * (1 - inhale * 0.15 + spaceThrow * 0.22),
    );

    const inPlane = inCurrents || inResonance;
    this.ghosts.group.visible = !inPlane && balance.ghostWeight > 0.08;
    this.bodies.group.visible = !inPlane && balance.bodyWeight > 0.08;
    if (this.currents) this.currents.group.visible = !!inCurrents;
    if (this.resonance) this.resonance.group.visible = !!inResonance;

    // Currents lean on the trail buffer hardest — the streaks ARE the
    // visual. Resonance wants the opposite: a figure is a still image, and
    // long trails smear the nodal lines into a fog. It takes the shortest
    // persistence of the three, enough to soften the grain and no more.
    const baseTrail = inCurrents
      ? 0.01 + (1 - knobs.trails) * 0.07
      : inResonance
        ? 0.12 - knobs.trails * 0.07
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
    this.resonance?.dispose();
    this.renderer.dispose();
  }

  getReadoutState(harmonic: HarmonicContext) {
    const body = this.bodies.getReadoutState(harmonic);
    const inCurrents = this.visualMode === 'currents' && this.currents;
    const inResonance = this.visualMode === 'resonance' && this.resonance;
    return {
      ...body,
      particleCount: inCurrents
        ? this.currents!.getActiveCount()
        : inResonance
          ? this.resonance!.getActiveCount()
          : this.ghosts.getActiveCount(),
      particleTarget: Math.floor(this.visualParams.particleTarget * (0.55 + this.breathe * 0.45)),
    };
  }

  requestNextForm(): void {
    this.bodies.requestNextForm();
  }
}
