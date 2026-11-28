import { TranslationKey } from '../../core/i18n/messages.en';
import { ItemType } from '../../core/models/tripilot.models';

export interface ItemTypeMeta {
  type: ItemType;
  icon: string;
  labelKey: TranslationKey;
  color: string;
}

/** Canonical display order, icon, label, and accent color for all itinerary item types. */
export const ITEM_TYPE_OPTIONS: readonly ItemTypeMeta[] = [
  { type: 'SPOT', icon: 'location_on', labelKey: 'item.type.spot', color: 'var(--item-spot)' },
  { type: 'FOOD', icon: 'restaurant', labelKey: 'item.type.food', color: 'var(--item-food)' },
  { type: 'STAY', icon: 'hotel', labelKey: 'item.type.stay', color: 'var(--item-stay)' },
  { type: 'FLIGHT', icon: 'flight', labelKey: 'item.type.flight', color: 'var(--item-flight)' },
  {
    type: 'RESERVED_TRANSIT',
    icon: 'train',
    labelKey: 'item.type.reservedTransit',
    color: 'var(--item-reserved)',
  },
  {
    type: 'LOCAL_TRANSIT',
    icon: 'subway',
    labelKey: 'item.type.localTransit',
    color: 'var(--color-text-secondary)',
  },
];

/** Lookup metadata for a given itinerary item type, defaulting to SPOT. */
export function getItemTypeMeta(type: ItemType): ItemTypeMeta {
  return ITEM_TYPE_OPTIONS.find((opt) => opt.type === type) ?? ITEM_TYPE_OPTIONS[0];
}
