import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import { TravelStats } from '../core/models/tripilot.models';

interface StatsState {
  selectedYear: number | null;
  stats: TravelStats | null;
  loading: boolean;
  error: string | null;
}

const initialState: StatsState = {
  selectedYear: new Date().getFullYear(),
  stats: null,
  loading: false,
  error: null,
};

/** SignalStore managing annual and lifetime travel statistics. */
export const StatsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, api = inject(TripilotApiService)) => ({
    async loadStats(year: number | null = store.selectedYear()): Promise<void> {
      patchState(store, { selectedYear: year, loading: true, error: null });
      try {
        const stats = await api.getStats(year);
        patchState(store, { stats, loading: false });
      } catch (err) {
        patchState(store, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load stats',
        });
      }
    },
  })),
);
