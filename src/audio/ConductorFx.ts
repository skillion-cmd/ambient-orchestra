/** Momentary mix/FX triggers invoked by the conductor */
export interface ConductorFx {
  triggerPreEnsembleInhale(): void;
  triggerSpaceThrow(durationSec?: number): void;
  triggerThinMix(durationSec?: number): void;
  triggerExhaleVacuum(): void;
}

export const noopConductorFx: ConductorFx = {
  triggerPreEnsembleInhale: () => {},
  triggerSpaceThrow: () => {},
  triggerThinMix: () => {},
  triggerExhaleVacuum: () => {},
};
