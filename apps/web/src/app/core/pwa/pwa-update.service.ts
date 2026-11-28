import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

import { ReleaseNoteEntry } from '../config/release-notes.generated';

export interface PendingAppUpdate {
  readonly versionHash: string;
  readonly note: ReleaseNoteEntry | null;
}

const INITIAL_CHECK_DELAY_MS = 1500;
const CHECK_THROTTLE_MS = 60_000;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isLocalizedPair(value: unknown): value is { 'zh-TW': string; en: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['zh-TW'] === 'string' && typeof record['en'] === 'string';
}

function isLocalizedChangesPair(
  value: unknown,
): value is { 'zh-TW': string[]; en: string[] } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return isStringArray(record['zh-TW']) && isStringArray(record['en']);
}

/** Validate ngsw-config appData payload embedded with a new Service Worker version. */
export function parseReleaseNoteFromAppData(appData: unknown): ReleaseNoteEntry | null {
  if (!appData || typeof appData !== 'object') {
    return null;
  }
  const record = appData as Record<string, unknown>;
  if (
    typeof record['version'] !== 'string' ||
    !isLocalizedPair(record['title']) ||
    !isLocalizedChangesPair(record['changes'])
  ) {
    return null;
  }
  return {
    version: record['version'],
    date: typeof record['date'] === 'string' ? record['date'] : '',
    title: record['title'],
    changes: record['changes'],
  };
}

/** Proactive PWA update checker that surfaces newly downloaded builds without blocking UX. */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly pendingUpdate = signal<PendingAppUpdate | null>(null);
  readonly applying = signal(false);
  readonly dismissedUpdate = signal(false);

  private lastCheckAt = 0;

  constructor() {
    if (!this.swUpdate?.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((evt) => {
        this.pendingUpdate.set({
          versionHash: evt.latestVersion.hash,
          note: parseReleaseNoteFromAppData(evt.latestVersion.appData),
        });
        this.dismissedUpdate.set(false);
      });

    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.reloadPage();
      });

    const initialTimer = setTimeout(() => {
      void this.checkForUpdate();
    }, INITIAL_CHECK_DELAY_MS);

    const onVisibilityChange = (): void => {
      if (this.document.visibilityState === 'visible') {
        void this.checkForUpdate();
      }
    };
    const onOnline = (): void => {
      void this.checkForUpdate();
    };

    this.document.addEventListener('visibilitychange', onVisibilityChange);
    const win = this.document.defaultView;
    win?.addEventListener('online', onOnline);

    this.destroyRef.onDestroy(() => {
      clearTimeout(initialTimer);
      this.document.removeEventListener('visibilitychange', onVisibilityChange);
      win?.removeEventListener('online', onOnline);
    });
  }

  /** Ask the browser's active Service Worker to check ngsw.json, throttled to avoid spam. */
  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate?.isEnabled) {
      return false;
    }
    const now = Date.now();
    if (this.lastCheckAt > 0 && now - this.lastCheckAt < CHECK_THROTTLE_MS) {
      return false;
    }
    this.lastCheckAt = now;
    try {
      return await this.swUpdate.checkForUpdate();
    } catch {
      return false;
    }
  }

  dismissPendingUpdate(): void {
    this.dismissedUpdate.set(true);
  }

  async applyUpdate(onBeforeReload?: (version: string) => void): Promise<void> {
    if (this.applying()) {
      return;
    }
    this.applying.set(true);
    const nextVersion = this.pendingUpdate()?.note?.version;
    if (nextVersion && onBeforeReload) {
      onBeforeReload(nextVersion);
    }
    try {
      if (this.swUpdate?.isEnabled) {
        await this.swUpdate.activateUpdate();
      }
    } finally {
      this.reloadPage();
    }
  }

  protected reloadPage(): void {
    this.document.location.reload();
  }
}
