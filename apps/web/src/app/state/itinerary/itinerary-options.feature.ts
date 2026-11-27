import { inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { OfflineCacheService } from '../../core/cache/offline-cache.service';
import { TripDetail } from '../../core/models/tripilot.models';
import { addDaysToIsoDate } from '../../core/utils/travel-format.utils';
import { ItineraryBaseFeature } from './itinerary-base.feature';
import { commitTripState, recordItineraryError } from './itinerary.state';

/** Day and Plan A/B option management methods for ItineraryStore. */
export function withItineraryOptions() {
  return signalStoreFeature(
    type<ItineraryBaseFeature>(),
    withMethods(
      (
        store,
        api = inject(TripilotApiService),
        cache = inject(OfflineCacheService),
      ) => ({
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
            commitTripState(store, cache, nextTrip);
            patchState(store, {
              previewOptionByDay: {
                ...store.previewOptionByDay(),
                [day.id]: created.id,
              },
              selectedItemId: null,
            });
          } catch (err) {
            recordItineraryError(store, err, 'Failed to create plan option');
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
            commitTripState(store, cache, nextTrip);
            patchState(store, {
              previewOptionByDay: {
                ...store.previewOptionByDay(),
                [day.id]: cloned.id,
              },
              selectedItemId: null,
            });
          } catch (err) {
            recordItineraryError(store, err, 'Failed to clone plan option');
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
            commitTripState(store, cache, nextTrip);
          } catch (err) {
            recordItineraryError(store, err, 'Failed to rename plan option');
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
            commitTripState(store, cache, nextTrip);
            if (updatedDay.active_option_id) {
              patchState(store, {
                previewOptionByDay: {
                  ...store.previewOptionByDay(),
                  [dayId]: updatedDay.active_option_id,
                },
                selectedItemId: null,
              });
            }
          } catch (err) {
            recordItineraryError(store, err, 'Failed to delete plan option');
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
            store._runtime.dayTouchedDuringLoad = true;
            commitTripState(store, cache, nextTrip);
            patchState(store, { selectedDayIndex: newDay.day_index, selectedItemId: null });
          } catch (err) {
            recordItineraryError(store, err, 'Failed to append day');
          }
        },

        async deleteDay(dayId: string): Promise<void> {
          const trip = store.trip();
          if (!trip || trip.days.length <= 1) {
            return;
          }
          try {
            await api.deleteDay(dayId);
            const remaining = trip.days.filter((d) => d.id !== dayId);
            if (remaining.length === trip.days.length) {
              return;
            }
            // Reindex remaining days contiguously so dates stay aligned with trip.start_date.
            const reindexedDays = remaining.map((d, idx) => ({
              ...d,
              day_index: idx + 1,
              date: addDaysToIsoDate(trip.start_date, idx),
            }));
            const nextEndDate =
              reindexedDays[reindexedDays.length - 1]?.date ?? trip.start_date;
            const nextSelectedDayIndex = Math.max(
              1,
              Math.min(store.selectedDayIndex(), reindexedDays.length),
            );
            const { [dayId]: _removedPreview, ...nextPreviewByDay } =
              store.previewOptionByDay();
            const nextTrip: TripDetail = {
              ...trip,
              end_date: nextEndDate,
              days: reindexedDays,
            };
            store._runtime.recalculatedOptionIds.clear();
            cache.set(`trip.${nextTrip.id}`, nextTrip);
            patchState(store, {
              trip: nextTrip,
              selectedDayIndex: nextSelectedDayIndex,
              previewOptionByDay: nextPreviewByDay,
              selectedItemId: null,
              error: null,
            });
          } catch (err) {
            recordItineraryError(store, err, 'Failed to delete day');
            throw err;
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
            commitTripState(store, cache, nextTrip);
          } catch (err) {
            recordItineraryError(store, err, 'Failed to update day theme');
          }
        },

        async setActiveOption(dayId: string, optionId: string): Promise<void> {
          const trip = store.trip();
          if (!trip) {
            return;
          }
          store._runtime.recalculatedOptionIds.clear();
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
            commitTripState(store, cache, nextTrip);
          } catch (err) {
            recordItineraryError(store, err, 'Failed to switch active plan');
          }
        },
      }),
    ),
  );
}
