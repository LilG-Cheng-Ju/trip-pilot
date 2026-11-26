import { TripDay, TripDetail } from '../models/tripilot.models';
import { formatLocalIsoDate } from './travel-format.utils';

export type MobileExpenseTab = 'add' | 'ledger';

const TRIP_ROUTE_RE = /^\/trips\/([^/]+)(?:\/|$)/;

/** Extract active tripId from workspace URLs (/trips/:tripId/*), or null on global routes. */
export function extractActiveTripIdFromUrl(url: string): string | null {
  const path = (url.split(/[?#]/)[0] ?? '').trim();
  const match = TRIP_ROUTE_RE.exec(path);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return match[1] || null;
  }
}

/** Pick today's itinerary day when opening an in-progress trip, otherwise default to Day 1. */
export function resolveInitialDayIndex(
  days: readonly TripDay[],
  todayIso: string = formatLocalIsoDate(),
): number {
  if (days.length === 0) {
    return 1;
  }
  const todayDay = days.find((day) => day.date === todayIso);
  return todayDay ? todayDay.day_index : days[0].day_index;
}

/** Choose Quick Add during upcoming/active trips, and Ledger post-trip, offline, or when filtered. */
export function resolveInitialMobileExpenseTab(params: {
  hasItemFilter: boolean;
  isOfflineReadOnly: boolean;
  trip: Pick<TripDetail, 'status' | 'end_date'> | null;
  todayIso?: string;
}): MobileExpenseTab {
  if (params.hasItemFilter || params.isOfflineReadOnly) {
    return 'ledger';
  }
  const trip = params.trip;
  if (!trip) {
    return 'add';
  }
  const today = params.todayIso ?? formatLocalIsoDate();
  if (
    trip.status === 'COMPLETED' ||
    trip.status === 'ARCHIVED' ||
    trip.end_date < today
  ) {
    return 'ledger';
  }
  return 'add';
}
