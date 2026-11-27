import { inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';

import { CreateItemPayload, TripilotApiService } from '../../core/api/tripilot-api.service';
import { OfflineCacheService } from '../../core/cache/offline-cache.service';
import { ItineraryItem, TripDetail } from '../../core/models/tripilot.models';
import {
  appendCreatedItem,
  groupItemsIntoSlots,
  removeItemWithChoicePromotion,
} from '../../core/utils/travel-format.utils';
import { ItineraryBaseFeature } from './itinerary-base.feature';
import {
  commitTripState,
  recordItineraryError,
  refreshTripSilently,
} from './itinerary.state';

/** Itinerary item CRUD, slot-choice switching, and drag/arrow reordering methods. */
export function withItineraryItems() {
  return signalStoreFeature(
    type<ItineraryBaseFeature>(),
    withMethods(
      (
        store,
        api = inject(TripilotApiService),
        cache = inject(OfflineCacheService),
      ) => ({
        async selectChoiceItem(itemId: string): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          const seq = ++store._runtime.mutationSeq;
          store._runtime.recalculatedOptionIds.clear();

          // Optimistic 0ms UI flip so cards & map switch immediately before OSRM finishes.
          let targetGroupId: string | null = null;
          let targetOptionId: string | null = null;
          for (const day of trip.days) {
            for (const opt of day.options) {
              const hit = opt.items.find((it) => it.id === itemId);
              if (hit) {
                targetGroupId = hit.choice_group_id;
                targetOptionId = opt.id;
                break;
              }
            }
            if (targetOptionId) break;
          }

          const previousTrip = trip;
          if (targetOptionId && targetGroupId) {
            const optimisticTrip: TripDetail = {
              ...trip,
              days: trip.days.map((day) => ({
                ...day,
                options: day.options.map((opt) =>
                  opt.id !== targetOptionId
                    ? opt
                    : {
                        ...opt,
                        items: opt.items.map((it) =>
                          it.choice_group_id === targetGroupId
                            ? { ...it, is_selected: it.id === itemId }
                            : it,
                        ),
                      },
                ),
              })),
            };
            patchState(store, { trip: optimisticTrip });
          }

          try {
            const updatedOption = await api.selectChoiceItem(itemId);
            if (seq !== store._runtime.mutationSeq) {
              return;
            }
            const latest = store.trip();
            if (!latest) return;
            const mergedTrip: TripDetail = {
              ...latest,
              days: latest.days.map((day) => ({
                ...day,
                options: day.options.map((opt) =>
                  opt.id === updatedOption.id ? updatedOption : opt,
                ),
              })),
            };
            cache.set(`trip.${mergedTrip.id}`, mergedTrip);
            patchState(store, { trip: mergedTrip });
          } catch {
            // Revert optimistic update only if no newer mutation took over.
            if (seq === store._runtime.mutationSeq) {
              patchState(store, { trip: previousTrip });
            }
          }
        },

        async addItem(payload: CreateItemPayload): Promise<void> {
          const option = store.selectedOption();
          const trip = store.trip();
          if (!option || !trip) {
            return;
          }
          store._runtime.mutationSeq += 1;
          store._runtime.recalculatedOptionIds.clear();
          try {
            const created = await api.addItem(option.id, payload);
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) => ({
                ...d,
                options: d.options.map((opt) =>
                  opt.id !== option.id
                    ? opt
                    : {
                        ...opt,
                        items: appendCreatedItem(
                          opt.items,
                          created,
                          payload.alternative_for_item_id,
                        ),
                      },
                ),
              })),
            };
            commitTripState(store, cache, nextTrip);
            if (created.latitude !== null && created.longitude !== null) {
              void refreshTripSilently(store, api, cache, store._runtime, trip.id);
            }
          } catch (err) {
            recordItineraryError(store, err, 'Failed to add itinerary item');
          }
        },

        async updateItem(
          itemId: string,
          payload: Partial<CreateItemPayload>,
        ): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          store._runtime.mutationSeq += 1;
          store._runtime.recalculatedOptionIds.clear();
          let prevItem: ItineraryItem | undefined;
          for (const day of trip.days) {
            for (const opt of day.options) {
              prevItem = opt.items.find((it) => it.id === itemId);
              if (prevItem) break;
            }
            if (prevItem) break;
          }
          try {
            const updated = await api.updateItem(itemId, payload);
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) => ({
                ...d,
                options: d.options.map((opt) => ({
                  ...opt,
                  items: opt.items.map((it) => (it.id === updated.id ? updated : it)),
                })),
              })),
            };
            commitTripState(store, cache, nextTrip);
            if (
              prevItem?.latitude !== updated.latitude ||
              prevItem?.longitude !== updated.longitude ||
              prevItem?.type !== updated.type
            ) {
              void refreshTripSilently(store, api, cache, store._runtime, trip.id);
            }
          } catch (err) {
            recordItineraryError(store, err, 'Failed to update itinerary item');
          }
        },

        async deleteItem(itemId: string): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          const seq = ++store._runtime.mutationSeq;
          store._runtime.recalculatedOptionIds.clear();
          let deletedItem: ItineraryItem | undefined;
          for (const day of trip.days) {
            for (const opt of day.options) {
              deletedItem = opt.items.find((it) => it.id === itemId);
              if (deletedItem) break;
            }
            if (deletedItem) break;
          }
          const previousTrip = trip;
          const prevSelectedId = store.selectedItemId();
          const nextTrip: TripDetail = {
            ...trip,
            days: trip.days.map((d) => ({
              ...d,
              options: d.options.map((opt) => ({
                ...opt,
                items: removeItemWithChoicePromotion(opt.items, itemId),
              })),
            })),
          };
          patchState(store, {
            trip: nextTrip,
            selectedItemId: prevSelectedId === itemId ? null : prevSelectedId,
          });
          try {
            await api.deleteItem(itemId);
            if (seq !== store._runtime.mutationSeq) {
              return;
            }
            cache.set(`trip.${nextTrip.id}`, nextTrip);
            if (
              deletedItem &&
              deletedItem.latitude !== null &&
              deletedItem.longitude !== null
            ) {
              void refreshTripSilently(store, api, cache, store._runtime, nextTrip.id);
            }
          } catch (err) {
            if (seq === store._runtime.mutationSeq) {
              patchState(store, { trip: previousTrip, selectedItemId: prevSelectedId });
            }
            recordItineraryError(store, err, 'Failed to delete itinerary item');
          }
        },

        async reorderSlotIndex(fromIndex: number, toIndex: number): Promise<void> {
          const option = store.selectedOption();
          const trip = store.trip();
          if (!option || !trip) {
            return;
          }
          // Group items by slot (choice_group_id) so dragging/moving skips hidden alternatives.
          const slots = groupItemsIntoSlots(option.items);
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= slots.length ||
            toIndex >= slots.length
          ) {
            return;
          }
          const seq = ++store._runtime.mutationSeq;
          store._runtime.recalculatedOptionIds.clear();

          const nextSlots = [...slots];
          const [movedSlot] = nextSlots.splice(fromIndex, 1);
          nextSlots.splice(toIndex, 0, movedSlot);
          const reorderedItems = nextSlots.flatMap((s) => s.choices);
          const reorderedIds = reorderedItems.map((c) => c.id);

          // Optimistic 0ms reorder; rollback on API error.
          const previousTrip = trip;
          const optimisticTrip: TripDetail = {
            ...trip,
            days: trip.days.map((d) => ({
              ...d,
              options: d.options.map((opt) =>
                opt.id !== option.id
                  ? opt
                  : {
                      ...opt,
                      items: reorderedItems.map((it, idx) => ({ ...it, sort_order: idx })),
                    },
              ),
            })),
          };
          patchState(store, { trip: optimisticTrip });

          try {
            const updatedOption = await api.reorderItems(option.id, reorderedIds);
            if (seq !== store._runtime.mutationSeq) {
              return;
            }
            const latest = store.trip();
            if (!latest) return;
            const mergedTrip: TripDetail = {
              ...latest,
              days: latest.days.map((d) => ({
                ...d,
                options: d.options.map((opt) =>
                  opt.id === updatedOption.id ? updatedOption : opt,
                ),
              })),
            };
            commitTripState(store, cache, mergedTrip);
          } catch (err) {
            if (seq === store._runtime.mutationSeq) {
              patchState(store, { trip: previousTrip });
            }
            recordItineraryError(store, err, 'Failed to reorder items');
          }
        },

        async moveItem(itemOrId: ItineraryItem | string, direction: -1 | 1): Promise<void> {
          const option = store.selectedOption();
          if (!option) {
            return;
          }
          const slots = groupItemsIntoSlots(option.items);
          const targetKey =
            typeof itemOrId === 'string'
              ? (option.items.find((it) => it.id === itemOrId)?.choice_group_id ?? itemOrId)
              : (itemOrId.choice_group_id ?? itemOrId.id);
          const currentIndex = slots.findIndex((s) => s.key === targetKey);
          if (currentIndex < 0) {
            return;
          }
          await this.reorderSlotIndex(currentIndex, currentIndex + direction);
        },
      }),
    ),
  );
}
