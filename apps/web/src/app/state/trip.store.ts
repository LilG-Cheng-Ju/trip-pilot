import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { CreateTripPayload, TripilotApiService } from '../core/api/tripilot-api.service';
import { TripStatus, TripSummary } from '../core/models/tripilot.models';

export type TripListTab = 'upcoming' | 'completed' | 'archived';

interface TripState {
  trips: TripSummary[];
  activeTab: TripListTab;
  lastSelectedTripId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: TripState = {
  trips: [],
  activeTab: 'upcoming',
  lastSelectedTripId: null,
  loading: false,
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
      if (tab === 'completed') {
        return all
          .filter((t) => t.status === 'COMPLETED')
          .sort((a, b) => b.start_date.localeCompare(a.start_date));
      }
      return all
        .filter((t) => t.status === 'ARCHIVED')
        .sort((a, b) => b.start_date.localeCompare(a.start_date));
    }),
  })),
  withMethods((store, api = inject(TripilotApiService)) => ({
    setTab(activeTab: TripListTab): void {
      patchState(store, { activeTab });
    },

    setLastSelectedTripId(tripId: string): void {
      patchState(store, { lastSelectedTripId: tripId });
    },

    async loadTrips(): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const trips = await api.listTrips();
        const fallbackId = store.lastSelectedTripId() ?? trips[0]?.id ?? null;
        patchState(store, { trips, lastSelectedTripId: fallbackId, loading: false });
      } catch (err) {
        patchState(store, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load trips',
        });
      }
    },

    async createTrip(payload: CreateTripPayload): Promise<string> {
      const created = await api.createTrip(payload);
      patchState(store, {
        trips: [created, ...store.trips()],
        lastSelectedTripId: created.id,
        activeTab: 'upcoming',
      });
      return created.id;
    },

    async updateTripStatus(tripId: string, status: TripStatus): Promise<void> {
      const updated = await api.updateTrip(tripId, { status });
      patchState(store, {
        trips: store.trips().map((t) => (t.id === tripId ? updated : t)),
      });
    },
  })),
);
