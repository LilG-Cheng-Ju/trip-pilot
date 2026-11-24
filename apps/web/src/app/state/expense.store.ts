import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { CreateExpensePayload, TripilotApiService } from '../core/api/tripilot-api.service';
import { OfflineCacheService } from '../core/cache/offline-cache.service';
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
  withMethods(
    (
      store,
      api = inject(TripilotApiService),
      cache = inject(OfflineCacheService),
    ) => {
      let loadExpensesSeq = 0;

      const rebuildSummary = (
        base: TripExpensesSummary,
        items: TripExpensesSummary['items'],
      ): TripExpensesSummary => {
        const byCat: Record<string, number> = {};
        let total = 0;
        for (const item of items) {
          const amt = Number(item.amount_home) || 0;
          total += amt;
          byCat[item.category] = (byCat[item.category] ?? 0) + amt;
        }
        const byCategoryStr: Record<string, string> = {};
        for (const [k, v] of Object.entries(byCat)) {
          byCategoryStr[k] = v.toFixed(2);
        }
        return {
          ...base,
          total_home_amount: total.toFixed(2),
          by_category: byCategoryStr,
          items,
        };
      };

      return {
        clearError(): void {
          patchState(store, { error: null });
        },

        setCategoryFilter(selectedCategory: ExpenseCategory | 'ALL'): void {
          patchState(store, { selectedCategory });
        },

        setItemFilter(selectedItemId: string | null): void {
          patchState(store, { selectedItemId });
        },

        async loadExpenses(tripId: string): Promise<void> {
          const seq = ++loadExpensesSeq;
          const cached = cache.get<TripExpensesSummary>(`expenses.${tripId}`);
          if (cached && store.summary()?.trip_id !== tripId) {
            patchState(store, { summary: cached, loading: false, error: null });
          } else {
            patchState(store, { loading: store.summary()?.trip_id !== tripId, error: null });
          }
          try {
            const summary = await api.listExpenses(tripId);
            if (seq !== loadExpensesSeq) return;
            cache.set(`expenses.${tripId}`, summary);
            patchState(store, { summary, loading: false });
          } catch (err) {
            if (seq !== loadExpensesSeq) return;
            const hasData = store.summary()?.trip_id === tripId;
            patchState(store, {
              loading: false,
              error: hasData
                ? null
                : err instanceof Error
                  ? err.message
                  : 'Failed to load expenses',
            });
          }
        },

        async addExpense(tripId: string, payload: CreateExpensePayload): Promise<void> {
          try {
            const created = await api.createExpense(tripId, payload);
            const current = store.summary();
            if (current && current.trip_id === tripId) {
              const next = rebuildSummary(current, [created, ...current.items]);
              cache.set(`expenses.${tripId}`, next);
              patchState(store, { summary: next, error: null });
            } else {
              await this.loadExpenses(tripId);
            }
          } catch (err) {
            patchState(store, {
              error: err instanceof Error ? err.message : 'Failed to add expense',
            });
          }
        },

        async deleteExpense(tripId: string, expenseId: string): Promise<void> {
          const current = store.summary();
          const previous = current;
          if (current && current.trip_id === tripId) {
            const optimistic = rebuildSummary(
              current,
              current.items.filter((it) => it.id !== expenseId),
            );
            patchState(store, { summary: optimistic, error: null });
          }
          try {
            await api.deleteExpense(expenseId);
            const latest = store.summary();
            if (latest && latest.trip_id === tripId) {
              cache.set(`expenses.${tripId}`, latest);
            }
          } catch (err) {
            patchState(store, {
              summary: previous,
              error: err instanceof Error ? err.message : 'Failed to delete expense',
            });
          }
        },

        reset(): void {
          loadExpensesSeq += 1;
          patchState(store, initialState);
        },
      };
    },
  ),
);
