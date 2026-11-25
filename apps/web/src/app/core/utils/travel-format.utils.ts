import { COORDINATE_EPSILON, MAX_AIRPORT_GROUND_LEG_KM } from '../constants/app-limits';
import {
  DayOption,
  ExpenseCategory,
  ItemAttachment,
  ItemType,
  ItineraryItem,
  RouteSegment,
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

/** Format a 1-based day index as zero-padded editorial chapter numeral (e.g. 01). */
export function formatDayNumber(dayIndex: number): string {
  return String(dayIndex).padStart(2, '0');
}

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

const TIME_HH_MM_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function parseTimeSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = TIME_HH_MM_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] !== undefined ? Number(match[3]) : 0;
  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Insert a created item while keeping choice-group alternatives attached and
 * mirroring backend chronological placement for primary items without mutating inputs.
 */
export function appendCreatedItem(
  items: readonly ItineraryItem[],
  created: ItineraryItem,
  alternativeForId?: string | null,
): ItineraryItem[] {
  const isAlternative =
    Boolean(alternativeForId) ||
    (!created.is_selected &&
      Boolean(created.choice_group_id) &&
      items.some((it) => it.choice_group_id === created.choice_group_id));

  if (isAlternative) {
    const anchor = alternativeForId
      ? items.find((it) => it.id === alternativeForId)
      : undefined;
    const resolvedGroupId = created.choice_group_id ?? anchor?.choice_group_id ?? null;

    const updated =
      alternativeForId && resolvedGroupId
        ? items.map((it) =>
            it.id === alternativeForId ? { ...it, choice_group_id: resolvedGroupId } : it,
          )
        : [...items];

    const altCopy: ItineraryItem = {
      ...created,
      ...(resolvedGroupId ? { choice_group_id: resolvedGroupId } : {}),
    };

    let insertAfterIdx = -1;
    for (let i = 0; i < updated.length; i++) {
      if (
        (resolvedGroupId && updated[i].choice_group_id === resolvedGroupId) ||
        (alternativeForId && updated[i].id === alternativeForId)
      ) {
        insertAfterIdx = i;
      }
    }
    if (insertAfterIdx < 0) {
      return [...updated, altCopy];
    }
    return [
      ...updated.slice(0, insertAfterIdx + 1),
      altCopy,
      ...updated.slice(insertAfterIdx + 1),
    ];
  }

  // Group into slots so existing alternative items travel with their primary slot.
  const slots = groupItemsIntoSlots(items);
  const primaryCount = slots.length;
  const hasServerSortOrder =
    Number.isInteger(created.sort_order) &&
    created.sort_order >= 0 &&
    created.sort_order <= primaryCount;

  let insertSlotIdx: number;
  if (hasServerSortOrder) {
    insertSlotIdx = created.sort_order;
  } else {
    const createdSeconds = parseTimeSeconds(created.start_time);
    if (createdSeconds === null) {
      insertSlotIdx = primaryCount;
    } else {
      let firstLaterIdx = -1;
      let lastTimedIdx = -1;
      for (let i = 0; i < slots.length; i++) {
        const slotSeconds = parseTimeSeconds(slots[i].activeItem.start_time);
        if (slotSeconds !== null) {
          lastTimedIdx = i;
          if (firstLaterIdx === -1 && slotSeconds > createdSeconds) {
            firstLaterIdx = i;
          }
        }
      }
      insertSlotIdx =
        firstLaterIdx !== -1
          ? firstLaterIdx
          : lastTimedIdx !== -1
            ? lastTimedIdx + 1
            : primaryCount;
    }
  }

  const createdCopy: ItineraryItem = { ...created, sort_order: insertSlotIdx };
  const result: ItineraryItem[] = [];
  for (let i = 0; i < insertSlotIdx; i++) {
    for (const choice of slots[i].choices) {
      result.push({ ...choice, sort_order: i });
    }
  }
  result.push(createdCopy);
  for (let i = insertSlotIdx; i < slots.length; i++) {
    const nextSlotOrder = i + 1;
    for (const choice of slots[i].choices) {
      result.push({ ...choice, sort_order: nextSlotOrder });
    }
  }
  return result;
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

const USD_REFERENCE_RATES: Record<string, number> = {
  USD: 1,
  TWD: 32.5,
  JPY: 154,
  KRW: 1390,
  EUR: 0.94,
  CNY: 7.24,
  GBP: 0.79,
  THB: 34.5,
  SGD: 1.34,
  HKD: 7.78,
  CHF: 0.88,
  AUD: 1.53,
  CAD: 1.39,
  VND: 25400,
  IDR: 15800,
  MYR: 4.45,
  PHP: 58,
};

/** Round FX rates to 4 decimals (or 4 sig figs for micro-currencies like VND/IDR). */
export function roundFxRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    return 1;
  }
  return rate >= 0.01 ? Number(rate.toFixed(4)) : Number(rate.toPrecision(4));
}

/** Estimate an approximate cross-rate when both live FX and cached rates are unavailable. */
export function estimateOfflineFxRate(fromCurrency: string, toCurrency: string): number | null {
  const src = fromCurrency.trim().toUpperCase();
  const dst = toCurrency.trim().toUpperCase();
  if (!src || !dst) {
    return null;
  }
  if (src === dst) {
    return 1;
  }
  const srcPerUsd = USD_REFERENCE_RATES[src];
  const dstPerUsd = USD_REFERENCE_RATES[dst];
  if (!srcPerUsd || !dstPerUsd) {
    return null;
  }
  return roundFxRate(dstPerUsd / srcPerUsd);
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

/** Decode a Google Encoded Polyline (1e-5 precision) into GeoJSON [lng, lat] pairs. */
export function decodePolyline(encoded: string): [number, number][] {
  if (!encoded) {
    return [];
  }
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      if (index >= encoded.length) {
        return [];
      }
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0) {
        return [];
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      if (index >= encoded.length) {
        return [];
      }
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0) {
        return [];
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    const latDeg = lat / 1e5;
    const lngDeg = lng / 1e5;
    if (!Number.isFinite(latDeg) || !Number.isFinite(lngDeg)) {
      return [];
    }
    coords.push([lngDeg, latDeg]);
  }
  return coords;
}

function appendUniquePoint(coords: [number, number][], point: [number, number]): void {
  const prev = coords[coords.length - 1];
  if (prev && prev[0] === point[0] && prev[1] === point[1]) {
    return;
  }
  coords.push(point);
}

export type MapRouteMode = 'schematic' | 'road';

export interface DayMapRoutes {
  mainLegs: [number, number][][];
  stayLegs: [number, number][][];
  expectedPairs: string[];
}

export const EMPTY_DAY_MAP_ROUTES: DayMapRoutes = {
  mainLegs: [],
  stayLegs: [],
  expectedPairs: [],
};

function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusKm = 6371.0088;
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const dPhi = (lat2 - lat1) * toRad;
  const dLambda = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function appendSegmentCoords(
  target: [number, number][],
  points: readonly [number, number][],
): void {
  for (const pt of points) {
    appendUniquePoint(target, pt);
  }
}

/** Generate a subtle quadratic Bezier curve between two [lng, lat] points using local cos(lat) scaling. */
export function buildSchematicCurve(
  from: [number, number],
  to: [number, number],
  steps = 24,
): [number, number][] {
  const midLng = (from[0] + to[0]) / 2;
  const midLat = (from[1] + to[1]) / 2;
  const cosLat = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const dx = (to[0] - from[0]) * cosLat;
  const dy = to[1] - from[1];
  if (Math.hypot(dx, dy) < 1e-6) {
    return [from, to];
  }

  const offset = 0.14;
  const ctrlLng = midLng + (-dy * offset) / cosLat;
  const ctrlLat = midLat + dx * offset;
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const omt = 1 - t;
    points.push([
      omt * omt * from[0] + 2 * omt * t * ctrlLng + t * t * to[0],
      omt * omt * from[1] + 2 * omt * t * ctrlLat + t * t * to[1],
    ]);
  }
  return points;
}

/** Build Overview curved or Driving road polylines for daily stops, airport transfers, and stay legs. */
export function buildDayMapRoutes(
  items: readonly ItineraryItem[],
  routeSegments: readonly RouteSegment[] = [],
  mode: MapRouteMode = 'schematic',
  departureStay: ItineraryItem | null = null,
  arrivalStay: ItineraryItem | null = null,
): DayMapRoutes {
  const geolocated = items
    .filter((item) => item.latitude !== null && item.longitude !== null)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Keep explicit STAY items in chronological sort_order so Flight -> Hotel -> Dinner renders in sequence.
  const stops = geolocated.filter((item) => item.type !== 'LOCAL_TRANSIT');
  const explicitStays = geolocated.filter((item) => item.type === 'STAY');
  const effectiveDepartureStay =
    departureStay && departureStay.latitude !== null && departureStay.longitude !== null
      ? departureStay
      : null;
  const effectiveArrivalStay =
    arrivalStay && arrivalStay.latitude !== null && arrivalStay.longitude !== null
      ? arrivalStay
      : (explicitStays[explicitStays.length - 1] ?? effectiveDepartureStay);

  const resolveFlightRole = (
    item: ItineraryItem,
    idxInStops: number | null,
  ): 'ARRIVAL' | 'DEPARTURE' => {
    const raw = item.details['airport_role'];
    if (raw === 'ARRIVAL' || raw === 'DEPARTURE') {
      return raw;
    }
    if (idxInStops !== null) {
      if (idxInStops + 1 < stops.length) {
        const nxt = stops[idxInStops + 1];
        if (
          nxt.type !== 'FLIGHT' &&
          haversineDistanceKm(item.latitude!, item.longitude!, nxt.latitude!, nxt.longitude!) <=
            MAX_AIRPORT_GROUND_LEG_KM
        ) {
          return 'ARRIVAL';
        }
      }
      if (idxInStops > 0) {
        const prv = stops[idxInStops - 1];
        if (
          prv.type !== 'FLIGHT' &&
          haversineDistanceKm(prv.latitude!, prv.longitude!, item.latitude!, item.longitude!) <=
            MAX_AIRPORT_GROUND_LEG_KM
        ) {
          return 'DEPARTURE';
        }
      }
    }
    if (explicitStays.length > 0) {
      return 'ARRIVAL';
    }
    if (effectiveDepartureStay !== null) {
      return 'DEPARTURE';
    }
    return 'ARRIVAL';
  };

  const isValidLeg = (
    a: ItineraryItem,
    b: ItineraryItem,
    aIdx: number | null,
    bIdx: number | null,
  ): boolean => {
    if (a.id === b.id) {
      return false;
    }
    if (
      Math.abs(a.latitude! - b.latitude!) < COORDINATE_EPSILON &&
      Math.abs(a.longitude! - b.longitude!) < COORDINATE_EPSILON
    ) {
      return false;
    }
    if (a.type === 'FLIGHT' && b.type === 'FLIGHT') {
      return false;
    }
    if (a.type === 'FLIGHT') {
      if (resolveFlightRole(a, aIdx) === 'DEPARTURE') {
        return false;
      }
      if (
        haversineDistanceKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!) >
        MAX_AIRPORT_GROUND_LEG_KM
      ) {
        return false;
      }
    }
    if (b.type === 'FLIGHT') {
      if (resolveFlightRole(b, bIdx) === 'ARRIVAL') {
        return false;
      }
      if (
        haversineDistanceKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!) >
        MAX_AIRPORT_GROUND_LEG_KM
      ) {
        return false;
      }
    }
    return true;
  };

  const segmentsByPair = new Map<string, RouteSegment>();
  if (mode === 'road') {
    for (const seg of routeSegments) {
      segmentsByPair.set(`${seg.from_item_id}->${seg.to_item_id}`, seg);
    }
  }

  const buildLegCoords = (a: ItineraryItem, b: ItineraryItem): [number, number][] => {
    const from: [number, number] = [a.longitude!, a.latitude!];
    const to: [number, number] = [b.longitude!, b.latitude!];
    if (mode === 'schematic') {
      return buildSchematicCurve(from, to);
    }
    const seg = segmentsByPair.get(`${a.id}->${b.id}`);
    const decoded = seg?.geometry_polyline ? decodePolyline(seg.geometry_polyline) : [];
    return decoded.length >= 2 ? decoded : [from, to];
  };

  const mainLegs: [number, number][][] = [];
  const stayLegs: [number, number][][] = [];
  const expectedPairs: string[] = [];
  const seenPairs = new Set<string>();

  const recordPair = (key: string): boolean => {
    if (seenPairs.has(key)) {
      return false;
    }
    seenPairs.add(key);
    expectedPairs.push(key);
    return true;
  };

  if (stops.length > 0) {
    if (effectiveDepartureStay && isValidLeg(effectiveDepartureStay, stops[0], null, 0)) {
      const key = `${effectiveDepartureStay.id}->${stops[0].id}`;
      if (recordPair(key)) {
        stayLegs.push(buildLegCoords(effectiveDepartureStay, stops[0]));
      }
    }

    let currentLine: [number, number][] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (!isValidLeg(a, b, i, i + 1)) {
        if (currentLine.length >= 2) {
          mainLegs.push(currentLine);
        }
        currentLine = [];
        continue;
      }
      const key = `${a.id}->${b.id}`;
      if (recordPair(key)) {
        appendSegmentCoords(currentLine, buildLegCoords(a, b));
      }
    }
    if (currentLine.length >= 2) {
      mainLegs.push(currentLine);
    }

    const lastIdx = stops.length - 1;
    const lastStop = stops[lastIdx];
    if (effectiveArrivalStay && isValidLeg(lastStop, effectiveArrivalStay, lastIdx, null)) {
      const key = `${lastStop.id}->${effectiveArrivalStay.id}`;
      if (recordPair(key)) {
        stayLegs.push(buildLegCoords(lastStop, effectiveArrivalStay));
      }
    }
  } else if (
    effectiveDepartureStay &&
    effectiveArrivalStay &&
    isValidLeg(effectiveDepartureStay, effectiveArrivalStay, null, null)
  ) {
    const key = `${effectiveDepartureStay.id}->${effectiveArrivalStay.id}`;
    if (recordPair(key)) {
      stayLegs.push(buildLegCoords(effectiveDepartureStay, effectiveArrivalStay));
    }
  }

  return { mainLegs, stayLegs, expectedPairs };
}

/** Build flat ground route [lng, lat] coordinates as Overview curves or cached road polylines. */
export function buildMapRoutePath(
  items: readonly ItineraryItem[],
  routeSegments: readonly RouteSegment[] = [],
  mode: MapRouteMode = 'schematic',
): [number, number][] {
  const { mainLegs } = buildDayMapRoutes(items, routeSegments, mode);
  const coords: [number, number][] = [];
  for (const line of mainLegs) {
    appendSegmentCoords(coords, line);
  }
  return coords;
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
