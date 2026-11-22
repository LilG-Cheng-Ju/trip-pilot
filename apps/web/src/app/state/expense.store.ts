import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { CreateExpensePayload, TripilotApiService } from '../core/api/tripilot-api.service';
import { ExpenseCategory, TripExpensesSummary } from '../core/models/tripilot.models';

interface ExpenseState {
  summary: TripExpensesSummary | null;
  selectedCategory: ExpenseCategory | 'ALL';
  loading: boolean;
  error: string | null;
}

const initialState: ExpenseState = {
  summary: null,
  selectedCategory: 'ALL',
  loading: false,
  error: null,
};

/** SignalStore managing low-friction per-trip expense tracking. */
export const ExpenseStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    filteredItems: computed(() => {
      const summary = store.summary();
      if (!summary) {
        return [];
      }
      const cat = store.selectedCategory();
      return cat === 'ALL'
        ? summary.items
        : summary.items.filter((item) => item.category === cat);
    }),
  })),
  withMethods((store, api = inject(TripilotApiService)) => ({
    setCategoryFilter(selectedCategory: ExpenseCategory | 'ALL'): void {
      patchState(store, { selectedCategory });
    },

    async loadExpenses(tripId: string): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const summary = await api.listExpenses(tripId);
        patchState(store, { summary, loading: false });
      } catch (err) {
        patchState(store, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load expenses',
        });
      }
    },

    async addExpense(tripId: string, payload: CreateExpensePayload): Promise<void> {
      await api.createExpense(tripId, payload);
      await this.loadExpenses(tripId);
    },

    async deleteExpense(tripId: string, expenseId: string): Promise<void> {
      await api.deleteExpense(expenseId);
      await this.loadExpenses(tripId);
    },
  })),
);
