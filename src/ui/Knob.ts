export class Knob {
  readonly element: HTMLDivElement;
  private readonly dial: HTMLDivElement;
  private readonly valueEl: HTMLSpanElement;
  private value: number;
  private dragging = false;
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

    this.dial = document.createElement('div');
    this.dial.className = 'knob-dial';
    this.dial.setAttribute('aria-hidden', 'true');
    this.updateDialRotation();

    this.valueEl = document.createElement('span');
    this.valueEl.className = 'knob-value';
    this.valueEl.textContent = Math.round(initial * 100).toString();

    const rangeEl = document.createElement('div');
    rangeEl.className = 'knob-range';
    rangeEl.innerHTML = `<span>${leftLabel}</span><span>${rightLabel}</span>`;

    this.element.append(labelEl, this.dial, this.valueEl, rangeEl);

    this.dial.addEventListener('mousedown', this.onMouseDown);
    this.dial.addEventListener('touchstart', this.onTouchStart, { passive: false });
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd);
  }

  getValue(): number {
    return this.value;
  }

  isDragging(): boolean {
    return this.dragging;
  }

  setValue(v: number): void {
    this.value = Math.max(0, Math.min(1, v));
    this.updateDialRotation();
    this.valueEl.textContent = Math.round(this.value * 100).toString();
  }

  private updateDialRotation(): void {
    const deg = -135 + this.value * 270;
    this.dial.style.transform = `rotate(${deg}deg)`;
  }

  private onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    this.dragging = true;
    this.startY = e.clientY;
    this.startValue = this.value;
  };

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    this.dragging = true;
    this.startY = e.touches[0]!.clientY;
    this.startValue = this.value;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.dragging) return;
    this.applyDelta(this.startY - e.clientY);
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.dragging) return;
    this.applyDelta(this.startY - e.touches[0]!.clientY);
  };

  private onMouseUp = (): void => {
    this.dragging = false;
  };

  private onTouchEnd = (): void => {
    this.dragging = false;
  };

  private applyDelta(deltaY: number): void {
    this.setValue(this.startValue + deltaY * 0.005);
    this.onChange(this.value);
  }
}
