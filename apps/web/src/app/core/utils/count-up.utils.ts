import { DestroyRef, effect, inject, Signal, signal, untracked } from '@angular/core';

export interface CountUpOptions {
  /** Duration for initial >=20 settle animation (default 520ms). */
  initialDurationMs?: number;
  /** Duration for small integer (<20) initial settle (default 340ms). */
  smallDurationMs?: number;
  /** Duration when morphing between non-null filter states (default 380ms). */
  morphDurationMs?: number;
  /** Starting ratio (0..1) for initial load when target >= 20 (default 0.4). */
  initialFloorRatio?: number;
}

const DEFAULT_INITIAL_DURATION_MS = 520;
const DEFAULT_SMALL_DURATION_MS = 340;
const DEFAULT_MORPH_DURATION_MS = 380;
const DEFAULT_FLOOR_RATIO = 0.4;
const SMALL_THRESHOLD = 20;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function canAnimateRaf(): boolean {
  return (
    !prefersReducedMotion() &&
    typeof requestAnimationFrame === 'function' &&
    typeof cancelAnimationFrame === 'function'
  );
}

/**
 * Derive an eased editorial settle signal from a nullable numeric Signal.
 * Must be called inside an Angular injection context.
 */
export function createAnimatedNumber(
  source: Signal<number | null>,
  options: CountUpOptions = {},
): Signal<number> {
  const destroyRef = inject(DestroyRef);
  const initialDurationMs = options.initialDurationMs ?? DEFAULT_INITIAL_DURATION_MS;
  const smallDurationMs = options.smallDurationMs ?? DEFAULT_SMALL_DURATION_MS;
  const morphDurationMs = options.morphDurationMs ?? DEFAULT_MORPH_DURATION_MS;
  const initialFloorRatio = options.initialFloorRatio ?? DEFAULT_FLOOR_RATIO;

  const display = signal<number>(0);
  let hasSettledInitial = false;
  let rafId: number | null = null;

  const cancelActiveFrame = (): void => {
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  destroyRef.onDestroy(cancelActiveFrame);

  effect(() => {
    const raw = source();
    cancelActiveFrame();

    if (raw === null || !Number.isFinite(raw)) {
      return;
    }

    const target = Math.round(raw);
    if (!canAnimateRaf()) {
      hasSettledInitial = true;
      display.set(target);
      return;
    }

    let from: number;
    let duration: number;

    if (!hasSettledInitial) {
      hasSettledInitial = true;
      if (target <= 1) {
        display.set(target);
        return;
      }
      if (target < SMALL_THRESHOLD) {
        from = 0;
        duration = smallDurationMs;
      } else {
        from = Math.floor(target * initialFloorRatio);
        duration = initialDurationMs;
      }
    } else {
      from = untracked(() => display());
      if (from === target) {
        return;
      }
      duration = morphDurationMs;
    }

    display.set(from);
    let startTime: number | null = null;

    const tick = (now: number): void => {
      if (startTime === null) {
        startTime = now;
      }
      const progress = duration <= 0 ? 1 : Math.min(1, (now - startTime) / duration);
      // Quartic ease-out lands softly without robotic bounce.
      const eased = 1 - Math.pow(1 - progress, 4);
      display.set(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        display.set(target);
        rafId = null;
      }
    };

    rafId = requestAnimationFrame(tick);
  });

  return display.asReadonly();
}
