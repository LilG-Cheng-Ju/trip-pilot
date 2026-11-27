import { computed, inject, Injectable, isDevMode, signal } from '@angular/core';

import { NetworkStatusService } from './network-status.service';

export const WAKE_SHOW_DELAY_MS = 450;
export const WAKE_MIN_DISPLAY_MS = 650;
export const COLD_IDLE_THRESHOLD_MS = 10 * 60 * 1000;

/** Tracks slow backend cold starts so the UI locks actions until the server responds. */
@Injectable({ providedIn: 'root' })
export class BackendWakeService {
  private readonly network = inject(NetworkStatusService);

  private readonly wakingState = signal(false);
  private readonly previewMode = signal(false);

  readonly isWaking = computed(() => this.wakingState() || this.previewMode());
  readonly isPreviewMode = this.previewMode.asReadonly();

  private inflightCount = 0;
  private lastResponseAt: number | null = null;
  private shownAt: number | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (isDevMode() && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('previewWake') === '1') {
        this.previewMode.set(true);
      }
    }
  }

  /** Arm the delayed wake overlay when an online API request hits a potentially cold server. */
  beginRequest(): void {
    if (!this.network.isOnline()) {
      return;
    }

    this.inflightCount += 1;

    const isPotentiallyCold =
      this.lastResponseAt === null || Date.now() - this.lastResponseAt > COLD_IDLE_THRESHOLD_MS;
    if (!isPotentiallyCold) {
      return;
    }

    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    if (!this.wakingState() && this.showTimer === null) {
      this.showTimer = setTimeout(() => {
        this.showTimer = null;
        if (this.inflightCount > 0 && this.network.isOnline()) {
          this.shownAt = Date.now();
          this.wakingState.set(true);
        }
      }, WAKE_SHOW_DELAY_MS);
    }
  }

  /** Record request completion and release the wake lock after any minimum display window. */
  endRequest(backendResponded: boolean): void {
    this.inflightCount = Math.max(0, this.inflightCount - 1);

    if (backendResponded) {
      this.lastResponseAt = Date.now();
    }

    if (backendResponded || this.inflightCount === 0) {
      if (this.showTimer !== null) {
        clearTimeout(this.showTimer);
        this.showTimer = null;
      }

      if (this.wakingState()) {
        const elapsed = this.shownAt !== null ? Date.now() - this.shownAt : WAKE_MIN_DISPLAY_MS;
        const remaining = Math.max(0, WAKE_MIN_DISPLAY_MS - elapsed);

        if (this.hideTimer !== null) {
          clearTimeout(this.hideTimer);
          this.hideTimer = null;
        }

        if (remaining === 0) {
          this.wakingState.set(false);
          this.shownAt = null;
        } else {
          this.hideTimer = setTimeout(() => {
            this.hideTimer = null;
            this.wakingState.set(false);
            this.shownAt = null;
          }, remaining);
        }
      }
    }
  }

  setPreviewMode(enabled: boolean): void {
    this.previewMode.set(enabled);
  }

  dismissPreview(): void {
    this.previewMode.set(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('previewWake')) {
        url.searchParams.delete('previewWake');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }

  /** Clear timers and internal wake tracking state (used in tests or session resets). */
  reset(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.inflightCount = 0;
    this.lastResponseAt = null;
    this.shownAt = null;
    this.wakingState.set(false);
    this.previewMode.set(false);
  }
}
