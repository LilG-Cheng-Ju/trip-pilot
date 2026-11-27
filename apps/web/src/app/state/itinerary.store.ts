import { inject } from '@angular/core';
import { patchState, signalStore, withMethods } from '@ngrx/signals';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import { OfflineCacheService } from '../core/cache/offline-cache.service';
import { TripDetail } from '../core/models/tripilot.models';
import { MapRouteMode } from '../core/utils/travel-format.utils';
import { resolveInitialDayIndex } from '../core/utils/trip-context.utils';
import { withItineraryBase } from './itinerary/itinerary-base.feature';
import { withItineraryItems } from './itinerary/itinerary-items.feature';
import { withItineraryOptions } from './itinerary/itinerary-options.feature';
import { withItineraryShares } from './itinerary/itinerary-shares.feature';
import { commitTripState, initialItineraryState } from './itinerary/itinerary.state';

/** SignalStore managing active trip itinerary, Plan A/B switching, and map sync. */
export const ItineraryStore = signalStore(
  { providedIn: 'root' },
  withItineraryBase(),
  withMethods(
    (
      store,
      api = inject(TripilotApiService),
      cache = inject(OfflineCacheService),
    ) => ({
      clearError(): void {
        patchState(store, { error: null });
      },

      selectDay(dayIndex: number): void {
        store._runtime.dayTouchedDuringLoad = true;
        patchState(store, { selectedDayIndex: dayIndex, selectedItemId: null });
      },

      previewOption(dayId: string, optionId: string): void {
        patchState(store, {
          previewOptionByDay: {
            ...store.previewOptionByDay(),
            [dayId]: optionId,
          },
          selectedItemId: null,
        });
      },

      selectItem(itemId: string | null): void {
        patchState(store, { selectedItemId: itemId });
      },

      setMobileMapOpen(mobileMapOpen: boolean): void {
        patchState(store, { mobileMapOpen });
      },

      toggleMobileMap(): void {
        patchState(store, { mobileMapOpen: !store.mobileMapOpen() });
      },

      setMapRouteMode(mapRouteMode: MapRouteMode): void {
        patchState(store, { mapRouteMode });
      },

      async ensureOptionRoadRoutes(
        optionId: string,
        expectedPairs: readonly string[],
      ): Promise<void> {
        if (
          !optionId ||
          expectedPairs.length === 0 ||
          store.usingOfflineCache() ||
          store._runtime.recalculatedOptionIds.has(optionId)
        ) {
          return;
        }
        const trip = store.trip();
        if (!trip) {
          return;
        }
        let targetOption: TripDetail['days'][number]['options'][number] | undefined;
        for (const day of trip.days) {
          targetOption = day.options.find((opt) => opt.id === optionId);
          if (targetOption) break;
        }
        if (!targetOption) {
          return;
        }

        const cachedPairs = new Set(
          targetOption.route_segments.map((s) => `${s.from_item_id}->${s.to_item_id}`),
        );
        if (expectedPairs.every((pair) => cachedPairs.has(pair))) {
          return;
        }

        store._runtime.recalculatedOptionIds.add(optionId);
        try {
          const updatedOption = await api.recalculateOptionRoute(optionId);
          const latest = store.trip();
          if (!latest || latest.id !== trip.id) {
            return;
          }
          const mergedTrip: TripDetail = {
            ...latest,
            days: latest.days.map((day) => ({
              ...day,
              options: day.options.map((opt) =>
                opt.id === updatedOption.id ? updatedOption : opt,
              ),
            })),
          };
          commitTripState(store, cache, mergedTrip);
        } catch {
          // Keep client-side fallback polylines if background OSRM backfill fails.
        }
      },

      async loadTrip(tripId: string): Promise<void> {
        const seq = ++store._runtime.loadTripSeq;
        const isSameTrip = store.trip()?.id === tripId;
        store._runtime.dayTouchedDuringLoad = false;
        if (!isSameTrip) {
          store._runtime.recalculatedOptionIds.clear();
        }
        const cached = cache.get<TripDetail>(`trip.${tripId}`);

        if (!isSameTrip && cached) {
          patchState(store, {
            trip: cached,
            selectedDayIndex: resolveInitialDayIndex(cached.days),
            loading: false,
            syncing: true,
            usingOfflineCache: false,
            error: null,
          });
        } else {
          patchState(store, {
            loading: !isSameTrip,
            syncing: isSameTrip,
            usingOfflineCache: false,
            error: null,
          });
        }

        try {
          const trip = await api.getTrip(tripId);
          if (seq !== store._runtime.loadTripSeq) return;
          cache.set(`trip.${tripId}`, trip);
          const currentDayIdx = store.selectedDayIndex();
          const preserveSelection =
            (isSameTrip || store._runtime.dayTouchedDuringLoad) &&
            trip.days.some((d) => d.day_index === currentDayIdx);
          const validDayIdx = preserveSelection
            ? currentDayIdx
            : resolveInitialDayIndex(trip.days);
          patchState(store, {
            trip,
            selectedDayIndex: validDayIdx,
            loading: false,
            syncing: false,
            usingOfflineCache: false,
          });
        } catch (err) {
          if (seq !== store._runtime.loadTripSeq) return;
          const fallbackReady = store.trip()?.id === tripId;
          patchState(store, {
            loading: false,
            syncing: false,
            usingOfflineCache: fallbackReady,
            error: fallbackReady
              ? null
              : err instanceof Error
                ? err.message
                : 'Failed to load itinerary',
          });
        }
      },

      applyTripUpdate(updated: TripDetail): void {
        if (store.trip()?.id !== updated.id) {
          return;
        }
        const nextSelectedDayIndex = Math.max(
          1,
          Math.min(store.selectedDayIndex(), Math.max(1, updated.days.length)),
        );
        cache.set(`trip.${updated.id}`, updated);
        patchState(store, {
          trip: updated,
          selectedDayIndex: nextSelectedDayIndex,
          error: null,
        });
      },

      reset(): void {
        store._runtime.loadTripSeq += 1;
        store._runtime.mutationSeq += 1;
        store._runtime.dayTouchedDuringLoad = false;
        store._runtime.recalculatedOptionIds.clear();
        patchState(store, initialItineraryState);
      },
    }),
  ),
  withItineraryOptions(),
  withItineraryItems(),
  withItineraryShares(),
);
