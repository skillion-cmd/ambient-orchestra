/**
 * A 2D canvas that is as wide as the column it is in.
 *
 * Both data panels used to be drawn at a fixed 220px, which is the width of a
 * desktop rail minus its padding. In the phone dock the same panel sits in a
 * sheet the width of the screen, and a 220px graphic floating in 360px of
 * space reads as something that failed to load. So the backing store follows
 * the element, and the drawing code asks for `width` every frame instead of
 * closing over a constant.
 *
 * Height stays fixed: these are strips of bars, and a taller strip is not a
 * more informative one.
 */
export class ScopeCanvas {
  readonly element: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** 0 until the first `resize` — see the constructor. */
  private w = 0;

  constructor(
    private readonly height: number,
    initialWidth: number,
    private readonly minWidth = 160,
  ) {
    this.element = document.createElement('canvas');
    this.element.className = 'scope-canvas';
    // Decorative to a screen reader: everything it draws is also in the text
    // rows above it, and a bitmap of bars announces nothing useful.
    this.element.setAttribute('aria-hidden', 'true');
    this.element.style.height = `${height}px`;

    const ctx = this.element.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    // `w` starts at 0 so this first call always sizes the backing store. It
    // used to start at `initialWidth`, which made this call a no-op (the
    // width "hadn't changed", and a fresh canvas is already 300px wide) —
    // so wherever the column really was 220px, which is every desktop rail,
    // the observer never saw a change either, and the panel was drawn into
    // the default 300×150 bitmap stretched to 220×182: text squeezed
    // sideways, stretched upright, and the bottom row cut off.
    this.resize(initialWidth);
  }

  /** CSS pixels across — the drawing code's coordinate width. */
  get width(): number {
    return this.w;
  }

  /** Track the width of the column this canvas was mounted in. */
  observe(host: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) this.resize(width);
    });
    observer.observe(host);
  }

  private resize(cssWidth: number): void {
    const next = Math.max(this.minWidth, Math.round(cssWidth));
    if (next === this.w && this.element.width > 0) return;
    this.w = next;
    // Capped at 2: a 3x phone gains nothing legible here and pays for every
    // pixel of it on a canvas redrawn every frame.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.element.width = Math.floor(next * dpr);
    this.element.height = Math.floor(this.height * dpr);
    this.element.style.width = `${next}px`;
    // A resize resets the context, transform included.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
