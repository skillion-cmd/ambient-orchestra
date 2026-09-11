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
 * The plate leans towards the shape of the window without ever becoming it;
 * see `plateAspectFor` for why a figure stops being one if it does.
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
 * `aspect` scales the mode numbers along u, which puts *more cells* on a
 * wider plate rather than stretching the ones it has. The identity it makes
 * good on: for a point at world (x, y) on a plate of half-height B and
 * half-width aB,
 *
 *   plateAt(x / (aB), y / B, mode, out, a) === plateAt(x / B, y / B, mode, out, 1)
 *
 * — the same figure at the same scale, seen over a wider stretch of plate.
 *
 * That is a true statement and, past a little of it, the wrong thing to do:
 * see `modeAspectFor`. It is kept because a plate that is *slightly* wider
 * than tall is better served by a little more plate than by a little
 * stretch, and because at aspect 1 — the common case now — it costs
 * nothing.
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

/**
 * How much of the window's shape the plate is allowed to take.
 *
 * A Chladni figure is a *bounded* object. Its two diagonals run corner to
 * corner, its nodal lines close on themselves or meet the edge, and the
 * whole thing is symmetric under a quarter turn — which only exists on a
 * square. Cut it to a 16:9 window and none of that survives: the diagonals
 * stop somewhere in the middle of the screen, the outer thirds are pattern
 * with no figure in them, and the left and right edges land wherever they
 * land, mid-cell. It stops reading as a plate with sand on it and starts
 * reading as wallpaper, which is what a Chladni figure is precisely not.
 *
 * So the plate leans towards the window's shape rather than adopting it.
 * The lean is taken in log space, so a 2:1 window and a 1:2 one are treated
 * alike, and it is capped: past `MAX_PLATE_ASPECT` the plate stops growing
 * sideways and the field frames it, the same way a real plate sits on a
 * bench with room around it.
 */
const PLATE_FOLLOW = 0.5;
const MAX_PLATE_ASPECT = 1.34;

export function plateAspectFor(windowAspect: number): number {
  const safe = Math.max(0.05, windowAspect);
  const leaned = Math.pow(safe, PLATE_FOLLOW);
  return Math.max(1 / MAX_PLATE_ASPECT, Math.min(MAX_PLATE_ASPECT, leaned));
}

/**
 * How much of the plate's shape arrives as extra cells rather than stretch.
 *
 * The remainder is stretch, and at these aspects that is the right way
 * round. Full compensation is what turned a wide plate into wallpaper: the
 * figure stayed undistorted and stopped being a figure. A whole figure
 * carrying a few per cent of stretch still reads instantly as a Chladni
 * plate — the eye is reading the symmetry and the closed lines, not
 * measuring the cells — so the plate keeps the object and spends the
 * distortion.
 *
 * Not zero, because a plate a third wider than tall does have a little more
 * room on it, and a small amount of it is better given to the figure than
 * to the aspect: half and half keeps both errors under about 15%.
 */
const MODE_FOLLOW = 0.5;

export function modeAspectFor(plateAspect: number): number {
  return Math.pow(Math.max(0.05, plateAspect), MODE_FOLLOW);
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
