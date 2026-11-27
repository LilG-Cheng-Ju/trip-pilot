import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { pickNextWakeIndex } from '../../shared/backend-wake-messages';
import {
  BackendWakeService,
  COLD_IDLE_THRESHOLD_MS,
  WAKE_MIN_DISPLAY_MS,
  WAKE_SHOW_DELAY_MS,
} from './backend-wake.service';
import { NetworkStatusService } from './network-status.service';

describe('BackendWakeService', () => {
  let service: BackendWakeService;
  let onlineSignal: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    vi.useFakeTimers();
    onlineSignal = signal(true);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NetworkStatusService,
          useValue: { isOnline: onlineSignal },
        },
      ],
    });
    service = TestBed.inject(BackendWakeService);
    service.reset();
  });

  afterEach(() => {
    service.reset();
    vi.useRealTimers();
  });

  it('never shows the wake overlay for fast API responses under 450ms', () => {
    service.beginRequest();
    vi.advanceTimersByTime(WAKE_SHOW_DELAY_MS - 50);
    expect(service.isWaking()).toBe(false);

    service.endRequest(true);
    vi.advanceTimersByTime(500);
    expect(service.isWaking()).toBe(false);
  });

  it('shows the wake overlay after 450ms and holds it briefly to prevent flicker', () => {
    service.beginRequest();
    vi.advanceTimersByTime(WAKE_SHOW_DELAY_MS);
    expect(service.isWaking()).toBe(true);

    vi.advanceTimersByTime(150);
    service.endRequest(true);
    expect(service.isWaking()).toBe(true);

    vi.advanceTimersByTime(WAKE_MIN_DISPLAY_MS - 150);
    expect(service.isWaking()).toBe(false);
  });

  it('does not trigger while offline', () => {
    onlineSignal.set(false);
    service.beginRequest();
    vi.advanceTimersByTime(WAKE_SHOW_DELAY_MS + 100);
    expect(service.isWaking()).toBe(false);
  });

  it('skips wake overlay on warm requests and re-arms after idle threshold', () => {
    service.beginRequest();
    service.endRequest(true);

    // Warm follow-up request stays quiet even if it takes > 450ms.
    service.beginRequest();
    vi.advanceTimersByTime(WAKE_SHOW_DELAY_MS + 200);
    expect(service.isWaking()).toBe(false);
    service.endRequest(true);

    // After > 10 minutes idle, a slow request wakes the overlay again.
    vi.advanceTimersByTime(COLD_IDLE_THRESHOLD_MS + 1000);
    service.beginRequest();
    vi.advanceTimersByTime(WAKE_SHOW_DELAY_MS);
    expect(service.isWaking()).toBe(true);
  });

  it('picks a different next wake message index when multiple messages exist', () => {
    for (let current = 0; current < 5; current += 1) {
      const next = pickNextWakeIndex(5, current, () => 0);
      expect(next).not.toBe(current);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(5);
    }
  });
});
