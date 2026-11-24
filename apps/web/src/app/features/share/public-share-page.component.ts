import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem, PublicTrip } from '../../core/models/tripilot.models';
import { ItineraryCardComponent } from '../itinerary/itinerary-card.component';
import {
  ItineraryMapComponent,
  MapPin,
  StayMapPin,
} from '../itinerary/itinerary-map.component';
import { MobileMapSheetComponent } from '../itinerary/mobile-map-sheet.component';

/** Standalone read-only public itinerary view (/s/:shareToken) matching live app UI. */
@Component({
  selector: 'app-public-share-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    ItineraryCardComponent,
    ItineraryMapComponent,
    MobileMapSheetComponent,
  ],
  template: `
    @if (trip(); as publicTrip) {
      <div class="share-layout">
        <section class="timeline-pane">
          <div class="sticky-share-top">
            <header class="share-header">
              <div class="share-head-meta">
                <span class="badge">{{ 'share.publicBadge' | t }}</span>
                <span class="dates tabular-nums">
                  {{ publicTrip.start_date }} — {{ publicTrip.end_date }}
                </span>
              </div>
              <h1 class="share-title">{{ publicTrip.title }}</h1>
            </header>

            <div class="day-strip" role="tablist">
              @for (day of publicTrip.days; track day.id) {
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="selectedDayIndex() === day.day_index"
                  class="day-chip tabular-nums"
                  [class.active]="selectedDayIndex() === day.day_index"
                  (click)="selectDay(day.day_index)"
                >
                  <span class="day-num">Day {{ day.day_index }}</span>
                  <span class="day-date">{{ day.date.slice(5) }}</span>
                </button>
              }
            </div>
          </div>

          <div class="timeline-scroll">
            @if (selectedDay(); as day) {
              @if (day.title) {
                <div class="day-theme-bar">
                  <span class="ms-icon sm theme-ico" aria-hidden="true">flag</span>
                  <span class="day-theme-text">{{ day.title }}</span>
                </div>
              }

              @if (day.options.length > 1) {
                <div class="plan-pills">
                  @for (opt of day.options; track opt.id) {
                    <button
                      type="button"
                      class="plan-pill"
                      [class.selected]="selectedOption()?.id === opt.id"
                      (click)="selectOption(day.id, opt.id)"
                    >
                      @if (day.active_option_id === opt.id) {
                        <span class="active-dot" aria-hidden="true"></span>
                      }
                      <span>{{ opt.label }}</span>
                    </button>
                  }
                </div>
              }

              @if (activeItems().length === 0) {
                <div class="empty-day">{{ 'itinerary.emptyDay' | t }}</div>
              } @else {
                <div class="timeline">
                  @for (item of activeItems(); track item.id) {
                    <app-itinerary-card
                      [item]="item"
                      [pinOrder]="pinOrderById().get(item.id) ?? null"
                      [selected]="selectedItemId() === item.id"
                      [readOnly]="true"
                      (cardClicked)="selectedItemId.set($event)"
                    />
                  }
                </div>
              }
            }
          </div>
        </section>

        <aside class="desktop-map-pane">
          <app-itinerary-map
            [pins]="mapPins()"
            [routePath]="mapRoutePath()"
            [departureStayPin]="departureStayMapPin()"
            [stayPin]="stayMapPin()"
            [connectFromStay]="connectFromStay()"
            [connectToStay]="connectToStay()"
            [selectedPinId]="selectedItemId()"
            (pinSelected)="selectedItemId.set($event)"
          />
        </aside>
      </div>

      @if (!mobileMapOpen() && (mapPins().length > 0 || stayMapPin() || departureStayMapPin())) {
        <button
          type="button"
          class="mobile-map-fab"
          (click)="mobileMapOpen.set(true)"
        >
          <span class="ms-icon sm fab-ico" aria-hidden="true">map</span>
          <span>{{ 'map.openSheet' | t }}</span>
        </button>
      }

      @if (mobileMapOpen()) {
        <app-mobile-map-sheet
          [dayLabel]="selectedDayLabel()"
          [readOnly]="true"
          [pins]="mapPins()"
          [routePath]="mapRoutePath()"
          [departureStayPin]="departureStayMapPin()"
          [stayPin]="stayMapPin()"
          [connectFromStay]="connectFromStay()"
          [connectToStay]="connectToStay()"
          [selectedPinId]="selectedItemId()"
          [selectedItem]="selectedMapItem()"
          [selectedPinOrder]="selectedMapItem() ? (pinOrderById().get(selectedMapItem()!.id) ?? null) : null"
          (pinSelected)="selectedItemId.set($event)"
          (clearSelection)="selectedItemId.set(null)"
          (closed)="mobileMapOpen.set(false)"
        />
      }
    } @else if (error()) {
      <div class="state-wrap">
        <p class="empty-day">{{ error() }}</p>
      </div>
    } @else {
      <div class="state-wrap">
        <p class="empty-day">{{ 'common.loading' | t }}</p>
      </div>
    }
  `,
  styles: `
    .share-layout {
      display: grid;
      grid-template-columns: 1fr;
      min-height: calc(100dvh - 54px);
    }
    .timeline-pane {
      display: flex;
      flex-direction: column;
      min-width: 0;
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
    }
    .sticky-share-top {
      position: sticky;
      top: 54px;
      z-index: 20;
      padding: var(--space-3) var(--space-4) var(--space-2);
      background: rgba(248, 247, 244, 0.94);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--color-border);
    }
    .share-header {
      margin-bottom: var(--space-3);
    }
    .share-head-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 4px;
    }
    .badge {
      display: inline-block;
      padding: 2px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
      font-size: var(--text-badge);
      font-weight: 600;
    }
    .dates {
      font-size: var(--text-card-meta);
      color: var(--color-text-muted);
    }
    .share-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.35rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .day-strip {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding: 2px 0;
    }
    .day-strip::-webkit-scrollbar {
      display: none;
    }
    .day-chip {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 70px;
      padding: 7px 13px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
    .day-chip.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .day-num {
      font-weight: 600;
      font-size: 0.85rem;
    }
    .day-date {
      font-size: 0.7rem;
      opacity: 0.8;
    }
    .timeline-scroll {
      padding: var(--space-4) var(--space-4) 96px;
    }
    .day-theme-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin-bottom: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
    }
    .theme-ico {
      color: var(--color-accent);
      flex-shrink: 0;
    }
    .day-theme-text {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .plan-pills {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px;
      margin-bottom: var(--space-3);
      background: var(--color-surface-muted);
      border-radius: var(--radius-pill);
    }
    .plan-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
    }
    .plan-pill.selected {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: var(--shadow-card);
    }
    .active-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--color-accent);
    }
    .timeline {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .empty-day {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
    }
    .state-wrap {
      max-width: 720px;
      margin: 0 auto;
      padding: var(--space-5) var(--space-4);
    }
    .desktop-map-pane {
      display: none;
    }
    .mobile-map-fab {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: calc(env(safe-area-inset-bottom) + 18px);
      z-index: 35;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(20, 29, 46, 0.3);
      cursor: pointer;
    }
    .fab-ico {
      color: var(--color-accent);
    }
    @media (min-width: 1024px) {
      .mobile-map-fab {
        display: none;
      }
      .share-layout {
        grid-template-columns: minmax(440px, 46%) 1fr;
        height: calc(100dvh - 54px);
      }
      .timeline-pane {
        max-width: none;
        height: calc(100dvh - 54px);
        overflow: hidden;
      }
      .sticky-share-top {
        position: static;
        padding: var(--space-4) var(--space-5) var(--space-3);
      }
      .timeline-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--space-4) var(--space-5) var(--space-6);
      }
      .desktop-map-pane {
        display: block;
        padding: var(--space-4) var(--space-4) var(--space-4) 0;
        height: calc(100dvh - 54px);
        position: sticky;
        top: 54px;
      }
    }
  `,
})
export class PublicSharePageComponent implements OnInit {
  private readonly api = inject(TripilotApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly trip = signal<PublicTrip | null>(null);
  protected readonly selectedDayIndex = signal(1);
  protected readonly previewOptionByDay = signal<Record<string, string>>({});
  protected readonly selectedItemId = signal<string | null>(null);
  protected readonly mobileMapOpen = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedDay = computed(() => {
    const t = this.trip();
    if (!t || t.days.length === 0) return null;
    return t.days.find((d) => d.day_index === this.selectedDayIndex()) ?? t.days[0];
  });

  protected readonly selectedDayLabel = computed(() => {
    const d = this.selectedDay();
    return d ? `Day ${d.day_index} · ${d.date.slice(5)}` : '';
  });

  protected readonly selectedOption = computed(() => {
    const day = this.selectedDay();
    if (!day || day.options.length === 0) return null;
    const previewId = this.previewOptionByDay()[day.id];
    return (
      day.options.find((o) => o.id === previewId) ??
      day.options.find((o) => o.id === day.active_option_id) ??
      day.options[0]
    );
  });

  protected readonly activeItems = computed<ItineraryItem[]>(() => {
    const opt = this.selectedOption();
    return opt ? opt.items.filter((i) => i.is_selected) : [];
  });

  protected readonly departureStay = computed<ItineraryItem | null>(() => {
    const t = this.trip();
    const currentDay = this.selectedDay();
    if (!t || !currentDay) return null;
    let prev: ItineraryItem | null = null;
    for (const day of t.days) {
      if (day.day_index >= currentDay.day_index) break;
      const opt = day.options.find((o) => o.id === day.active_option_id) ?? day.options[0];
      if (!opt) continue;
      for (const item of opt.items) {
        if (item.is_selected && item.type === 'STAY' && item.latitude !== null && item.longitude !== null) {
          prev = item;
        }
      }
    }
    return prev;
  });

  protected readonly arrivalStay = computed<ItineraryItem | null>(() => {
    let latest: ItineraryItem | null = this.departureStay();
    for (const item of this.activeItems()) {
      if (item.type === 'STAY' && item.latitude !== null && item.longitude !== null) {
        latest = item;
      }
    }
    return latest;
  });

  protected readonly departureStayMapPin = computed<StayMapPin | null>(() => {
    const stay = this.departureStay();
    if (!stay || stay.latitude === null || stay.longitude === null) return null;
    return { id: stay.id, title: stay.title, lat: stay.latitude, lng: stay.longitude };
  });

  protected readonly stayMapPin = computed<StayMapPin | null>(() => {
    const stay = this.arrivalStay();
    if (!stay || stay.latitude === null || stay.longitude === null) return null;
    return { id: stay.id, title: stay.title, lat: stay.latitude, lng: stay.longitude };
  });

  protected readonly connectFromStay = computed(() => {
    const items = this.activeItems();
    return items.length > 0 && items[0].type !== 'FLIGHT';
  });

  protected readonly connectToStay = computed(() => {
    const items = this.activeItems();
    return items.length > 0 && items[items.length - 1].type !== 'FLIGHT';
  });

  protected readonly mapRoutePath = computed<[number, number][]>(() =>
    this.activeItems()
      .filter((i) => i.latitude !== null && i.longitude !== null)
      .map((i): [number, number] => [i.longitude!, i.latitude!]),
  );

  protected readonly mapPins = computed<MapPin[]>(() => {
    const basecampId = this.stayMapPin()?.id;
    const pins: MapPin[] = [];
    let order = 1;
    for (const item of this.activeItems()) {
      if (item.id === basecampId || item.type === 'STAY') continue;
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
  });

  protected readonly pinOrderById = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const pin of this.mapPins()) {
      if (pin.order > 0) map.set(pin.id, pin.order);
    }
    return map;
  });

  protected readonly selectedMapItem = computed<ItineraryItem | null>(() => {
    const id = this.selectedItemId();
    if (!id) return null;
    const hit = this.activeItems().find((i) => i.id === id);
    if (hit) return hit;
    const stay = this.arrivalStay();
    if (stay && stay.id === id) return stay;
    const dep = this.departureStay();
    return dep && dep.id === id ? dep : null;
  });

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('shareToken') ?? '';
    if (!token) {
      this.error.set('Invalid share link.');
      return;
    }
    try {
      const data = await this.api.getPublicTrip(token);
      this.trip.set(data);
      this.selectedDayIndex.set(data.days[0]?.day_index ?? 1);
    } catch {
      this.error.set('Share link not found or revoked.');
    }
  }

  protected selectDay(dayIndex: number): void {
    this.selectedDayIndex.set(dayIndex);
    this.selectedItemId.set(null);
  }

  protected selectOption(dayId: string, optionId: string): void {
    this.previewOptionByDay.update((curr) => ({ ...curr, [dayId]: optionId }));
    this.selectedItemId.set(null);
  }
}
