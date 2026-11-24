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
  withMethods((store, api = inject(TripilotApiService)) => {
    let loadStatsSeq = 0;

    return {
      clearError(): void {
        patchState(store, { error: null });
      },

      async loadStats(
        year: number | null = store.selectedYear(),
        scope: StatsScope = store.selectedScope(),
      ): Promise<void> {
        const seq = ++loadStatsSeq;
        patchState(store, {
          selectedYear: year,
          selectedScope: scope,
          loading: true,
          error: null,
        });
        try {
          const stats = await api.getStats(year, scope);
          if (seq !== loadStatsSeq) return;
          patchState(store, { stats, loading: false });
        } catch (err) {
          if (seq !== loadStatsSeq) return;
          patchState(store, {
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load stats',
          });
        }
      },

      reset(): void {
        loadStatsSeq += 1;
        patchState(store, initialState);
      },
    };
  }),
);
