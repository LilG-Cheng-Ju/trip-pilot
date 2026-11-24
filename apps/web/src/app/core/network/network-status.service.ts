import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** Tracks browser online/offline connectivity as a reactive Signal. */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly destroyRef = inject(DestroyRef);

  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }
    const handleOnline = (): void => this.isOnline.set(true);
    const handleOffline = (): void => this.isOnline.set(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    });
  }
}
