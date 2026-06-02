import type { VisualForm } from './VisualForm';

export interface VisualReadoutState {
  form: VisualForm;
  targetForm: VisualForm;
  particleCount: number;
  particleTarget: number;
  awaitingTarget: boolean;
}
