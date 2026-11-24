import { TestBed } from '@angular/core/testing';

import { OfflineCacheService } from '../cache/offline-cache.service';
import { ItineraryItem } from '../models/tripilot.models';
import {
  addDaysToIsoDate,
  appendCreatedItem,
  buildDayMapPins,
  buildDayMapRoutes,
  buildGoogleMapsUrl,
  buildMapRoutePath,
  buildPinOrderMap,
  decodePolyline,
  estimateOfflineFxRate,
  extractItemAttachments,
  groupItemsIntoSlots,
  removeItemWithChoicePromotion,
  roundFxRate,
} from './travel-format.utils';

function makeItem(overrides: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: 'item-1',
    day_option_id: 'opt-1',
    type: 'SPOT',
    sort_order: 0,
    title: 'Test Spot',
    start_time: null,
    end_time: null,
    timezone: null,
    address: null,
    latitude: null,
    longitude: null,
    google_maps_url: null,
    notes: null,
    details: {},
    choice_group_id: null,
    is_selected: true,
    ...overrides,
  };
}

describe('travel-format.utils', () => {
  it('computes calendar end dates in local time without UTC drift', () => {
    expect(addDaysToIsoDate('2026-12-05', 3)).toBe('2026-12-08');
    expect(addDaysToIsoDate('2026-12-30', 2)).toBe('2027-01-01');
  });

  it('filters out non-HTTP(S) URLs from attachments and maps links', () => {
    const attachments = extractItemAttachments({
      attachments: [
        { name: 'Valid', url: 'https://drive.google.com/file/d/123/view' },
        { name: 'XSS', url: 'javascript:alert(1)' },
        { name: 'Data', url: 'data:text/html,<script>' },
      ],
    });
    expect(attachments).toEqual([
      { name: 'Valid', url: 'https://drive.google.com/file/d/123/view' },
    ]);

    const fallbackUrl = buildGoogleMapsUrl(
      makeItem({
        google_maps_url: 'javascript:alert(1)',
        latitude: 35.6812,
        longitude: 139.7671,
      }),
    );
    expect(fallbackUrl).toBe('https://www.google.com/maps/search/?api=1&query=35.6812,139.7671');
  });

  it('groups choice-group items in a single pass while preserving order', () => {
    const items: ItineraryItem[] = [
      makeItem({ id: 'a1', title: 'Morning Shrine', sort_order: 0 }),
      makeItem({
        id: 'l1',
        title: 'Lunch A',
        sort_order: 1,
        choice_group_id: 'g-lunch',
        is_selected: false,
      }),
      makeItem({
        id: 'l2',
        title: 'Lunch B',
        sort_order: 1,
        choice_group_id: 'g-lunch',
        is_selected: true,
      }),
      makeItem({ id: 'd1', title: 'Dinner', sort_order: 2 }),
    ];

    const slots = groupItemsIntoSlots(items);
    expect(slots).toHaveLength(3);
    expect(slots[1].key).toBe('g-lunch');
    expect(slots[1].activeItem.id).toBe('l2');
    expect(slots[1].choices.map((c) => c.id)).toEqual(['l1', 'l2']);
  });

  it('propagates choice_group_id onto the anchor item when adding a slot alternative', () => {
    const anchor = makeItem({ id: 'anchor-1', title: 'Ramen A', choice_group_id: null });
    const alt = makeItem({
      id: 'alt-1',
      title: 'Ramen B',
      choice_group_id: 'group-ramen',
      is_selected: false,
    });

    const patched = appendCreatedItem([anchor], alt, 'anchor-1');
    const slots = groupItemsIntoSlots(patched);

    expect(slots).toHaveLength(1);
    expect(slots[0].key).toBe('group-ramen');
    expect(slots[0].activeItem.id).toBe('anchor-1');
    expect(slots[0].choices.map((c) => c.id)).toEqual(['anchor-1', 'alt-1']);
  });

  it('inserts server-placed primary items at sort_order and shifts subsequent items without mutation', () => {
    const morning = makeItem({ id: 'm', title: 'Shrine', start_time: '09:00', sort_order: 0 });
    const dinner = makeItem({ id: 'd', title: 'Dinner', start_time: '18:00', sort_order: 1 });
    const lunch = makeItem({ id: 'l', title: 'Lunch', start_time: '12:00', sort_order: 1 });

    const result = appendCreatedItem([morning, dinner], lunch);
    expect(result.map((it) => ({ id: it.id, sort_order: it.sort_order }))).toEqual([
      { id: 'm', sort_order: 0 },
      { id: 'l', sort_order: 1 },
      { id: 'd', sort_order: 2 },
    ]);
    // Input items must remain unmutated.
    expect(dinner.sort_order).toBe(1);
  });

  it('computes chronological slots (first_later, last_timed + 1, append) when optimistic/unsorted', () => {
    const morning = makeItem({ id: 'm', start_time: '09:00', sort_order: 0 });
    const afternoon = makeItem({ id: 'a', start_time: '15:00', sort_order: 1 });
    const untimed = makeItem({ id: 'u', start_time: null, sort_order: 2 });

    // Before first_later_idx (15:00 > 12:00)
    const noon = makeItem({ id: 'noon', start_time: '12:00', sort_order: -1 });
    const withNoon = appendCreatedItem([morning, afternoon, untimed], noon);
    expect(withNoon.map((it) => ({ id: it.id, sort_order: it.sort_order }))).toEqual([
      { id: 'm', sort_order: 0 },
      { id: 'noon', sort_order: 1 },
      { id: 'a', sort_order: 2 },
      { id: 'u', sort_order: 3 },
    ]);

    // Tie preserves existing order and inserts before later timed item (15:00)
    const sameMorning = makeItem({ id: 'm2', start_time: '09:00', sort_order: 99 });
    const withTie = appendCreatedItem([morning, afternoon, untimed], sameMorning);
    expect(withTie.map((it) => it.id)).toEqual(['m', 'm2', 'a', 'u']);

    // After last_timed_idx + 1 (before trailing untimed items)
    const evening = makeItem({ id: 'e', start_time: '19:30', sort_order: -1 });
    const withEvening = appendCreatedItem([morning, afternoon, untimed], evening);
    expect(withEvening.map((it) => ({ id: it.id, sort_order: it.sort_order }))).toEqual([
      { id: 'm', sort_order: 0 },
      { id: 'a', sort_order: 1 },
      { id: 'e', sort_order: 2 },
      { id: 'u', sort_order: 3 },
    ]);

    // Appends at primaryCount when item is untimed or no timed items exist
    const untimedNew = makeItem({ id: 'u2', start_time: null, sort_order: -1 });
    const withUntimed = appendCreatedItem([morning, afternoon, untimed], untimedNew);
    expect(withUntimed.map((it) => ({ id: it.id, sort_order: it.sort_order }))).toEqual([
      { id: 'm', sort_order: 0 },
      { id: 'a', sort_order: 1 },
      { id: 'u', sort_order: 2 },
      { id: 'u2', sort_order: 3 },
    ]);

    const singleUntimed = makeItem({ id: 'u', start_time: null, sort_order: 0 });
    const timedOnUntimedDay = makeItem({ id: 't1', start_time: '10:00', sort_order: -1 });
    const withOnlyUntimed = appendCreatedItem([singleUntimed], timedOnUntimedDay);
    expect(withOnlyUntimed.map((it) => ({ id: it.id, sort_order: it.sort_order }))).toEqual([
      { id: 'u', sort_order: 0 },
      { id: 't1', sort_order: 1 },
    ]);
  });

  it('keeps slot alternatives attached safely without shifting primary order', () => {
    const morning = makeItem({ id: 'm', start_time: '09:00', sort_order: 0 });
    const lunchA = makeItem({
      id: 'l1',
      start_time: '12:00',
      sort_order: 1,
      choice_group_id: 'g-lunch',
      is_selected: true,
    });
    const lunchB = makeItem({
      id: 'l2',
      start_time: '12:30',
      sort_order: 1,
      choice_group_id: 'g-lunch',
      is_selected: false,
    });
    const dinner = makeItem({ id: 'd', start_time: '19:00', sort_order: 2 });

    // Adding a third alternative to g-lunch keeps primary order [0, 1, 2] intact.
    const lunchC = makeItem({
      id: 'l3',
      start_time: '12:15',
      sort_order: 1,
      choice_group_id: 'g-lunch',
      is_selected: false,
    });
    const withAlt = appendCreatedItem([morning, lunchA, lunchB, dinner], lunchC, 'l1');
    expect(withAlt.map((it) => ({ id: it.id, sort_order: it.sort_order }))).toEqual([
      { id: 'm', sort_order: 0 },
      { id: 'l1', sort_order: 1 },
      { id: 'l2', sort_order: 1 },
      { id: 'l3', sort_order: 1 },
      { id: 'd', sort_order: 2 },
    ]);

    // Inserting a primary item before g-lunch shifts g-lunch and dinner cleanly.
    const cafe = makeItem({ id: 'c', start_time: '10:30', sort_order: -1 });
    const withPrimary = appendCreatedItem([morning, lunchA, lunchB, dinner], cafe);
    expect(withPrimary.map((it) => ({ id: it.id, sort_order: it.sort_order }))).toEqual([
      { id: 'm', sort_order: 0 },
      { id: 'c', sort_order: 1 },
      { id: 'l1', sort_order: 2 },
      { id: 'l2', sort_order: 2 },
      { id: 'd', sort_order: 3 },
    ]);
  });

  it('promotes the first remaining sibling when deleting the selected choice item', () => {
    const firstAlt = makeItem({
      id: 'alt-1',
      title: 'Ramen A',
      choice_group_id: 'group-ramen',
      is_selected: true,
    });
    const secondAlt = makeItem({
      id: 'alt-2',
      title: 'Ramen B',
      choice_group_id: 'group-ramen',
      is_selected: false,
    });

    const remaining = removeItemWithChoicePromotion([firstAlt, secondAlt], 'alt-1');

    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('alt-2');
    expect(remaining[0].is_selected).toBe(true);
  });

  it('rounds FX rates to 4 decimals while preserving precision for micro-currencies', () => {
    expect(roundFxRate(0.215432)).toBe(0.2154);
    expect(roundFxRate(0.00003937)).toBe(0.00003937);
    expect(roundFxRate(0)).toBe(1);
    expect(roundFxRate(Number.NaN)).toBe(1);
  });

  it('estimates approximate offline cross-rates and returns null for unknown codes', () => {
    expect(estimateOfflineFxRate('JPY', 'JPY')).toBe(1);
    const jpyToTwd = estimateOfflineFxRate('JPY', 'TWD');
    expect(jpyToTwd).not.toBeNull();
    expect(jpyToTwd!).toBeGreaterThan(0.15);
    expect(jpyToTwd!).toBeLessThan(0.3);
    expect(estimateOfflineFxRate('XXX', 'TWD')).toBeNull();
  });

  it('builds ordered map pins and pinOrder map skipping STAY items', () => {
    const items: ItineraryItem[] = [
      makeItem({ id: 'flt-1', type: 'FLIGHT', title: 'CI130', latitude: 43.0, longitude: 141.3 }),
      makeItem({ id: 'stay-1', type: 'STAY', title: 'Hotel A', latitude: 43.06, longitude: 141.35 }),
      makeItem({ id: 'spot-1', type: 'SPOT', title: 'Park', latitude: 43.07, longitude: 141.34 }),
      makeItem({ id: 'food-1', type: 'FOOD', title: 'Soup Curry', latitude: 43.05, longitude: 141.36 }),
    ];

    const pins = buildDayMapPins(items, 'stay-1');
    expect(pins.map((p) => ({ id: p.id, order: p.order }))).toEqual([
      { id: 'flt-1', order: 0 },
      { id: 'spot-1', order: 1 },
      { id: 'food-1', order: 2 },
    ]);

    const orderMap = buildPinOrderMap(pins);
    expect(orderMap.get('flt-1')).toBeUndefined();
    expect(orderMap.get('spot-1')).toBe(1);
    expect(orderMap.get('food-1')).toBe(2);
  });

  it('clears SWR cache and FX rate keys on sign-out cleanup', () => {
    localStorage.setItem('tripilot.swr.trips', '[]');
    localStorage.setItem('tripilot.fxRate.JPY', '0.215');
    localStorage.setItem('tripilot.locale', 'zh-TW');

    const cache = TestBed.inject(OfflineCacheService);
    cache.clearAll();

    expect(localStorage.getItem('tripilot.swr.trips')).toBeNull();
    expect(localStorage.getItem('tripilot.fxRate.JPY')).toBeNull();
    expect(localStorage.getItem('tripilot.locale')).toBe('zh-TW');
  });

  it('decodes Google encoded polylines into [lng, lat] coordinates', () => {
    const coords = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(coords).toHaveLength(3);
    expect(coords[0][0]).toBeCloseTo(-120.2, 5);
    expect(coords[0][1]).toBeCloseTo(38.5, 5);
    expect(coords[2][0]).toBeCloseTo(-126.453, 3);
    expect(coords[2][1]).toBeCloseTo(43.252, 3);
    expect(decodePolyline('')).toEqual([]);
  });

  it('builds map route path using cached OSRM polylines and excludes flights', () => {
    const items: ItineraryItem[] = [
      makeItem({ id: 'flt-1', type: 'FLIGHT', latitude: 35.5494, longitude: 139.7798 }),
      makeItem({ id: 'spot-1', type: 'SPOT', latitude: 38.5, longitude: -120.2 }),
      makeItem({ id: 'food-1', type: 'FOOD', latitude: 43.252, longitude: -126.453 }),
      makeItem({ id: 'spot-2', type: 'SPOT', latitude: 44.0, longitude: -127.0 }),
    ];
    const segments = [
      {
        id: 'seg-1',
        from_item_id: 'spot-1',
        to_item_id: 'food-1',
        profile: 'DRIVING',
        distance_km: 12.4,
        duration_min: 20,
        geometry_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        is_approx: false,
      },
    ];

    const roadPath = buildMapRoutePath(items, segments, 'road');
    // Uses 3 decoded points from seg-1 (excluding flight), then deduplicates join point before spot-2.
    expect(roadPath).toHaveLength(4);
    expect(roadPath[0][0]).toBeCloseTo(-120.2, 5);
    expect(roadPath[1][0]).toBeCloseTo(-120.95, 5);
    expect(roadPath[2][0]).toBeCloseTo(-126.453, 3);
    expect(roadPath[3]).toEqual([-127.0, 44.0]);

    const schematicPath = buildMapRoutePath(items, segments);
    // Default schematic mode draws smooth editorial Bezier curves independent of OSRM polylines.
    expect(schematicPath.length).toBeGreaterThan(20);
    expect(schematicPath[0]).toEqual([-120.2, 38.5]);
    expect(schematicPath[schematicPath.length - 1]).toEqual([-127.0, 44.0]);
    const mid = schematicPath[12];
    expect(mid[1]).not.toBeCloseTo((38.5 + 43.252) / 2, 2);
  });

  it('connects airport transfers and curved/road basecamp stay legs including single-stop days', () => {
    const arrivalFlight = makeItem({
      id: 'flt-arr',
      type: 'FLIGHT',
      sort_order: 0,
      latitude: 35.772,
      longitude: 140.3929,
      details: { origin_iata: 'TPE', dest_iata: 'NRT', airport_role: 'ARRIVAL' },
    });
    const stay = makeItem({
      id: 'stay-1',
      type: 'STAY',
      sort_order: 1,
      latitude: 35.6909,
      longitude: 139.7003,
    });
    const dinner = makeItem({
      id: 'food-dinner',
      type: 'FOOD',
      sort_order: 2,
      latitude: 35.6938,
      longitude: 139.7034,
    });
    const day1Overview = buildDayMapRoutes(
      [arrivalFlight, stay, dinner],
      [],
      'schematic',
      null,
      stay,
    );
    // Flight -> Hotel -> Dinner follows chronological order in mainLegs, then returns to Hotel in stayLegs.
    expect(day1Overview.mainLegs).toHaveLength(1);
    expect(day1Overview.mainLegs[0].length).toBeGreaterThan(40);
    expect(day1Overview.stayLegs).toHaveLength(1);
    expect(day1Overview.expectedPairs).toEqual([
      'flt-arr->stay-1',
      'stay-1->food-dinner',
      'food-dinner->stay-1',
    ]);

    const fuji = makeItem({
      id: 'spot-fuji',
      type: 'SPOT',
      sort_order: 0,
      latitude: 35.3606,
      longitude: 138.7274,
    });
    const singleOverview = buildDayMapRoutes([fuji], [], 'schematic', stay, stay);
    expect(singleOverview.mainLegs).toHaveLength(0);
    expect(singleOverview.stayLegs).toHaveLength(2);
    expect(singleOverview.expectedPairs).toEqual(['stay-1->spot-fuji', 'spot-fuji->stay-1']);
    // Outbound and return Bezier curves should bow to opposite sides of the chord.
    expect(singleOverview.stayLegs[0][12][1]).not.toBeCloseTo(
      singleOverview.stayLegs[1][12][1],
      3,
    );

    const singleRoad = buildDayMapRoutes(
      [fuji],
      [
        {
          id: 'seg-a',
          from_item_id: 'stay-1',
          to_item_id: 'spot-fuji',
          profile: 'DRIVING',
          distance_km: 110,
          duration_min: 100,
          geometry_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          is_approx: false,
        },
      ],
      'road',
      stay,
      stay,
    );
    expect(singleRoad.stayLegs[0]).toHaveLength(3);
    expect(singleRoad.stayLegs[1]).toHaveLength(2);

    const depFlight = makeItem({
      id: 'flt-dep',
      type: 'FLIGHT',
      sort_order: 1,
      latitude: 35.772,
      longitude: 140.3929,
      details: { origin_iata: 'NRT', dest_iata: 'TPE', airport_role: 'DEPARTURE' },
    });
    const ueno = makeItem({
      id: 'spot-ueno',
      type: 'SPOT',
      sort_order: 0,
      latitude: 35.7148,
      longitude: 139.7745,
    });
    const lastDay = buildDayMapRoutes([ueno, depFlight], [], 'schematic', stay, stay);
    expect(lastDay.stayLegs).toHaveLength(1);
    expect(lastDay.mainLegs).toHaveLength(1);
    expect(lastDay.expectedPairs).toEqual(['stay-1->spot-ueno', 'spot-ueno->flt-dep']);
  });
});
