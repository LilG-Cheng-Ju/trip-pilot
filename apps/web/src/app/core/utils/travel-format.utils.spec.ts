import { TestBed } from '@angular/core/testing';

import { OfflineCacheService } from '../cache/offline-cache.service';
import { ItineraryItem } from '../models/tripilot.models';
import {
  addDaysToIsoDate,
  appendCreatedItem,
  buildGoogleMapsUrl,
  extractItemAttachments,
  groupItemsIntoSlots,
  removeItemWithChoicePromotion,
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
});
