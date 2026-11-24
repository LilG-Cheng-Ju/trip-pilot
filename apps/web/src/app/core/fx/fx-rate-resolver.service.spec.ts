import { TestBed } from '@angular/core/testing';

import { TripilotApiService } from '../api/tripilot-api.service';
import { OfflineCacheService } from '../cache/offline-cache.service';
import { FxRateResponse } from '../models/tripilot.models';
import { NetworkStatusService } from '../network/network-status.service';
import { FxRateResolverService } from './fx-rate-resolver.service';

describe('FxRateResolverService', () => {
  let service: FxRateResolverService;
  let network: NetworkStatusService;
  let getExchangeRateImpl: (from: string, to: string) => Promise<FxRateResponse>;

  beforeEach(() => {
    localStorage.clear();
    getExchangeRateImpl = async () => ({
      from_currency: 'JPY',
      to_currency: 'TWD',
      rate: 0.2154,
      source: 'open_er_api',
      cached: false,
    });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: TripilotApiService,
          useValue: {
            getExchangeRate: (from: string, to: string) => getExchangeRateImpl(from, to),
          },
        },
      ],
    });
    service = TestBed.inject(FxRateResolverService);
    network = TestBed.inject(NetworkStatusService);
    network.isOnline.set(true);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns rate 1 with status same when currencies match', async () => {
    const result = await service.resolve('twd', 'TWD');
    expect(result).toEqual({ status: 'same', rate: 1, manualRequired: false });
  });

  it('fetches live cross-currency rate, caches it with timestamp, and returns status live', async () => {
    const result = await service.resolve('jpy', 'twd');
    expect(result).toEqual({ status: 'live', rate: 0.2154, manualRequired: false });
    expect(service.getCachedRate('JPY', 'TWD')).toBe(0.2154);

    // Cached entry should also be cleared on sign-out via OfflineCacheService.clearAll().
    TestBed.inject(OfflineCacheService).clearAll();
    expect(service.getCachedRate('JPY', 'TWD')).toBeNull();
  });

  it('falls back to cached rate on network error without overwriting with 1.0', async () => {
    service.cacheRate('JPY', 'TWD', 0.213);
    getExchangeRateImpl = async () => {
      throw new Error('Network offline');
    };

    const result = await service.resolve('JPY', 'TWD');
    expect(result.status).toBe('cached');
    expect(result.rate).toBe(0.213);
    expect(result.manualRequired).toBe(false);
    expect(typeof result.cachedAt).toBe('number');
  });

  it('requires manual entry instead of returning 1.0 when offline or response is invalid without cache', async () => {
    network.isOnline.set(false);
    const offlineResult = await service.resolve('JPY', 'TWD');
    expect(offlineResult).toEqual({
      status: 'manual_required',
      rate: null,
      manualRequired: true,
    });

    network.isOnline.set(true);
    getExchangeRateImpl = async () => ({
      from_currency: 'THB',
      to_currency: 'TWD',
      rate: 1,
      source: 'fallback',
      cached: false,
    });
    const fallbackOneResult = await service.resolve('THB', 'TWD');
    expect(fallbackOneResult).toEqual({
      status: 'manual_required',
      rate: null,
      manualRequired: true,
    });

    getExchangeRateImpl = async () => ({
      from_currency: 'EUR',
      to_currency: 'TWD',
      rate: 0,
      source: 'open_er_api',
      cached: false,
    });
    const zeroRateResult = await service.resolve('EUR', 'TWD');
    expect(zeroRateResult).toEqual({
      status: 'manual_required',
      rate: null,
      manualRequired: true,
    });
  });
});
