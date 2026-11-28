import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';

import { PwaUpdateService } from './pwa-update.service';

describe('PwaUpdateService', () => {
  let versionUpdates$: Subject<VersionEvent>;
  let unrecoverable$: Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>;
  let checkForUpdateSpy: ReturnType<typeof vi.fn>;
  let activateUpdateSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    versionUpdates$ = new Subject<VersionEvent>();
    unrecoverable$ = new Subject();
    checkForUpdateSpy = vi.fn(async () => true);
    activateUpdateSpy = vi.fn(async () => true);

    await TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: true,
            versionUpdates: versionUpdates$.asObservable(),
            unrecoverable: unrecoverable$.asObservable(),
            checkForUpdate: checkForUpdateSpy,
            activateUpdate: activateUpdateSpy,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures VERSION_READY appData, handles dismiss, and applies update before reload', async () => {
    const service = TestBed.inject(PwaUpdateService);
    const reloadSpy = vi.fn();
    (service as unknown as { reloadPage: () => void }).reloadPage = reloadSpy;

    const readyEvent: VersionReadyEvent = {
      type: 'VERSION_READY',
      currentVersion: { hash: 'old-hash' },
      latestVersion: {
        hash: 'new-hash',
        appData: {
          version: '0.9.18-beta',
          date: '2026-11-29',
          title: {
            'zh-TW': '新功能上線',
            en: 'New Feature Release',
          },
          changes: {
            'zh-TW': ['測試更新項目'],
            en: ['Test release note item'],
          },
        },
      },
    };

    versionUpdates$.next(readyEvent);
    expect(service.pendingUpdate()?.versionHash).toBe('new-hash');
    expect(service.pendingUpdate()?.note?.version).toBe('0.9.18-beta');
    expect(service.dismissedUpdate()).toBe(false);

    service.dismissPendingUpdate();
    expect(service.dismissedUpdate()).toBe(true);

    const beforeReloadVersions: string[] = [];
    await service.applyUpdate((v) => beforeReloadVersions.push(v));

    expect(beforeReloadVersions).toEqual(['0.9.18-beta']);
    expect(activateUpdateSpy).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('checks for updates when tab returns visible', async () => {
    TestBed.inject(PwaUpdateService);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(checkForUpdateSpy).toHaveBeenCalledTimes(1);
  });
});
