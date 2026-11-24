import { inject, Injectable } from '@angular/core';

import { TripilotApiService } from '../api/tripilot-api.service';
import { ISO_CURRENCY_CODE_LENGTH } from '../constants/app-limits';
import { NetworkStatusService } from '../network/network-status.service';
import { roundFxRate } from '../utils/travel-format.utils';

export type FxResolutionStatus = 'same' | 'live' | 'cached' | 'manual_required';

export interface FxRateResolution {
  status: FxResolutionStatus;
  rate: number | null;
  manualRequired: boolean;
  cachedAt?: number;
}

interface CachedFxEntry {
  rate: number;
  updatedAt: number;
}

// Uses the tripilot.fxRate. prefix so OfflineCacheService.clearAll() wipes it on sign-out.
const FX_CACHE_STORAGE_KEY = 'tripilot.fxRate.pairs';

/** Resolves cross-currency FX rates with local caching and explicit manual-entry detection. */
@Injectable({ providedIn: 'root' })
export class FxRateResolverService {
  private readonly api = inject(TripilotApiService);
  private readonly networkStatus = inject(NetworkStatusService);

  async resolve(fromCurrency: string, toCurrency: string): Promise<FxRateResolution> {
    const src = fromCurrency.trim().toUpperCase();
    const dst = toCurrency.trim().toUpperCase();
    if (
      src.length !== ISO_CURRENCY_CODE_LENGTH ||
      dst.length !== ISO_CURRENCY_CODE_LENGTH
    ) {
      return { status: 'manual_required', rate: null, manualRequired: true };
    }
    if (src === dst) {
      return { status: 'same', rate: 1, manualRequired: false };
    }

    if (this.networkStatus.isOnline()) {
      try {
        const res = await this.api.getExchangeRate(src, dst);
        const isBackendPlaceholder = res?.source === 'fallback' && res?.rate === 1;
        if (
          res &&
          typeof res.rate === 'number' &&
          Number.isFinite(res.rate) &&
          res.rate > 0 &&
          !isBackendPlaceholder
        ) {
          const rounded = roundFxRate(res.rate);
          this.cacheRate(src, dst, rounded);
          return { status: 'live', rate: rounded, manualRequired: false };
        }
      } catch {
        // Fall through to cached rate or explicit manual entry when live lookup fails.
      }
    }

    const cached = this.readCachedEntry(src, dst);
    if (cached) {
      return {
        status: 'cached',
        rate: cached.rate,
        manualRequired: false,
        cachedAt: cached.updatedAt,
      };
    }
    return { status: 'manual_required', rate: null, manualRequired: true };
  }

  getCachedRate(fromCurrency: string, toCurrency: string): number | null {
    const src = fromCurrency.trim().toUpperCase();
    const dst = toCurrency.trim().toUpperCase();
    if (!src || !dst) {
      return null;
    }
    if (src === dst) {
      return 1;
    }
    return this.readCachedEntry(src, dst)?.rate ?? null;
  }

  cacheRate(fromCurrency: string, toCurrency: string, rate: number): void {
    const src = fromCurrency.trim().toUpperCase();
    const dst = toCurrency.trim().toUpperCase();
    if (
      src.length !== ISO_CURRENCY_CODE_LENGTH ||
      dst.length !== ISO_CURRENCY_CODE_LENGTH ||
      src === dst ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      return;
    }
    const map = this.readCacheMap();
    map[this.pairKey(src, dst)] = {
      rate: roundFxRate(rate),
      updatedAt: Date.now(),
    };
    this.writeCacheMap(map);
  }

  private pairKey(src: string, dst: string): string {
    return `${src}->${dst}`;
  }

  private readCachedEntry(src: string, dst: string): CachedFxEntry | null {
    const entry = this.readCacheMap()[this.pairKey(src, dst)];
    if (
      !entry ||
      typeof entry.rate !== 'number' ||
      !Number.isFinite(entry.rate) ||
      entry.rate <= 0
    ) {
      return null;
    }
    return {
      rate: roundFxRate(entry.rate),
      updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
    };
  }

  private readCacheMap(): Record<string, CachedFxEntry> {
    try {
      const raw = localStorage.getItem(FX_CACHE_STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, CachedFxEntry>) : {};
    } catch {
      return {};
    }
  }

  private writeCacheMap(map: Record<string, CachedFxEntry>): void {
    try {
      localStorage.setItem(FX_CACHE_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore storage quota or private-browsing errors.
    }
  }
}
