/** Ghost/body presence split from the Focus knob (0 = ghost-heavy, 1 = body-heavy) */
export interface LayerBalance {
  ghostWeight: number;
  bodyWeight: number;
}

export function resolveLayerBalance(focus: number): LayerBalance {
  const f = Math.max(0, Math.min(1, focus));
  return {
    ghostWeight: 0.7 - f * 0.4,
    bodyWeight: 0.3 + f * 0.4,
  };
}

/** Scale factor relative to 50/50 neutral */
export function layerScale(weight: number): number {
  return weight / 0.5;
}
