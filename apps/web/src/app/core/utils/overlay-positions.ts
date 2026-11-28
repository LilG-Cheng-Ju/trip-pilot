import { ConnectedPosition, Overlay, ScrollStrategy } from '@angular/cdk/overlay';
import { inject } from '@angular/core';

/** Preferred positions for compact overflow and account action menus. */
export const MENU_OVERLAY_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

/** Preferred positions for full-width form picker dropdowns. */
export const DROPDOWN_OVERLAY_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

/** Create a per-overlay close-on-scroll strategy so floating action menus dismiss on swipe/scroll. */
export function injectMenuCloseScrollStrategy(threshold = 10): ScrollStrategy {
  return inject(Overlay).scrollStrategies.close({ threshold });
}

/** Return true when a click originated inside the given origin element. */
export function isClickInsideElement(
  event: MouseEvent,
  element: HTMLElement | null | undefined,
): boolean {
  const target = event.target as Node | null;
  return Boolean(element && target && element.contains(target));
}
