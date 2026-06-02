/**
 * Dev-only health-check harness. Toggle with the `D` key. Tracks frame rate,
 * audio-context health, limiter pinning, console errors, and heap growth, then
 * prints a PASS/FAIL summary on disable. This is the objective "smooth
 * experience" gate described in the implementation plan.
 */
export interface FrameInfo {
  audioRunning: boolean;
  /** Overall output level (0–1); sustained ~1 indicates limiter pinning. */
  level: number;
  phase: string;
}

interface MemorySample {
  t: number;
  heapMB: number;
}

const HITCH_MS = 33; // > ~2 frames at 60fps
const PIN_LEVEL = 0.98;

export class PerfMonitor {
  private enabled = false;
  private readout: HTMLDivElement | null = null;

  private frameTimes: number[] = [];
  private droppedFrames = 0;
  private worstFrameMs = 0;
  private startTime = 0;

  private contextDrops = 0;
  private wasRunning = true;
  private pinFrames = 0;

  private errorCount = 0;
  private warnCount = 0;
  private readonly memory: MemorySample[] = [];
  private lastMemSample = 0;

  private origError: typeof console.error | null = null;
  private origWarn: typeof console.warn | null = null;
  private readonly onError = (): void => {
    this.errorCount++;
  };
  private readonly onRejection = (): void => {
    this.errorCount++;
  };

  toggle(): void {
    if (this.enabled) this.disable();
    else this.enable();
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.reset();

    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onRejection);
    this.origError = console.error;
    this.origWarn = console.warn;
    console.error = (...args: unknown[]) => {
      this.errorCount++;
      this.origError?.(...args);
    };
    console.warn = (...args: unknown[]) => {
      this.warnCount++;
      this.origWarn?.(...args);
    };

    this.readout = document.createElement('div');
    this.readout.className = 'perf-monitor';
    document.body.appendChild(this.readout);
    // eslint-disable-next-line no-console
    console.info('[PerfMonitor] enabled — press D again for the report.');
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onRejection);
    if (this.origError) console.error = this.origError;
    if (this.origWarn) console.warn = this.origWarn;
    this.origError = null;
    this.origWarn = null;

    this.report();
    this.readout?.remove();
    this.readout = null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  frame(dtMs: number, info: FrameInfo): void {
    if (!this.enabled) return;
    const now = performance.now();

    this.frameTimes.push(dtMs);
    if (this.frameTimes.length > 3600) this.frameTimes.shift();
    if (dtMs > HITCH_MS) this.droppedFrames++;
    if (dtMs > this.worstFrameMs) this.worstFrameMs = dtMs;

    if (!info.audioRunning && this.wasRunning) this.contextDrops++;
    this.wasRunning = info.audioRunning;
    if (info.level >= PIN_LEVEL) this.pinFrames++;

    if (now - this.lastMemSample > 30000) {
      this.lastMemSample = now;
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      if (mem) {
        this.memory.push({ t: (now - this.startTime) / 1000, heapMB: mem.usedJSHeapSize / 1048576 });
      }
    }

    if (this.readout && this.frameTimes.length % 10 === 0) {
      const fps = this.medianFps();
      this.readout.textContent =
        `FPS ${fps.toFixed(0)} · drop ${this.droppedFrames} · ` +
        `worst ${this.worstFrameMs.toFixed(0)}ms · ${info.phase}`;
    }
  }

  private reset(): void {
    this.frameTimes = [];
    this.droppedFrames = 0;
    this.worstFrameMs = 0;
    this.startTime = performance.now();
    this.lastMemSample = this.startTime;
    this.contextDrops = 0;
    this.wasRunning = true;
    this.pinFrames = 0;
    this.errorCount = 0;
    this.warnCount = 0;
    this.memory.length = 0;
  }

  private medianFps(): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)]!;
    return mid > 0 ? 1000 / mid : 0;
  }

  private lowFps(): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => b - a);
    const idx = Math.floor(sorted.length * 0.01);
    const worst = sorted[idx]!;
    return worst > 0 ? 1000 / worst : 0;
  }

  private report(): void {
    const median = this.medianFps();
    const low = this.lowFps();
    const heapClimb =
      this.memory.length >= 2
        ? this.memory[this.memory.length - 1]!.heapMB - this.memory[0]!.heapMB
        : 0;

    const checks: Array<[string, boolean, string]> = [
      ['Frame rate', median >= 58 && low >= 50 && this.droppedFrames === 0,
        `median ${median.toFixed(1)}fps, 1%-low ${low.toFixed(1)}fps, ${this.droppedFrames} drops, worst ${this.worstFrameMs.toFixed(0)}ms`],
      ['Audio glitch', this.contextDrops === 0 && this.pinFrames < 30,
        `${this.contextDrops} context drops, ${this.pinFrames} limiter-pin frames`],
      ['Console errors', this.errorCount === 0 && this.warnCount === 0,
        `${this.errorCount} errors, ${this.warnCount} warnings`],
      ['Memory', Math.abs(heapClimb) < 50,
        `heap drift ${heapClimb.toFixed(1)}MB over ${this.memory.length} samples`],
    ];

    const allPass = checks.every(([, ok]) => ok);
    /* eslint-disable no-console */
    console.info('───── PerfMonitor report ─────');
    for (const [name, ok, detail] of checks) {
      console.info(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} ${detail}`);
    }
    console.info(`Overall: ${allPass ? 'PASS ✅' : 'FAIL ❌'}`);
    console.info('──────────────────────────────');
    /* eslint-enable no-console */
  }
}
