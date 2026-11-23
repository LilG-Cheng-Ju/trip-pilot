import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import { StatsScope, TravelStats } from '../core/models/tripilot.models';

interface StatsState {
  selectedYear: number | null;
  selectedScope: StatsScope;
  stats: TravelStats | null;
  loading: boolean;
  error: string | null;
}

const initialState: StatsState = {
  selectedYear: new Date().getFullYear(),
  selectedScope: 'all',
  stats: null,
  loading: false,
  error: null,
};

/** SignalStore managing annual and lifetime travel statistics. */
export const StatsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, api = inject(TripilotApiService)) => ({
    async loadStats(
      year: number | null = store.selectedYear(),
      scope: StatsScope = store.selectedScope(),
    ): Promise<void> {
      patchState(store, {
        selectedYear: year,
        selectedScope: scope,
        loading: true,
        error: null,
      });
      try {
        const stats = await api.getStats(year, scope);
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
