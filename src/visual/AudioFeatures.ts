import type { AudioFeatures } from '../audio/types';

const TAU = Math.PI * 2;
const SMOOTH_TAU = 1.5;

export class AudioFeatureSmoother {
  private features: AudioFeatures = { bass: 0, mids: 0, highs: 0, overall: 0 };

  update(raw: AudioFeatures, dt: number): AudioFeatures {
    const alpha = 1 - Math.exp(-dt / SMOOTH_TAU);
    this.features = {
      bass: this.features.bass + (raw.bass - this.features.bass) * alpha,
      mids: this.features.mids + (raw.mids - this.features.mids) * alpha,
      highs: this.features.highs + (raw.highs - this.features.highs) * alpha,
      overall: this.features.overall + (raw.overall - this.features.overall) * alpha,
    };
    return { ...this.features };
  }

  get(): AudioFeatures {
    return { ...this.features };
  }
}

export { TAU };
