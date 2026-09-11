import type { HarmonicContext, MovementPhase } from '../../audio/types';

/**
 * The standing wave on a plate, and where the sand ends up.
 *
 * A Chladni plate is the oldest audio visualiser there is: drive a metal
 * square at a resonant frequency, and the grains scattered on it bounce
 * away from everywhere that is moving and pile up on the lines that are
 * not. The figure is not a picture of the sound — it *is* the sound, the
 * shape the plate takes at that frequency.
 *
 * Which makes it the one visual here that answers the harmony directly
 * rather than the level. The mode numbers come from the chord the field is
 * currently holding, so a chord change is a figure change; the plate is
 * showing you the interval, not the volume.
 *
 * ψ(u,v) = cos(nπu)cos(mπv) − cos(mπu)cos(nπv)
 *
 * on u,v ∈ [-1,1]. Nodal lines are ψ = 0, and this is the symmetric
 * (free-edge) form, whose figures are the ones everyone recognises. n and
 * m are held as floats rather than integers so a chord change *morphs*
 * through the figures between the two rather than cutting.
 *
 * The plate takes the shape of the window rather than staying square; see
 * `aspect` on plateAt for how a rectangle gets a figure without one being
 * stretched to fit it.
 */
export interface PlateMode {
  n: number;
  m: number;
}

export interface PlateGradient {
  /** ψ at the sample point — 0 on a nodal line. */
  psi: number;
  /** ∂ψ/∂u and ∂ψ/∂v, for walking downhill toward the nearest line. */
  du: number;
  dv: number;
}

const PI = Math.PI;

/**
 * ψ and its gradient at one point. Analytic — no finite differences.
 *
 * `aspect` is the plate's width over its height, and it scales the mode
 * numbers along u rather than stretching the figure. That distinction is
 * the whole reason it is a parameter.
 *
 * A plate that fills a landscape window is a rectangle, and there are two
 * ways to put a figure on one. Stretching the square figure to fit makes
 * every cell oblong and throws away the diagonal symmetry — the thing that
 * makes a Chladni figure read as one, and the same symmetry the camera's
 * plane lock exists to protect. Scaling the mode numbers instead keeps
 * every cell square and simply puts more of them along the long axis,
 * which is what a wider plate actually does: the wavelength is set by the
 * plate's stiffness, not by the shape of the window you are watching it
 * through.
 *
 * The identity that falls out is worth stating, because it is what
 * guarantees no distortion: for a point at world (x, y) on a plate of
 * half-height B and half-width aB,
 *
 *   plateAt(x / (aB), y / B, mode, out, a) === plateAt(x / B, y / B, mode, out, 1)
 *
 * — the same figure at the same scale, seen over a wider stretch of plate.
 */
export function plateAt(
  u: number,
  v: number,
  mode: PlateMode,
  out: PlateGradient,
  aspect = 1,
): void {
  const { n, m } = mode;
  const nu = n * aspect;
  const mu = m * aspect;
  const cnu = Math.cos(nu * PI * u);
  const cmv = Math.cos(m * PI * v);
  const cmu = Math.cos(mu * PI * u);
  const cnv = Math.cos(n * PI * v);
  const snu = Math.sin(nu * PI * u);
  const smv = Math.sin(m * PI * v);
  const smu = Math.sin(mu * PI * u);
  const snv = Math.sin(n * PI * v);

  out.psi = cnu * cmv - cmu * cnv;
  out.du = -nu * PI * snu * cmv + mu * PI * smu * cnv;
  out.dv = -m * PI * cnu * smv + n * PI * cmu * snv;
}

/** Fewer, broader figures where the piece is quiet; busier at the crest. */
const PHASE_COMPLEXITY: Record<MovementPhase, number> = {
  drift: 0,
  gather: 1,
  bloom: 2,
  hang: 2,
  dissolve: 1,
  exhale: 0,
};

const MIN_MODE = 2;
const MAX_MODE = 9;

function clampMode(value: number): number {
  return Math.max(MIN_MODE, Math.min(MAX_MODE, Math.round(value)));
}

/**
 * The figure this chord asks for.
 *
 * `n` comes from the interval between the root and the second note of the
 * chord — the third, in most voicings, which is the note that decides
 * whether you are hearing major or minor. `m` comes from the top of the
 * chord. So a triad and its extension are neighbouring figures, a mode
 * shift moves both, and the plate's symmetry follows the harmony's:
 * n and m close together give the near-diagonal figures, far apart the
 * dense lattices.
 *
 * The two are kept from landing on the same number — n = m collapses ψ to
 * zero everywhere, which is a plate with no figure at all.
 */
export function modeForChord(ctx: HarmonicContext): PlateMode {
  const scale = ctx.scale;
  const degrees = ctx.chordDegrees.length > 0 ? ctx.chordDegrees : [0, 2, 4];
  const semitoneAt = (index: number): number => {
    const degree = degrees[Math.min(index, degrees.length - 1)] ?? 0;
    return scale[((degree % scale.length) + scale.length) % scale.length] ?? 0;
  };

  const complexity = PHASE_COMPLEXITY[ctx.movementPhase];
  const n = clampMode(MIN_MODE + (semitoneAt(1) % 5) + Math.round(ctx.brightness));
  const m = clampMode(MIN_MODE + 1 + (semitoneAt(degrees.length - 1) % 6) + complexity);
  if (m !== n) return { n, m };
  return { n, m: m < MAX_MODE ? m + 1 : m - 1 };
}
