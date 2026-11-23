import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { CreateExpensePayload, TripilotApiService } from '../core/api/tripilot-api.service';
import { ExpenseCategory, TripExpensesSummary } from '../core/models/tripilot.models';

export interface ItemExpenseSummary {
  count: number;
  totalHome: number;
  currencyHome: string;
}

interface ExpenseState {
  summary: TripExpensesSummary | null;
  selectedCategory: ExpenseCategory | 'ALL';
  selectedItemId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: ExpenseState = {
  summary: null,
  selectedCategory: 'ALL',
  selectedItemId: null,
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
      const itemId = store.selectedItemId();
      return summary.items.filter((item) => {
        if (cat !== 'ALL' && item.category !== cat) {
          return false;
        }
        if (itemId && item.itinerary_item_id !== itemId) {
          return false;
        }
        return true;
      });
    }),
    expensesByItemId: computed(() => {
      const summary = store.summary();
      const map: Record<string, ItemExpenseSummary> = {};
      if (!summary) {
        return map;
      }
      for (const exp of summary.items) {
        if (!exp.itinerary_item_id) {
          continue;
        }
        const prev = map[exp.itinerary_item_id];
        const amt = Number(exp.amount_home) || 0;
        if (prev) {
          prev.count += 1;
          prev.totalHome += amt;
        } else {
          map[exp.itinerary_item_id] = {
            count: 1,
            totalHome: amt,
            currencyHome: exp.currency_home || summary.home_currency,
          };
        }
      }
      return map;
    }),
  })),
  withMethods((store, api = inject(TripilotApiService)) => ({
    setCategoryFilter(selectedCategory: ExpenseCategory | 'ALL'): void {
      patchState(store, { selectedCategory });
    },

    setItemFilter(selectedItemId: string | null): void {
      patchState(store, { selectedItemId });
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
