/** Pixels of vertical travel for the full 0–1 sweep. */
const DRAG_RANGE_PX = 200;
/** Arrow-key step; shifted arrows move by a tenth of the range. */
const KEY_STEP = 0.02;
const KEY_STEP_COARSE = 0.1;

export class Knob {
  readonly element: HTMLDivElement;
  private readonly dial: HTMLDivElement;
  private readonly valueEl: HTMLSpanElement;
  private value: number;
  private dragging = false;
  private pointerId: number | null = null;
  private startY = 0;
  private startValue = 0;

  constructor(
    label: string,
    leftLabel: string,
    rightLabel: string,
    initial: number,
    private readonly onChange: (value: number) => void,
  ) {
    this.value = initial;

    this.element = document.createElement('div');
    this.element.className = 'knob';

    const labelEl = document.createElement('div');
    labelEl.className = 'knob-label';
    labelEl.textContent = label;

    // The dial is the control, so it is the thing that takes focus and
    // announces itself — a div with a rotating tick told a screen reader
    // nothing, and told a thumb nothing either.
    this.dial = document.createElement('div');
    this.dial.className = 'knob-dial';
    this.dial.tabIndex = 0;
    this.dial.setAttribute('role', 'slider');
    this.dial.setAttribute('aria-label', `${label} — ${leftLabel} to ${rightLabel}`);
    this.dial.setAttribute('aria-valuemin', '0');
    this.dial.setAttribute('aria-valuemax', '100');
    this.dial.title = 'Drag up and down';

    // The filled arc is the affordance: a value you can see at a glance, on a
    // shape that reads as a dial rather than as a ring drawn for decoration.
    const arc = document.createElement('div');
    arc.className = 'knob-arc';
    arc.setAttribute('aria-hidden', 'true');

    const pointer = document.createElement('div');
    pointer.className = 'knob-pointer';
    pointer.setAttribute('aria-hidden', 'true');
    this.dial.append(arc, pointer);

    this.valueEl = document.createElement('span');
    this.valueEl.className = 'knob-value';

    const rangeEl = document.createElement('div');
    rangeEl.className = 'knob-range';
    const left = document.createElement('span');
    left.textContent = leftLabel;
    const right = document.createElement('span');
    right.textContent = rightLabel;
    rangeEl.append(left, right);

    this.element.append(labelEl, this.dial, this.valueEl, rangeEl);
    this.syncDial();

    // Pointer events rather than a mouse pair and a touch pair: one code path
    // for a mouse, a finger and a stylus, and — with capture — a drag that
    // survives the finger sliding off a 44px dial, which on a phone it always
    // does. `touches[0]` used to mean "the first finger anywhere on the
    // screen", so a second finger on the keyboard hijacked the knob.
    this.dial.addEventListener('pointerdown', this.onPointerDown);
    this.dial.addEventListener('pointermove', this.onPointerMove);
    this.dial.addEventListener('pointerup', this.onPointerUp);
    this.dial.addEventListener('pointercancel', this.onPointerUp);
    this.dial.addEventListener('keydown', this.onKeyDown);
  }

  getValue(): number {
    return this.value;
  }

  isDragging(): boolean {
    return this.dragging;
  }

  setValue(v: number): void {
    this.value = Math.max(0, Math.min(1, v));
    this.syncDial();
  }

  private syncDial(): void {
    const percent = Math.round(this.value * 100);
    this.dial.style.setProperty('--knob-turn', this.value.toFixed(4));
    this.dial.setAttribute('aria-valuenow', String(percent));
    this.valueEl.textContent = String(percent);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.dragging) return;
    e.preventDefault();
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.startY = e.clientY;
    this.startValue = this.value;
    try {
      this.dial.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointerdown has no live pointer to capture. The drag
      // still works off the events that follow; it just won't survive the
      // cursor leaving the dial.
    }
    this.dial.classList.add('is-dragging');
    // A pointerdown on a touchscreen does not focus, and the ring is how you
    // see which knob the arrow keys will move next.
    this.dial.focus({ preventScroll: true });
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.applyDelta(this.startY - e.clientY);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
    this.dial.classList.remove('is-dragging');
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const step = e.shiftKey ? KEY_STEP_COARSE : KEY_STEP;
    let next: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = this.value + step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = this.value - step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    if (next === null) return;
    e.preventDefault();
    // Stops here so Play's keybed doesn't hear an arrow as anything, and so
    // the page never scrolls the rail out from under the knob.
    e.stopPropagation();
    this.setValue(next);
    this.onChange(this.value);
  };

  private applyDelta(deltaY: number): void {
    this.setValue(this.startValue + deltaY / DRAG_RANGE_PX);
    this.onChange(this.value);
  }
}
