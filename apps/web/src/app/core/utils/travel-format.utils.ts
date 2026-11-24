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
