import { Injectable, signal } from '@angular/core';

const CACHE_PREFIX = 'tripilot.swr.';
const FX_RATE_PREFIX = 'tripilot.fxRate.';

/** Lightweight localStorage Stale-While-Revalidate cache for offline read-only viewing and fast cold starts. */
@Injectable({ providedIn: 'root' })
export class OfflineCacheService {
  private readonly offlineSignal = signal<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  readonly isOffline = this.offlineSignal.asReadonly();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.offlineSignal.set(false));
      window.addEventListener('offline', () => this.offlineSignal.set(true));
    }
  }

  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
    } catch {
      // Ignore quota or private-browsing storage errors.
    }
  }

  getFxRate(currency: string): number | null {
    try {
      const raw = localStorage.getItem(`${FX_RATE_PREFIX}${currency.trim().toUpperCase()}`);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  setFxRate(currency: string, rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      return;
    }
    try {
      localStorage.setItem(`${FX_RATE_PREFIX}${currency.trim().toUpperCase()}`, String(rate));
    } catch {
      // Ignore storage access errors.
    }
  }

  /** Clear all cached Tripilot SWR data and FX rates (used on sign-out). */
  clearAll(): void {
    try {
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(CACHE_PREFIX) || k.startsWith(FX_RATE_PREFIX))) {
          keysToDelete.push(k);
        }
      }
      for (const k of keysToDelete) {
        localStorage.removeItem(k);
      }
    } catch {
      // Ignore storage access errors.
    }
  }
}
