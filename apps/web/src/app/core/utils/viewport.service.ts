import { DestroyRef, Injectable, inject, signal } from '@angular/core';

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

/** Tracks the desktop split-pane breakpoint so mobile never mounts hidden WebGL maps. */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly destroyRef = inject(DestroyRef);
  readonly isDesktop = signal<boolean>(this.readInitialDesktop());

  constructor() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      this.isDesktop.set(event.matches);
    };
    mediaQuery.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => {
      mediaQuery.removeEventListener('change', onChange);
    });
  }

  private readInitialDesktop(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
  }
}
