import { Signal } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { OfflineCacheService } from '../../core/cache/offline-cache.service';
import { TripDetail, TripShare } from '../../core/models/tripilot.models';
import { MapRouteMode } from '../../core/utils/travel-format.utils';

export interface ItineraryState {
  trip: TripDetail | null;
  shares: TripShare[];
  selectedDayIndex: number;
  // Tracks which Plan A/B option is being previewed without mutating active_option_id.
  previewOptionByDay: Record<string, string>;
  selectedItemId: string | null;
  mobileMapOpen: boolean;
  mapRouteMode: MapRouteMode;
  loading: boolean;
  syncing: boolean;
  usingOfflineCache: boolean;
  error: string | null;
}

export const initialItineraryState: ItineraryState = {
  trip: null,
  shares: [],
  selectedDayIndex: 1,
  previewOptionByDay: {},
  selectedItemId: null,
  mobileMapOpen: false,
  mapRouteMode: 'schematic',
  loading: false,
  syncing: false,
  usingOfflineCache: false,
  error: null,
};

export interface ItineraryRuntime {
  loadTripSeq: number;
  dayTouchedDuringLoad: boolean;
  mutationSeq: number;
  recalculatedOptionIds: Set<string>;
}

export function createItineraryRuntime(): ItineraryRuntime {
  return {
    loadTripSeq: 0,
    dayTouchedDuringLoad: false,
    mutationSeq: 0,
    recalculatedOptionIds: new Set<string>(),
  };
}

export function commitTripState(
  store: WritableStateSource<ItineraryState>,
  cache: OfflineCacheService,
  nextTrip: TripDetail,
): void {
  cache.set(`trip.${nextTrip.id}`, nextTrip);
  patchState(store, { trip: nextTrip, error: null });
}

export function recordItineraryError(
  store: WritableStateSource<ItineraryState>,
  err: unknown,
  fallback: string,
): void {
  patchState(store, {
    error: err instanceof Error ? err.message : fallback,
  });
}

export async function refreshTripSilently(
  store: WritableStateSource<ItineraryState> & { trip: Signal<TripDetail | null> },
  api: TripilotApiService,
  cache: OfflineCacheService,
  runtime: ItineraryRuntime,
  tripId: string,
): Promise<void> {
  const seq = ++runtime.loadTripSeq;
  const mutSeq = runtime.mutationSeq;
  try {
    const fresh = await api.getTrip(tripId);
    if (
      seq === runtime.loadTripSeq &&
      mutSeq === runtime.mutationSeq &&
      store.trip()?.id === tripId
    ) {
      commitTripState(store, cache, fresh);
    }
  } catch {
    // Keep in-place optimistic state when background route sync fails.
  }
}
