import { computed } from '@angular/core';
import {
  signalStoreFeature,
  SignalStoreFeatureType,
  withComputed,
  withProps,
  withState,
} from '@ngrx/signals';

import { DayOption, ItineraryItem, TripDay } from '../../core/models/tripilot.models';
import { createItineraryRuntime, initialItineraryState } from './itinerary.state';

/** Base state, runtime trackers, and computed selectors shared across ItineraryStore features. */
export function withItineraryBase() {
  return signalStoreFeature(
    withState(initialItineraryState),
    withProps(() => ({
      _runtime: createItineraryRuntime(),
    })),
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

      // Inherit the most recent geolocated STAY from previous days (morning departure hotel).
      const departureStay = computed<ItineraryItem | null>(() => {
        const trip = store.trip();
        const currentDay = selectedDay();
        if (!trip || !currentDay) {
          return null;
        }
        let prevStay: ItineraryItem | null = null;
        for (const day of trip.days) {
          if (day.day_index >= currentDay.day_index) {
            break;
          }
          const opt =
            day.options.find((o) => o.id === day.active_option_id) ?? day.options[0];
          if (!opt) continue;
          for (const item of opt.items) {
            if (
              item.is_selected &&
              item.type === 'STAY' &&
              item.latitude !== null &&
              item.longitude !== null
            ) {
              prevStay = item;
            }
          }
        }
        return prevStay;
      });

      // Inherit the most recent geolocated STAY through the selected day (tonight's hotel).
      const basecampStay = computed<ItineraryItem | null>(() => {
        const trip = store.trip();
        const currentDay = selectedDay();
        if (!trip || !currentDay) {
          return null;
        }
        let latestStay: ItineraryItem | null = departureStay();
        const opt = selectedOption();
        if (opt) {
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
        departureStay,
        basecampStay,
      };
    }),
  );
}

export type ItineraryBaseFeature = SignalStoreFeatureType<typeof withItineraryBase>;
