import { TestBed } from '@angular/core/testing';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import {
  ExpenseItem,
  TripDay,
  TripDetail,
  TripExpensesSummary,
} from '../core/models/tripilot.models';
import { ExpenseStore } from './expense.store';
import { ItineraryStore } from './itinerary.store';
import { TripStore } from './trip.store';

function makeDay(id: string, dayIndex: number, date: string): TripDay {
  return {
    id,
    trip_id: 'trip-1',
    day_index: dayIndex,
    date,
    title: null,
    active_option_id: `opt-${id}`,
    notes: null,
    options: [
      {
        id: `opt-${id}`,
        trip_day_id: id,
        label: 'Plan A',
        sort_order: 0,
        summary_notes: null,
        cached_ground_distance_km: 0,
        cached_distance_is_approx: false,
        items: [],
        route_segments: [],
      },
    ],
  };
}

function makeTripDetail(overrides?: Partial<TripDetail>): TripDetail {
  return {
    id: 'trip-1',
    title: 'Kyoto Autumn',
    destination_summary: 'Kyoto',
    country_codes: ['JP'],
    start_date: '2026-11-01',
    end_date: '2026-11-03',
    default_currency: 'JPY',
    cover_image_url: null,
    status: 'PLANNING',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    notes: 'Bring rail pass',
    days: [
      makeDay('d1', 1, '2026-11-01'),
      makeDay('d2', 2, '2026-11-02'),
      makeDay('d3', 3, '2026-11-03'),
    ],
    ...overrides,
  };
}

describe('CRUD SignalStores', () => {
  let apiMock: Record<string, unknown>;

  beforeEach(() => {
    localStorage.clear();
    apiMock = {
      listTrips: async () => [makeTripDetail()],
      updateTrip: async (_id: string, payload: Record<string, unknown>) =>
        makeTripDetail(payload as Partial<TripDetail>),
      deleteTrip: async () => undefined,
      getTrip: async () => makeTripDetail(),
      deleteDay: async () => undefined,
      listExpenses: async (): Promise<TripExpensesSummary> => ({
        trip_id: 'trip-1',
        home_currency: 'TWD',
        total_home_amount: '215.00',
        by_category: { FOOD: '215.00' },
        items: [
          {
            id: 'exp-1',
            trip_id: 'trip-1',
            trip_day_id: 'd1',
            itinerary_item_id: null,
            title: 'Ramen',
            category: 'FOOD',
            amount_original: '1000',
            currency_original: 'JPY',
            exchange_rate: '0.215',
            amount_home: '215.00',
            currency_home: 'TWD',
            paid_at: '2026-11-01T12:00:00Z',
            payment_method: null,
            notes: null,
          },
        ],
      }),
      updateExpense: async (
        id: string,
        payload: Record<string, unknown>,
      ): Promise<ExpenseItem> => ({
        id,
        trip_id: 'trip-1',
        trip_day_id: (payload['trip_day_id'] as string | null) ?? null,
        itinerary_item_id: null,
        title: (payload['title'] as string) ?? 'Matcha',
        category: (payload['category'] as ExpenseItem['category']) ?? 'SHOPPING',
        amount_original: String(payload['amount_original'] ?? 2000),
        currency_original: String(payload['currency_original'] ?? 'JPY'),
        exchange_rate: String(payload['exchange_rate'] ?? 0.22),
        amount_home: '440.00',
        currency_home: 'TWD',
        paid_at: (payload['paid_at'] as string) ?? '2026-11-02T00:00:00Z',
        payment_method: null,
        notes: (payload['notes'] as string | null) ?? null,
      }),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: TripilotApiService, useValue: apiMock }],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('TripStore updates trip metadata and deletes trips cleanly', async () => {
    const tripStore = TestBed.inject(TripStore);
    await tripStore.loadTrips();
    expect(tripStore.trips()).toHaveLength(1);

    const updated = await tripStore.updateTrip('trip-1', {
      title: 'Kyoto & Uji',
      start_date: '2026-11-05',
      notes: 'Updated note',
    });
    expect(updated.title).toBe('Kyoto & Uji');
    expect(tripStore.trips()[0].title).toBe('Kyoto & Uji');

    await tripStore.deleteTrip('trip-1');
    expect(tripStore.trips()).toEqual([]);
    expect(tripStore.lastSelectedTripId()).toBeNull();
  });

  it('ItineraryStore deletes a day, reindexes dates, clamps selectedDayIndex, and protects last day', async () => {
    const itineraryStore = TestBed.inject(ItineraryStore);
    await itineraryStore.loadTrip('trip-1');
    itineraryStore.selectDay(3);

    await itineraryStore.deleteDay('d2');
    const trip = itineraryStore.trip()!;
    expect(trip.days.map((d) => ({ id: d.id, index: d.day_index, date: d.date }))).toEqual([
      { id: 'd1', index: 1, date: '2026-11-01' },
      { id: 'd3', index: 2, date: '2026-11-02' },
    ]);
    expect(trip.end_date).toBe('2026-11-02');
    expect(itineraryStore.selectedDayIndex()).toBe(2);

    await itineraryStore.deleteDay('d3');
    expect(itineraryStore.trip()!.days).toHaveLength(1);
    expect(itineraryStore.selectedDayIndex()).toBe(1);

    // Last remaining day must not be deleted.
    await itineraryStore.deleteDay('d1');
    expect(itineraryStore.trip()!.days).toHaveLength(1);
  });

  it('ExpenseStore recalculates summary totals and categories immediately on updateExpense', async () => {
    const expenseStore = TestBed.inject(ExpenseStore);
    await expenseStore.loadExpenses('trip-1');
    expect(expenseStore.summary()?.total_home_amount).toBe('215.00');

    await expenseStore.updateExpense('trip-1', 'exp-1', {
      title: 'Matcha Gift',
      category: 'SHOPPING',
      amount_original: 2000,
      exchange_rate: 0.22,
      trip_day_id: 'd2',
    });

    const summary = expenseStore.summary()!;
    expect(summary.total_home_amount).toBe('440.00');
    expect(summary.by_category).toEqual({ SHOPPING: '440.00' });
    expect(summary.items[0].title).toBe('Matcha Gift');
    expect(summary.items[0].trip_day_id).toBe('d2');
  });
});
