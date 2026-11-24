import {
  DayOption,
  ExpenseCategory,
  ItemAttachment,
  ItemType,
  ItineraryItem,
  TripDay,
} from '../models/tripilot.models';

export interface ItinerarySlot {
  key: string;
  activeItem: ItineraryItem;
  choices: ItineraryItem[];
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'FOOD',
  'TRANSIT',
  'LODGING',
  'FLIGHT',
  'ACTIVITY',
  'SHOPPING',
  'OTHER',
];

export type ExpenseCategoryTranslationKey =
  | 'expenses.cat.FLIGHT'
  | 'expenses.cat.LODGING'
  | 'expenses.cat.TRANSIT'
  | 'expenses.cat.FOOD'
  | 'expenses.cat.ACTIVITY'
  | 'expenses.cat.SHOPPING'
  | 'expenses.cat.OTHER';

const HTTP_URL_RE = /^https?:\/\//i;

/** Return the typed i18n key for an expense category. */
export function expenseCategoryKey(cat: ExpenseCategory): ExpenseCategoryTranslationKey {
  return `expenses.cat.${cat}`;
}

/** Map an itinerary item type to its default expense category. */
export function mapItemTypeToExpenseCategory(type: ItemType): ExpenseCategory {
  switch (type) {
    case 'FLIGHT':
      return 'FLIGHT';
    case 'STAY':
      return 'LODGING';
    case 'RESERVED_TRANSIT':
    case 'LOCAL_TRANSIT':
      return 'TRANSIT';
    case 'FOOD':
      return 'FOOD';
    case 'SPOT':
    default:
      return 'ACTIVITY';
  }
}

/** Safely extract valid HTTP(S) cloud attachment links from an item's details JSON. */
export function extractItemAttachments(
  details?: Record<string, unknown> | null,
  fallbackName?: (url: string) => string,
): ItemAttachment[] {
  const raw = details?.['attachments'];
  if (!Array.isArray(raw)) {
    return [];
  }
  const results: ItemAttachment[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const rawUrl = (entry as ItemAttachment).url;
    if (typeof rawUrl !== 'string') {
      continue;
    }
    const cleanUrl = rawUrl.trim();
    if (!HTTP_URL_RE.test(cleanUrl)) {
      continue;
    }
    const rawName = (entry as ItemAttachment).name;
    const cleanName =
      typeof rawName === 'string' && rawName.trim()
        ? rawName.trim()
        : (fallbackName?.(cleanUrl) ?? 'Attachment');
    results.push({ name: cleanName, url: cleanUrl });
  }
  return results;
}

/** Read a non-empty string field from an itinerary item's details dictionary. */
export function getItemDetailString(
  details: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const val = details?.[key];
  return val === undefined || val === null || val === '' ? null : String(val);
}

/** Build a safe Google Maps navigation URL from stored link, coordinates, or address. */
export function buildGoogleMapsUrl(
  item: Pick<ItineraryItem, 'google_maps_url' | 'latitude' | 'longitude' | 'address'>,
): string | null {
  const stored = item.google_maps_url?.trim();
  if (stored && HTTP_URL_RE.test(stored)) {
    return stored;
  }
  if (item.latitude !== null && item.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`;
  }
  if (item.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`;
  }
  return null;
}

/** Group itinerary items by choice_group_id into single-pass timeline slots. */
export function groupItemsIntoSlots(items: readonly ItineraryItem[]): ItinerarySlot[] {
  const slots: ItinerarySlot[] = [];
  const slotsByGroup = new Map<string, ItinerarySlot>();

  for (const item of items) {
    if (!item.choice_group_id) {
      slots.push({ key: item.id, activeItem: item, choices: [item] });
      continue;
    }
    let existing = slotsByGroup.get(item.choice_group_id);
    if (!existing) {
      existing = {
        key: item.choice_group_id,
        activeItem: item,
        choices: [],
      };
      slotsByGroup.set(item.choice_group_id, existing);
      slots.push(existing);
    }
    existing.choices.push(item);
    if (item.is_selected) {
      existing.activeItem = item;
    }
  }
  return slots;
}

/** Format a local calendar Date as YYYY-MM-DD without UTC timezone shifting. */
export function formatLocalIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Add calendar days to a YYYY-MM-DD string in local time without UTC drift. */
export function addDaysToIsoDate(isoDate: string, daysOffset: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return isoDate;
  }
  const [year, month, day] = parts;
  const local = new Date(year, month - 1, day + daysOffset);
  return formatLocalIsoDate(local);
}

/** Return the active DayOption for a TripDay (falling back to the first option). */
export function getActiveDayOption(day: TripDay): DayOption | null {
  return day.options.find((o) => o.id === day.active_option_id) ?? day.options[0] ?? null;
}

/** Return selected itinerary items from a day's active option. */
export function getSelectedDayItems(day: TripDay): ItineraryItem[] {
  const opt = getActiveDayOption(day);
  if (!opt) {
    return [];
  }
  return opt.items.filter((item) => item.is_selected);
}

/** Return the selected item's sibling group updated when appending a newly created alternative. */
export function appendCreatedItem(
  items: readonly ItineraryItem[],
  created: ItineraryItem,
  alternativeForId?: string | null,
): ItineraryItem[] {
  const updated =
    alternativeForId && created.choice_group_id
      ? items.map((it) =>
          it.id === alternativeForId
            ? { ...it, choice_group_id: created.choice_group_id }
            : it,
        )
      : [...items];
  return [...updated, created];
}

/** Remove an item and promote the first remaining sibling when the active choice is deleted. */
export function removeItemWithChoicePromotion(
  items: readonly ItineraryItem[],
  deletedItemId: string,
): ItineraryItem[] {
  const deleted = items.find((it) => it.id === deletedItemId);
  const remaining = items.filter((it) => it.id !== deletedItemId);
  if (!deleted?.choice_group_id || !deleted.is_selected) {
    return remaining;
  }
  const hasSelectedSibling = remaining.some(
    (it) => it.choice_group_id === deleted.choice_group_id && it.is_selected,
  );
  if (hasSelectedSibling) {
    return remaining;
  }
  let promoted = false;
  return remaining.map((it) => {
    if (!promoted && it.choice_group_id === deleted.choice_group_id) {
      promoted = true;
      return { ...it, is_selected: true };
    }
    return it;
  });
}

export interface AnnotatedMapPin {
  id: string;
  order: number;
  title: string;
  lat: number;
  lng: number;
  type: ItemType;
}

export interface SimpleStayPin {
  id: string;
  title: string;
  lat: number;
  lng: number;
}

/** Round FX rates to 4 decimals (or 4 sig figs for micro-currencies like VND/IDR). */
export function roundFxRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    return 1;
  }
  return rate >= 0.01 ? Number(rate.toFixed(4)) : Number(rate.toPrecision(4));
}

/** Convert a geolocated STAY item into a map stay pin payload. */
export function toStayMapPin(stay: ItineraryItem | null): SimpleStayPin | null {
  if (!stay || stay.latitude === null || stay.longitude === null) {
    return null;
  }
  return {
    id: stay.id,
    title: stay.title,
    lat: stay.latitude,
    lng: stay.longitude,
  };
}

/** Build ordered non-STAY map pins from a day's selected itinerary items. */
export function buildDayMapPins(
  items: readonly ItineraryItem[],
  arrivalStayId?: string | null,
): AnnotatedMapPin[] {
  const pins: AnnotatedMapPin[] = [];
  let order = 1;
  for (const item of items) {
    if (item.id === arrivalStayId || item.type === 'STAY') {
      continue;
    }
    if (item.latitude !== null && item.longitude !== null) {
      pins.push({
        id: item.id,
        order: item.type === 'FLIGHT' ? 0 : order++,
        title: item.title,
        lat: item.latitude,
        lng: item.longitude,
        type: item.type,
      });
    }
  }
  return pins;
}

/** Index ordered map pin badges (excluding unnumbered pins) by itinerary item ID. */
export function buildPinOrderMap(
  pins: readonly { id: string; order: number }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const pin of pins) {
    if (pin.order > 0) {
      map.set(pin.id, pin.order);
    }
  }
  return map;
}

/** Extract chronological [lng, lat] coordinates across geolocated items. */
export function buildMapRoutePath(items: readonly ItineraryItem[]): [number, number][] {
  return items
    .filter((item) => item.latitude !== null && item.longitude !== null)
    .map((item): [number, number] => [item.longitude!, item.latitude!]);
}

/** Format a numeric or string amount cleanly with locale thousand separators. */
export function formatMoney(amount: number | string, maxFractionDigits = 0): string {
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    return String(amount);
  }
  return num.toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  });
}
