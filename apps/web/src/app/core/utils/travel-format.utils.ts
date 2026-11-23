import {
  DayOption,
  ExpenseCategory,
  ItemAttachment,
  ItemType,
  ItineraryItem,
  TripDay,
} from '../models/tripilot.models';

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

/** Safely extract valid cloud attachment links from an item's details JSON. */
export function extractItemAttachments(
  details?: Record<string, unknown> | null,
): ItemAttachment[] {
  const raw = details?.['attachments'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is ItemAttachment =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as ItemAttachment).url === 'string' &&
      (entry as ItemAttachment).url.trim().length > 0,
  );
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
