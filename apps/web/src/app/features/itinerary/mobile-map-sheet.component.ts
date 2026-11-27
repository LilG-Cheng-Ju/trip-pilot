import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { COPY_FEEDBACK_DURATION_MS } from '../../core/constants/app-limits';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem } from '../../core/models/tripilot.models';
import {
  buildGoogleMapsUrl,
  DayMapRoutes,
  EMPTY_DAY_MAP_ROUTES,
  getItemDetailString,
  MapRouteMode,
} from '../../core/utils/travel-format.utils';
import { ItineraryMapComponent } from './itinerary-map.component';
import { MapPin, StayMapPin } from './itinerary-map.types';

const SWIPE_CLOSE_THRESHOLD_PX = 84;

/** Mobile thumb-zone bottom sheet displaying the interactive map and floating spot preview card. */
@Component({
  selector: 'app-mobile-map-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ItineraryMapComponent],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <div
      class="mobile-map-sheet"
      [class.no-bottom-nav]="!hasBottomNav()"
      [class.dragging]="isDragging()"
      [class.is-closed]="!open()"
      [style.transform]="open() && dragOffsetY() > 0 ? 'translateY(' + dragOffsetY() + 'px)' : null"
      [attr.aria-hidden]="open() ? null : 'true'"
      [attr.inert]="open() ? null : ''"
      role="dialog"
      [attr.aria-label]="'map.openSheet' | t"
    >
      <div
        class="sheet-bar"
        (pointerdown)="onBarPointerDown($event)"
        (pointermove)="onBarPointerMove($event)"
        (pointerup)="onBarPointerEnd($event)"
        (pointercancel)="onBarPointerEnd($event)"
      >
        <span class="sheet-handle" aria-hidden="true"></span>
        <span class="sheet-title tabular-nums">
          @if (dayLabel()) {
            {{ dayLabel() }}
          }
        </span>
        <button
          type="button"
          class="sheet-close-btn"
          (click)="closed.emit()"
        >
          <span class="ms-icon sm" aria-hidden="true">close</span>
          <span>{{ 'map.closeSheet' | t }}</span>
        </button>
      </div>

      <div class="sheet-map-body">
        <app-itinerary-map
          [active]="open()"
          [pins]="pins()"
          [schematicRoutes]="schematicRoutes()"
          [roadRoutes]="roadRoutes()"
          [allowModeToggle]="allowModeToggle()"
          [routeMode]="routeMode()"
          (routeModeChange)="routeModeChange.emit($event)"
          [departureStayPin]="departureStayPin()"
          [stayPin]="stayPin()"
          [selectedPinId]="selectedPinId()"
          [fallbackCenter]="fallbackCenter()"
          (pinSelected)="pinSelected.emit($event)"
        />

        @if (selectedItem(); as spot) {
          <div class="map-mini-card" (click)="$event.stopPropagation()">
            <div class="mini-head">
              <div class="mini-title-row">
                @if (selectedPinOrder(); as num) {
                  <span class="mini-pin tabular-nums">{{ num }}</span>
                } @else if (spot.type === 'STAY') {
                  <span class="mini-pin stay">
                    <span class="ms-icon sm" aria-hidden="true">hotel</span>
                  </span>
                }
                <strong class="mini-title">{{ spot.title }}</strong>
              </div>
              <button
                type="button"
                class="mini-close"
                [attr.aria-label]="'common.cancel' | t"
                (click)="clearSelection.emit()"
              >
                <span class="ms-icon sm" aria-hidden="true">close</span>
              </button>
            </div>

            @if (spot.start_time || spot.address) {
              <p class="mini-meta tabular-nums">
                @if (spot.start_time) {
                  <span>
                    {{ spot.start_time }}@if (spot.end_time) { – {{ spot.end_time }} }
                  </span>
                }
                @if (spot.start_time && spot.address) { · }
                @if (spot.address) {
                  <span>{{ spot.address }}</span>
                }
              </p>
            }

            <div class="mini-actions">
              @if (mapsUrl(spot); as url) {
                <a
                  class="mini-btn primary"
                  [href]="url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="ms-icon sm" aria-hidden="true">near_me</span>
                  <span>{{ 'common.navigate' | t }}</span>
                </a>
              }
              @if (localName(spot); as loc) {
                <button
                  type="button"
                  class="mini-btn"
                  (click)="copyLocalName(loc)"
                >
                  <span class="ms-icon sm" aria-hidden="true">
                    {{ copiedLocal() ? 'check' : 'content_copy' }}
                  </span>
                  <span class="mini-truncate">
                    {{ copiedLocal() ? ('common.copied' | t) : loc }}
                  </span>
                </button>
              }
              @if (!readOnly()) {
                <button
                  type="button"
                  class="mini-btn accent"
                  (click)="logExpense.emit(spot)"
                >
                  <span class="ms-icon sm" aria-hidden="true">payments</span>
                  <span>{{ 'item.spendShort' | t }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .mobile-map-sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: calc(var(--nav-bottom-height) + env(safe-area-inset-bottom, 0px));
      height: 70dvh;
      z-index: 38;
      display: flex;
      flex-direction: column;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -10px 30px rgba(15, 23, 42, 0.22);
      overflow: hidden;
      transition:
        transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1),
        opacity 180ms ease,
        visibility 180ms ease;
      will-change: transform;
    }
    .mobile-map-sheet.dragging {
      transition: none;
    }
    .mobile-map-sheet.is-closed {
      transform: translateY(calc(100% + 120px));
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .mobile-map-sheet.no-bottom-nav {
      bottom: 0;
      height: 74dvh;
    }
    .sheet-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px 10px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      position: relative;
      touch-action: none;
      user-select: none;
      cursor: grab;
    }
    .sheet-bar:active {
      cursor: grabbing;
    }
    .sheet-handle {
      position: absolute;
      top: 5px;
      left: 50%;
      transform: translateX(-50%);
      width: 36px;
      height: 4px;
      border-radius: 99px;
      background: var(--color-border-strong);
    }
    .sheet-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .sheet-close-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 11px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }
    .sheet-map-body {
      position: relative;
      flex: 1;
      min-height: 0;
      padding: 8px;
    }
    .map-mini-card {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 16px;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-float);
    }
    .mobile-map-sheet.no-bottom-nav .map-mini-card {
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    }
    .mini-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .mini-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .mini-pin {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 999px;
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font-size: 0.72rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .mini-pin.stay {
      background: var(--color-accent);
    }
    .mini-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mini-close {
      position: relative;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 999px;
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .mini-close::after {
      content: '';
      position: absolute;
      inset: -6px;
    }
    .mini-meta {
      margin: 0;
      font-size: 0.78rem;
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mini-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 2px;
    }
    .mini-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 36px;
      padding: 6px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-primary);
      text-decoration: none;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
    }
    .mini-btn.primary {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font-weight: 600;
    }
    .mini-btn.accent {
      border-color: rgba(196, 146, 76, 0.45);
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
      font-weight: 600;
    }
    .mini-truncate {
      max-width: 110px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @media (min-width: 1024px) {
      .mobile-map-sheet {
        display: none;
      }
    }
  `,
})
export class MobileMapSheetComponent {
  readonly open = input(true);
  readonly dayLabel = input('');
  readonly readOnly = input(false);
  readonly hasBottomNav = input(true);
  readonly pins = input<MapPin[]>([]);
  readonly schematicRoutes = input<DayMapRoutes>(EMPTY_DAY_MAP_ROUTES);
  readonly roadRoutes = input<DayMapRoutes>(EMPTY_DAY_MAP_ROUTES);
  readonly allowModeToggle = input(false);
  readonly routeMode = input<MapRouteMode>('schematic');
  readonly departureStayPin = input<StayMapPin | null>(null);
  readonly stayPin = input<StayMapPin | null>(null);
  readonly selectedPinId = input<string | null>(null);
  readonly fallbackCenter = input<readonly [number, number]>([121.5654, 25.033]);
  readonly selectedItem = input<ItineraryItem | null>(null);
  readonly selectedPinOrder = input<number | null>(null);

  readonly pinSelected = output<string>();
  readonly routeModeChange = output<MapRouteMode>();
  readonly clearSelection = output<void>();
  readonly logExpense = output<ItineraryItem>();
  readonly closed = output<void>();

  protected readonly copiedLocal = signal(false);
  protected readonly dragOffsetY = signal(0);
  protected readonly isDragging = signal(false);

  private activePointerId: number | null = null;
  private dragStartY = 0;

  protected onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }

  protected onBarPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement | null)?.closest('button')) {
      return;
    }
    this.activePointerId = event.pointerId;
    this.dragStartY = event.clientY;
    this.isDragging.set(true);
    this.dragOffsetY.set(0);
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  protected onBarPointerMove(event: PointerEvent): void {
    if (!this.isDragging() || event.pointerId !== this.activePointerId) {
      return;
    }
    const deltaY = Math.max(0, event.clientY - this.dragStartY);
    this.dragOffsetY.set(deltaY);
  }

  protected onBarPointerEnd(event: PointerEvent): void {
    if (!this.isDragging() || event.pointerId !== this.activePointerId) {
      return;
    }
    (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
    const pulled = this.dragOffsetY();
    this.activePointerId = null;
    this.isDragging.set(false);
    this.dragOffsetY.set(0);
    if (pulled >= SWIPE_CLOSE_THRESHOLD_PX) {
      this.closed.emit();
    }
  }

  protected mapsUrl(item: ItineraryItem): string | null {
    return buildGoogleMapsUrl(item);
  }

  protected localName(item: ItineraryItem): string | null {
    return getItemDetailString(item.details, 'local_name');
  }

  protected async copyLocalName(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedLocal.set(true);
      setTimeout(() => this.copiedLocal.set(false), COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Ignore clipboard failures in restricted contexts.
    }
  }
}
