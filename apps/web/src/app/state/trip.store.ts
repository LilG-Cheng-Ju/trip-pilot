import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { CreateTripPayload, TripilotApiService } from '../core/api/tripilot-api.service';
import { OfflineCacheService } from '../core/cache/offline-cache.service';
import { TripStatus, TripSummary } from '../core/models/tripilot.models';

export type TripListTab = 'upcoming' | 'completed';

interface TripState {
  trips: TripSummary[];
  activeTab: TripListTab;
  lastSelectedTripId: string | null;
  loading: boolean;
  syncing: boolean;
  usingOfflineCache: boolean;
  error: string | null;
}

const initialState: TripState = {
  trips: [],
  activeTab: 'upcoming',
  lastSelectedTripId: null,
  loading: false,
  syncing: false,
  usingOfflineCache: false,
  error: null,
};

/** SignalStore managing the multi-trip overview, filtering, and archiving. */
export const TripStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    filteredTrips: computed(() => {
      const tab = store.activeTab();
      const all = store.trips();
      if (tab === 'upcoming') {
        return all
          .filter((t) => t.status === 'PLANNING' || t.status === 'ACTIVE')
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
      }
      return all
        .filter((t) => t.status === 'COMPLETED' || t.status === 'ARCHIVED')
        .sort((a, b) => b.start_date.localeCompare(a.start_date));
    }),
  })),
  withMethods(
    (
      store,
      api = inject(TripilotApiService),
      cache = inject(OfflineCacheService),
    ) => {
      let loadTripsSeq = 0;

      return {
        setTab(activeTab: TripListTab): void {
          patchState(store, { activeTab });
        },

        setLastSelectedTripId(tripId: string): void {
          patchState(store, { lastSelectedTripId: tripId });
        },

        async loadTrips(): Promise<void> {
          const seq = ++loadTripsSeq;
          const cached = cache.get<TripSummary[]>('trips');
          if (cached && cached.length > 0 && store.trips().length === 0) {
            const fallbackId = store.lastSelectedTripId() ?? cached[0]?.id ?? null;
            patchState(store, {
              trips: cached,
              lastSelectedTripId: fallbackId,
              loading: false,
              syncing: true,
              usingOfflineCache: false,
              error: null,
            });
          } else {
            patchState(store, {
              loading: store.trips().length === 0,
              syncing: store.trips().length > 0,
              usingOfflineCache: false,
              error: null,
            });
          }

          try {
            const trips = await api.listTrips();
            if (seq !== loadTripsSeq) return;
            cache.set('trips', trips);
            const fallbackId = store.lastSelectedTripId() ?? trips[0]?.id ?? null;
            patchState(store, {
              trips,
              lastSelectedTripId: fallbackId,
              loading: false,
              syncing: false,
              usingOfflineCache: false,
            });
          } catch (err) {
            if (seq !== loadTripsSeq) return;
            const hasData = store.trips().length > 0;
            patchState(store, {
              loading: false,
              syncing: false,
              usingOfflineCache: hasData,
              error: hasData
                ? null
                : err instanceof Error
                  ? err.message
                  : 'Failed to load trips',
            });
          }
        },

        async createTrip(payload: CreateTripPayload): Promise<string> {
          const created = await api.createTrip(payload);
          const nextTrips = [created, ...store.trips()];
          cache.set('trips', nextTrips);
          patchState(store, {
            trips: nextTrips,
            lastSelectedTripId: created.id,
            activeTab: 'upcoming',
          });
          return created.id;
        },

        async updateTripStatus(tripId: string, status: TripStatus): Promise<void> {
          const updated = await api.updateTrip(tripId, { status });
          const nextTrips = store.trips().map((t) => (t.id === tripId ? updated : t));
          cache.set('trips', nextTrips);
          patchState(store, { trips: nextTrips });
        },

        reset(): void {
          loadTripsSeq += 1;
          patchState(store, initialState);
        },
      };
    },
  ),
);
