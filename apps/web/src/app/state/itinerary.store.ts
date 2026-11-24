import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { CreateItemPayload, TripilotApiService } from '../core/api/tripilot-api.service';
import { OfflineCacheService } from '../core/cache/offline-cache.service';
import {
  DayOption,
  ItineraryItem,
  ShareVisibilityPolicy,
  TripDay,
  TripDetail,
  TripShare,
} from '../core/models/tripilot.models';
import { groupItemsIntoSlots } from '../core/utils/travel-format.utils';

interface ItineraryState {
  trip: TripDetail | null;
  shares: TripShare[];
  selectedDayIndex: number;
  // Tracks which Plan A/B option is being previewed without mutating active_option_id.
  previewOptionByDay: Record<string, string>;
  selectedItemId: string | null;
  mobileMapOpen: boolean;
  loading: boolean;
  syncing: boolean;
  usingOfflineCache: boolean;
  error: string | null;
}

const initialState: ItineraryState = {
  trip: null,
  shares: [],
  selectedDayIndex: 1,
  previewOptionByDay: {},
  selectedItemId: null,
  mobileMapOpen: false,
  loading: false,
  syncing: false,
  usingOfflineCache: false,
  error: null,
};

/** SignalStore managing active trip itinerary, Plan A/B switching, and map sync. */
export const ItineraryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => {
    const selectedDay = computed<TripDay | null>(() => {
      const trip = store.trip();
      if (!trip || trip.days.length === 0) {
        return null;
      }
      return (
        trip.days.find((d) => d.day_index === store.selectedDayIndex()) ?? trip.days[0]
      );
    });

    const selectedOption = computed<DayOption | null>(() => {
      const day = selectedDay();
      if (!day || day.options.length === 0) {
        return null;
      }
      const previewId = store.previewOptionByDay()[day.id];
      return (
        day.options.find((opt) => opt.id === previewId) ??
        day.options.find((opt) => opt.id === day.active_option_id) ??
        day.options[0]
      );
    });

    const stopCount = computed(() => {
      const option = selectedOption();
      if (!option) {
        return 0;
      }
      return option.items.filter(
        (item) => item.is_selected && item.type !== 'LOCAL_TRANSIT',
      ).length;
    });

    const isPreviewingActiveOption = computed(() => {
      const day = selectedDay();
      const option = selectedOption();
      return Boolean(day && option && day.active_option_id === option.id);
    });

    // Inherit the most recent geolocated STAY from Day 1 through the selected day.
    const basecampStay = computed<ItineraryItem | null>(() => {
      const trip = store.trip();
      const currentDay = selectedDay();
      if (!trip || !currentDay) {
        return null;
      }
      let latestStay: ItineraryItem | null = null;
      for (const day of trip.days) {
        if (day.day_index > currentDay.day_index) {
          break;
        }
        const opt =
          day.id === currentDay.id
            ? selectedOption()
            : (day.options.find((o) => o.id === day.active_option_id) ?? day.options[0]);
        if (!opt) continue;
        for (const item of opt.items) {
          if (
            item.is_selected &&
            item.type === 'STAY' &&
            item.latitude !== null &&
            item.longitude !== null
          ) {
            latestStay = item;
          }
        }
      }
      return latestStay;
    });

    return {
      selectedDay,
      selectedOption,
      stopCount,
      isPreviewingActiveOption,
      basecampStay,
    };
  }),
  withMethods(
    (
      store,
      api = inject(TripilotApiService),
      cache = inject(OfflineCacheService),
    ) => {
      let loadTripSeq = 0;

      const commitTrip = (nextTrip: TripDetail): void => {
        cache.set(`trip.${nextTrip.id}`, nextTrip);
        patchState(store, { trip: nextTrip, error: null });
      };

      const recordError = (err: unknown, fallback: string): void => {
        patchState(store, {
          error: err instanceof Error ? err.message : fallback,
        });
      };

      return {
        clearError(): void {
          patchState(store, { error: null });
        },

        selectDay(dayIndex: number): void {
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

        async loadTrip(tripId: string): Promise<void> {
          const seq = ++loadTripSeq;
          const cached = cache.get<TripDetail>(`trip.${tripId}`);
          const hasCurrent = store.trip()?.id === tripId;

          if (!hasCurrent && cached) {
            const validDayIdx = cached.days[0]?.day_index ?? 1;
            patchState(store, {
              trip: cached,
              selectedDayIndex: validDayIdx,
              loading: false,
              syncing: true,
              usingOfflineCache: false,
              error: null,
            });
          } else {
            patchState(store, {
              loading: !hasCurrent,
              syncing: hasCurrent,
              usingOfflineCache: false,
              error: null,
            });
          }

          try {
            const trip = await api.getTrip(tripId);
            if (seq !== loadTripSeq) return;
            cache.set(`trip.${tripId}`, trip);
            const currentDayIdx = store.selectedDayIndex();
            const validDayIdx = trip.days.some((d) => d.day_index === currentDayIdx)
              ? currentDayIdx
              : (trip.days[0]?.day_index ?? 1);
            patchState(store, {
              trip,
              selectedDayIndex: validDayIdx,
              loading: false,
              syncing: false,
              usingOfflineCache: false,
            });
          } catch (err) {
            if (seq !== loadTripSeq) return;
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

        async createBlankOption(label: string): Promise<void> {
          const day = store.selectedDay();
          const trip = store.trip();
          if (!day || !trip) {
            return;
          }
          try {
            const created = await api.addDayOption(day.id, label);
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) =>
                d.id === day.id ? { ...d, options: [...d.options, created] } : d,
              ),
            };
            commitTrip(nextTrip);
            this.previewOption(day.id, created.id);
          } catch (err) {
            recordError(err, 'Failed to create plan option');
          }
        },

        async cloneCurrentOption(label: string): Promise<void> {
          const day = store.selectedDay();
          const option = store.selectedOption();
          const trip = store.trip();
          if (!day || !option || !trip) {
            return;
          }
          try {
            const cloned = await api.cloneDayOption(option.id, label);
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) =>
                d.id === day.id ? { ...d, options: [...d.options, cloned] } : d,
              ),
            };
            commitTrip(nextTrip);
            this.previewOption(day.id, cloned.id);
          } catch (err) {
            recordError(err, 'Failed to clone plan option');
          }
        },

        async renameOption(optionId: string, label: string): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          try {
            const updated = await api.updateDayOption(optionId, label);
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) => ({
                ...d,
                options: d.options.map((opt) => (opt.id === updated.id ? updated : opt)),
              })),
            };
            commitTrip(nextTrip);
          } catch (err) {
            recordError(err, 'Failed to rename plan option');
          }
        },

        async deleteOption(dayId: string, optionId: string): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          try {
            const updatedDay = await api.deleteDayOption(optionId);
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) => (d.id === updatedDay.id ? updatedDay : d)),
            };
            commitTrip(nextTrip);
            if (updatedDay.active_option_id) {
              this.previewOption(dayId, updatedDay.active_option_id);
            }
          } catch (err) {
            recordError(err, 'Failed to delete plan option');
          }
        },

        async appendDay(): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          try {
            const newDay = await api.appendDay(trip.id);
            const nextEndDate = newDay.date > trip.end_date ? newDay.date : trip.end_date;
            const nextTrip: TripDetail = {
              ...trip,
              end_date: nextEndDate,
              days: [...trip.days, newDay],
            };
            commitTrip(nextTrip);
            this.selectDay(newDay.day_index);
          } catch (err) {
            recordError(err, 'Failed to append day');
          }
        },

        async updateDayTitle(dayId: string, title: string | null): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          try {
            const updatedDay = await api.updateDay(dayId, { title: title?.trim() || null });
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) =>
                d.id === updatedDay.id ? { ...d, title: updatedDay.title } : d,
              ),
            };
            commitTrip(nextTrip);
          } catch (err) {
            recordError(err, 'Failed to update day theme');
          }
        },

        async selectChoiceItem(itemId: string): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }

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
            // Revert optimistic update if the server request fails.
            patchState(store, { trip: previousTrip });
          }
        },

        async setActiveOption(dayId: string, optionId: string): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          try {
            const updatedDay = await api.setActiveOption(dayId, optionId);
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) =>
                d.id === updatedDay.id
                  ? { ...d, active_option_id: updatedDay.active_option_id }
                  : d,
              ),
            };
            commitTrip(nextTrip);
          } catch (err) {
            recordError(err, 'Failed to switch active plan');
          }
        },

        async addItem(payload: CreateItemPayload): Promise<void> {
          const option = store.selectedOption();
          const trip = store.trip();
          if (!option || !trip) {
            return;
          }
          try {
            const created = await api.addItem(option.id, payload);
            const nextTrip: TripDetail = {
              ...trip,
              days: trip.days.map((d) => ({
                ...d,
                options: d.options.map((opt) =>
                  opt.id !== option.id
                    ? opt
                    : { ...opt, items: [...opt.items, created] },
                ),
              })),
            };
            commitTrip(nextTrip);
          } catch (err) {
            recordError(err, 'Failed to add itinerary item');
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
            commitTrip(nextTrip);
          } catch (err) {
            recordError(err, 'Failed to update itinerary item');
          }
        },

        async deleteItem(itemId: string): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          const previousTrip = trip;
          const nextTrip: TripDetail = {
            ...trip,
            days: trip.days.map((d) => ({
              ...d,
              options: d.options.map((opt) => ({
                ...opt,
                items: opt.items.filter((it) => it.id !== itemId),
              })),
            })),
          };
          patchState(store, {
            trip: nextTrip,
            selectedItemId: store.selectedItemId() === itemId ? null : store.selectedItemId(),
          });
          try {
            await api.deleteItem(itemId);
            cache.set(`trip.${nextTrip.id}`, nextTrip);
          } catch (err) {
            patchState(store, { trip: previousTrip });
            recordError(err, 'Failed to delete itinerary item');
          }
        },

        async moveItem(item: ItineraryItem, direction: -1 | 1): Promise<void> {
          const option = store.selectedOption();
          const trip = store.trip();
          if (!option || !trip) {
            return;
          }
          // Group items by slot (choice_group_id) so moving skips hidden alternatives.
          const slots = groupItemsIntoSlots(option.items);

          const targetKey = item.choice_group_id ?? item.id;
          const currentIndex = slots.findIndex((s) => s.key === targetKey);
          const targetIndex = currentIndex + direction;
          if (currentIndex < 0 || targetIndex < 0 || targetIndex >= slots.length) {
            return;
          }
          [slots[currentIndex], slots[targetIndex]] = [
            slots[targetIndex],
            slots[currentIndex],
          ];
          const reorderedItems = slots.flatMap((s) => s.choices);
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
            commitTrip(mergedTrip);
          } catch (err) {
            patchState(store, { trip: previousTrip });
            recordError(err, 'Failed to reorder items');
          }
        },

        async loadShares(tripId: string): Promise<void> {
          try {
            const shares = await api.listShares(tripId);
            patchState(store, { shares });
          } catch (err) {
            recordError(err, 'Failed to load share links');
          }
        },

        async createShare(
          tripId: string,
          label: string,
          policy: ShareVisibilityPolicy,
        ): Promise<TripShare> {
          const share = await api.createShare(tripId, label, policy);
          patchState(store, { shares: [share, ...store.shares()] });
          return share;
        },

        async revokeShare(tripId: string, shareId: string): Promise<void> {
          try {
            await api.revokeShare(tripId, shareId);
            patchState(store, {
              shares: store.shares().filter((s) => s.id !== shareId),
            });
          } catch (err) {
            recordError(err, 'Failed to revoke share link');
          }
        },

        reset(): void {
          loadTripSeq += 1;
          patchState(store, initialState);
        },
      };
    },
  ),
);
