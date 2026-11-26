import { TripDay } from '../models/tripilot.models';
import {
  extractActiveTripIdFromUrl,
  resolveInitialDayIndex,
  resolveInitialMobileExpenseTab,
} from './trip-context.utils';

function makeDay(dayIndex: number, date: string): TripDay {
  return {
    id: `day-${dayIndex}`,
    trip_id: 'trip-1',
    day_index: dayIndex,
    date,
    title: null,
    active_option_id: `opt-${dayIndex}`,
    notes: null,
    options: [],
  };
}

describe('trip-context.utils', () => {
  describe('extractActiveTripIdFromUrl', () => {
    it('returns null for global routes and share links', () => {
      expect(extractActiveTripIdFromUrl('/')).toBeNull();
      expect(extractActiveTripIdFromUrl('/trips')).toBeNull();
      expect(extractActiveTripIdFromUrl('/trips/')).toBeNull();
      expect(extractActiveTripIdFromUrl('/stats')).toBeNull();
      expect(extractActiveTripIdFromUrl('/profile')).toBeNull();
      expect(extractActiveTripIdFromUrl('/s/share-token')).toBeNull();
    });

    it('extracts decoded tripId from itinerary, brief, and expenses routes with query params', () => {
      expect(extractActiveTripIdFromUrl('/trips/trip-42')).toBe('trip-42');
      expect(extractActiveTripIdFromUrl('/trips/trip-42/brief')).toBe('trip-42');
      expect(extractActiveTripIdFromUrl('/trips/trip-42/expenses?itemId=it-1#top')).toBe(
        'trip-42',
      );
      expect(extractActiveTripIdFromUrl('/trips/trip%2099/expenses')).toBe('trip 99');
    });
  });

  describe('resolveInitialDayIndex', () => {
    const days = [
      makeDay(1, '2026-11-25'),
      makeDay(2, '2026-11-26'),
      makeDay(3, '2026-11-27'),
      makeDay(4, '2026-11-28'),
    ];

    it('picks the day matching today when the trip is in progress', () => {
      expect(resolveInitialDayIndex(days, '2026-11-27')).toBe(3);
    });

    it('falls back to the first day before or after the trip or when days are empty', () => {
      expect(resolveInitialDayIndex(days, '2026-11-20')).toBe(1);
      expect(resolveInitialDayIndex(days, '2026-12-05')).toBe(1);
      expect(resolveInitialDayIndex([], '2026-11-27')).toBe(1);
    });
  });

  describe('resolveInitialMobileExpenseTab', () => {
    it('defaults to Quick Add while upcoming or during an active trip', () => {
      expect(
        resolveInitialMobileExpenseTab({
          hasItemFilter: false,
          isOfflineReadOnly: false,
          trip: { status: 'PLANNING', end_date: '2026-12-01' },
          todayIso: '2026-11-27',
        }),
      ).toBe('add');

      expect(
        resolveInitialMobileExpenseTab({
          hasItemFilter: false,
          isOfflineReadOnly: false,
          trip: { status: 'ACTIVE', end_date: '2026-11-27' },
          todayIso: '2026-11-27',
        }),
      ).toBe('add');
    });

    it('defaults to Ledger after the trip ends, when completed/archived, offline, or filtered', () => {
      expect(
        resolveInitialMobileExpenseTab({
          hasItemFilter: false,
          isOfflineReadOnly: false,
          trip: { status: 'COMPLETED', end_date: '2026-12-10' },
          todayIso: '2026-11-27',
        }),
      ).toBe('ledger');

      expect(
        resolveInitialMobileExpenseTab({
          hasItemFilter: false,
          isOfflineReadOnly: false,
          trip: { status: 'ACTIVE', end_date: '2026-11-26' },
          todayIso: '2026-11-27',
        }),
      ).toBe('ledger');

      expect(
        resolveInitialMobileExpenseTab({
          hasItemFilter: true,
          isOfflineReadOnly: false,
          trip: { status: 'ACTIVE', end_date: '2026-12-01' },
          todayIso: '2026-11-27',
        }),
      ).toBe('ledger');

      expect(
        resolveInitialMobileExpenseTab({
          hasItemFilter: false,
          isOfflineReadOnly: true,
          trip: { status: 'PLANNING', end_date: '2026-12-01' },
          todayIso: '2026-11-27',
        }),
      ).toBe('ledger');
    });
  });
});
