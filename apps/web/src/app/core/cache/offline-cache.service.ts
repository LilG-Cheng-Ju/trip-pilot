import { Injectable, signal } from '@angular/core';

const CACHE_PREFIX = 'tripilot.swr.';

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
}
