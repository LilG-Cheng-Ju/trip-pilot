import { TestBed } from '@angular/core/testing';

import { ViewportService } from './viewport.service';

describe('ViewportService', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('tracks desktop breakpoint changes via matchMedia', () => {
    const listeners: Array<(event: MediaQueryListEvent) => void> = [];
    const mockMql = {
      matches: false,
      media: '(min-width: 1024px)',
      addEventListener: (_event: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.push(cb);
      },
      removeEventListener: (_event: string, cb: (e: MediaQueryListEvent) => void) => {
        const idx = listeners.indexOf(cb);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mockMql,
    });

    TestBed.configureTestingModule({});
    const service = TestBed.inject(ViewportService);
    expect(service.isDesktop()).toBe(false);

    listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    expect(service.isDesktop()).toBe(true);
  });
});
