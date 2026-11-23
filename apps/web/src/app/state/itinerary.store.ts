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
    ) => ({
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

    async cloneCurrentOption(label: string): Promise<void> {
      const day = store.selectedDay();
      const option = store.selectedOption();
      const trip = store.trip();
      if (!day || !option || !trip) {
        return;
      }
      const cloned = await api.cloneDayOption(option.id, label);
      await this.loadTrip(trip.id);
      this.previewOption(day.id, cloned.id);
    },

    async appendDay(): Promise<void> {
      const trip = store.trip();
      if (!trip) {
        return;
      }
      const newDay = await api.appendDay(trip.id);
      await this.loadTrip(trip.id);
      this.selectDay(newDay.day_index);
    },

    async updateDayTitle(dayId: string, title: string | null): Promise<void> {
      const trip = store.trip();
      if (!trip) {
        return;
      }
      await api.updateDay(dayId, { title: title?.trim() || null });
      await this.loadTrip(trip.id);
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
      await api.setActiveOption(dayId, optionId);
      await this.loadTrip(trip.id);
    },

    async addItem(payload: CreateItemPayload): Promise<void> {
      const option = store.selectedOption();
      const trip = store.trip();
      if (!option || !trip) {
        return;
      }
      await api.addItem(option.id, payload);
      await this.loadTrip(trip.id);
    },

    async updateItem(
      itemId: string,
      payload: Partial<CreateItemPayload>,
    ): Promise<void> {
      const trip = store.trip();
      if (!trip) {
        return;
      }
      await api.updateItem(itemId, payload);
      await this.loadTrip(trip.id);
    },

    async deleteItem(itemId: string): Promise<void> {
      const trip = store.trip();
      if (!trip) {
        return;
      }
      await api.deleteItem(itemId);
      await this.loadTrip(trip.id);
    },

    async moveItem(item: ItineraryItem, direction: -1 | 1): Promise<void> {
      const option = store.selectedOption();
      const trip = store.trip();
      if (!option || !trip) {
        return;
      }
      // Group items by slot (choice_group_id) so moving skips hidden alternatives.
      const slots: { key: string; ids: string[] }[] = [];
      const seenGroups = new Set<string>();
      for (const entry of option.items) {
        if (!entry.choice_group_id) {
          slots.push({ key: entry.id, ids: [entry.id] });
          continue;
        }
        if (seenGroups.has(entry.choice_group_id)) {
          continue;
        }
        seenGroups.add(entry.choice_group_id);
        const groupIds = option.items
          .filter((i) => i.choice_group_id === entry.choice_group_id)
          .map((i) => i.id);
        slots.push({ key: entry.choice_group_id, ids: groupIds });
      }

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
      const reorderedIds = slots.flatMap((s) => s.ids);
      await api.reorderItems(option.id, reorderedIds);
      await this.loadTrip(trip.id);
    },

    async loadShares(tripId: string): Promise<void> {
      const shares = await api.listShares(tripId);
      patchState(store, { shares });
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
      await api.revokeShare(tripId, shareId);
      await this.loadShares(tripId);
    },
  })),
);
