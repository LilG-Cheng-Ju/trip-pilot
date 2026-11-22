import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { CreateItemPayload, TripilotApiService } from '../core/api/tripilot-api.service';
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
  mobileView: 'list' | 'map';
  desktopMapVisible: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: ItineraryState = {
  trip: null,
  shares: [],
  selectedDayIndex: 1,
  previewOptionByDay: {},
  selectedItemId: null,
  mobileView: 'list',
  desktopMapVisible: true,
  loading: false,
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

    return {
      selectedDay,
      selectedOption,
      stopCount,
      isPreviewingActiveOption,
    };
  }),
  withMethods((store, api = inject(TripilotApiService)) => ({
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

    setMobileView(mobileView: 'list' | 'map'): void {
      patchState(store, { mobileView });
    },

    toggleDesktopMap(): void {
      patchState(store, { desktopMapVisible: !store.desktopMapVisible() });
    },

    async loadTrip(tripId: string): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const trip = await api.getTrip(tripId);
        const currentDayIdx = store.selectedDayIndex();
        const validDayIdx = trip.days.some((d) => d.day_index === currentDayIdx)
          ? currentDayIdx
          : (trip.days[0]?.day_index ?? 1);
        patchState(store, { trip, selectedDayIndex: validDayIdx, loading: false });
      } catch (err) {
        patchState(store, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load itinerary',
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

    async selectChoiceItem(itemId: string): Promise<void> {
      const trip = store.trip();
      if (!trip) {
        return;
      }
      await api.selectChoiceItem(itemId);
      await this.loadTrip(trip.id);
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
      const ids = option.items.map((i) => i.id);
      const currentIndex = ids.indexOf(item.id);
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= ids.length) {
        return;
      }
      [ids[currentIndex], ids[targetIndex]] = [ids[targetIndex], ids[currentIndex]];
      await api.reorderItems(option.id, ids);
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
