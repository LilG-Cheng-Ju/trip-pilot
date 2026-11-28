import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { DAY_STRIP_SCROLL_STEP_PX } from '../../core/constants/app-limits';
import { resolveCountryMapCenter } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem, PublicTrip } from '../../core/models/tripilot.models';
import { ViewportService } from '../../core/utils/viewport.service';
import {
  buildDayMapPins,
  buildDayMapRoutes,
  buildPinOrderMap,
  DayMapRoutes,
  formatDateWithWeekday,
  groupItemsIntoSlots,
  ItinerarySlot,
  toStayMapPin,
} from '../../core/utils/travel-format.utils';
import { ItineraryCardComponent } from '../itinerary/itinerary-card.component';
import { ItineraryMapComponent } from '../itinerary/itinerary-map.component';
import { MapPin, StayMapPin } from '../itinerary/itinerary-map.types';
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
              <div class="share-title-row">
                <h1 class="share-title">{{ publicTrip.title }}</h1>
                <button type="button" class="lang-btn" (click)="i18n.toggleLocale()">
                  {{ i18n.locale() === 'en' ? '繁中' : 'EN' }}
                </button>
              </div>
              <div class="share-meta-row">
                <span class="badge">
                  <span class="ms-icon badge-ico" aria-hidden="true">visibility</span>
                  <span>{{ 'share.publicBadge' | t }}</span>
                </span>
                <span class="dates tabular-nums">
                  {{ publicTrip.start_date }} — {{ publicTrip.end_date }}
                </span>
              </div>
            </header>

            <div class="day-strip-wrap">
              <button
                type="button"
                class="day-scroll-btn"
                [attr.aria-label]="'itinerary.dayScrollLeft' | t"
                (click)="scrollDayStrip(-dayStripScrollStepPx)"
              >
                <span class="ms-icon sm" aria-hidden="true">chevron_left</span>
              </button>

              <div
                #dayStrip
                class="day-strip"
                role="tablist"
                (wheel)="onDayStripWheel($event)"
              >
                @for (day of publicTrip.days; track day.id) {
                  <button
                    type="button"
                    role="tab"
                    [attr.aria-selected]="selectedDayIndex() === day.day_index"
                    class="day-chip tabular-nums"
                    [class.active]="selectedDayIndex() === day.day_index"
                    (click)="selectDay(day.day_index, $event)"
                  >
                    <span class="day-num">Day {{ day.day_index }}</span>
                    <span class="day-date">{{ day.date.slice(5) }}</span>
                  </button>
                }
              </div>

              <button
                type="button"
                class="day-scroll-btn"
                [attr.aria-label]="'itinerary.dayScrollRight' | t"
                (click)="scrollDayStrip(dayStripScrollStepPx)"
              >
                <span class="ms-icon sm" aria-hidden="true">chevron_right</span>
              </button>
            </div>
          </div>

          <div #timelineScroll class="timeline-scroll">
            @if (selectedDay(); as day) {
              <div class="day-chapter">
                <div class="day-chapter-kicker">
                  <span class="chapter-num font-display-italic">Day {{ day.day_index }}</span>
                  <span class="chapter-rule" aria-hidden="true"></span>
                  <span class="chapter-date tabular-nums">
                    {{ formatDateWithWeekday(day.date, i18n.locale()) }}
                  </span>
                </div>
                @if (day.title) {
                  <h2 class="day-chapter-title font-display">{{ day.title }}</h2>
                }
              </div>

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

              @if (selectedOption(); as opt) {
                @if (timelineSlots().length > 0) {
                  <div class="share-summary tabular-nums">
                    <span>{{ 'itinerary.summary.stops' | t: { count: stopCount() } }}</span>
                    @if (opt.cached_ground_distance_km > 0) {
                      <span>
                        · {{ opt.cached_distance_is_approx ? '~' : '' }}{{ opt.cached_ground_distance_km }} km
                      </span>
                    }
                  </div>
                }
              }

              @if (timelineSlots().length === 0) {
                <div class="empty-state">{{ 'itinerary.emptyDay' | t }}</div>
              } @else {
                <div class="timeline">
                  @for (slot of timelineSlots(); track slot.key) {
                    <div
                      class="slot-group"
                      [class.has-choices]="slot.choices.length > 1"
                      [attr.data-slot-item-id]="slot.activeItem.id"
                    >
                      @if (slot.choices.length > 1) {
                        <div class="choice-pills">
                          @for (choice of slot.choices; track choice.id) {
                            <button
                              type="button"
                              class="choice-pill"
                              [class.active]="choice.id === slot.activeItem.id"
                              (click)="selectChoicePreview(slot.key, choice.id)"
                            >
                              @if (choice.id === slot.activeItem.id) {
                                <span class="choice-dot" aria-hidden="true"></span>
                              }
                              <span>{{ choice.title }}</span>
                            </button>
                          }
                        </div>
                      }

                      <app-itinerary-card
                        [item]="slot.activeItem"
                        [pinOrder]="pinOrderById().get(slot.activeItem.id) ?? null"
                        [selected]="selectedItemId() === slot.activeItem.id"
                        [readOnly]="true"
                        (cardClicked)="selectedItemId.set($event)"
                      />
                    </div>
                  }
                </div>
              }
            }
          </div>
        </section>

        @if (viewport.isDesktop()) {
          <aside class="desktop-map-pane">
            @defer (when viewport.isDesktop()) {
              <app-itinerary-map
                [pins]="mapPins()"
                [schematicRoutes]="schematicMapRoutes()"
                [departureStayPin]="departureStayMapPin()"
                [stayPin]="stayMapPin()"
                [selectedPinId]="selectedItemId()"
                [fallbackCenter]="tripMapCenter()"
                (pinSelected)="onMapPinSelected($event)"
              />
            } @placeholder {
              <div class="map-defer-state">
                <span class="ms-icon lg spin" aria-hidden="true">progress_activity</span>
                <p>{{ 'map.loading' | t }}</p>
              </div>
            } @loading (after 100ms; minimum 250ms) {
              <div class="map-defer-state">
                <span class="ms-icon lg spin" aria-hidden="true">progress_activity</span>
                <p>{{ 'map.loading' | t }}</p>
              </div>
            } @error {
              <div class="map-defer-state is-error" role="alert">
                <span class="ms-icon lg" aria-hidden="true">wifi_off</span>
                <p>{{ 'map.loadError' | t }}</p>
              </div>
            }
          </aside>
        }
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

      @if (!viewport.isDesktop()) {
        @defer (when mobileMapOpen()) {
          <app-mobile-map-sheet
            [open]="mobileMapOpen()"
            [dayLabel]="selectedDayLabel()"
            [readOnly]="true"
            [hasBottomNav]="false"
            [fallbackCenter]="tripMapCenter()"
            [pins]="mapPins()"
            [schematicRoutes]="schematicMapRoutes()"
            [departureStayPin]="departureStayMapPin()"
            [stayPin]="stayMapPin()"
            [selectedPinId]="selectedItemId()"
            [selectedItem]="selectedMapItem()"
            [selectedPinOrder]="selectedMapItem() ? (pinOrderById().get(selectedMapItem()!.id) ?? null) : null"
            (pinSelected)="onMapPinSelected($event)"
            (clearSelection)="selectedItemId.set(null)"
            (closed)="mobileMapOpen.set(false)"
          />
        } @loading (after 100ms; minimum 250ms) {
          <div class="map-defer-sheet no-bottom-nav" role="status" aria-live="polite">
            <div class="map-defer-bar">
              <span class="map-defer-title tabular-nums">{{ selectedDayLabel() }}</span>
              <button
                type="button"
                class="map-defer-close"
                (click)="mobileMapOpen.set(false)"
              >
                <span class="ms-icon sm" aria-hidden="true">close</span>
                <span>{{ 'map.closeSheet' | t }}</span>
              </button>
            </div>
            <div class="map-defer-state">
              <span class="ms-icon lg spin" aria-hidden="true">progress_activity</span>
              <p>{{ 'map.loading' | t }}</p>
            </div>
          </div>
        } @error {
          <div class="map-defer-sheet no-bottom-nav" role="alert">
            <div class="map-defer-bar">
              <span class="map-defer-title tabular-nums">{{ selectedDayLabel() }}</span>
              <button
                type="button"
                class="map-defer-close"
                (click)="mobileMapOpen.set(false)"
              >
                <span class="ms-icon sm" aria-hidden="true">close</span>
                <span>{{ 'map.closeSheet' | t }}</span>
              </button>
            </div>
            <div class="map-defer-state is-error">
              <span class="ms-icon lg" aria-hidden="true">wifi_off</span>
              <p>{{ 'map.loadError' | t }}</p>
            </div>
          </div>
        }
      }
    } @else if (errorKey(); as errKey) {
      <div class="state-wrap">
        <p class="empty-state">{{ errKey | t }}</p>
      </div>
    } @else {
      <div class="state-wrap">
        <p class="empty-state">{{ 'common.loading' | t }}</p>
      </div>
    }
  `,
  styles: `
    .share-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      min-height: 100dvh;
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
      top: 0;
      z-index: 25;
      flex-shrink: 0;
      min-width: 0;
      max-width: 100%;
      padding: 8px var(--space-3) 7px;
      background: var(--color-surface-glass);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--color-border);
    }
    .share-header {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-bottom: 7px;
    }
    .share-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .share-title {
      margin: 0;
      flex: 1;
      min-width: 0;
      font-family: var(--font-display);
      font-size: 1.08rem;
      line-height: 1.22;
      font-weight: 600;
      color: var(--color-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lang-btn {
      position: relative;
      flex-shrink: 0;
      padding: 2px 9px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
    }
    .lang-btn::after {
      content: '';
      position: absolute;
      inset: -6px -4px;
    }
    .share-meta-row {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      white-space: nowrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 7px;
      border-radius: var(--radius-xs);
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
      font-size: 0.68rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .badge-ico {
      font-size: 12px;
    }
    .dates {
      font-size: 0.73rem;
      color: var(--color-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .timeline-scroll {
      padding: 10px var(--space-3) calc(84px + env(safe-area-inset-bottom, 0px));
    }
    .day-chapter {
      min-width: 0;
      padding: 2px 0 7px;
      margin-bottom: 10px;
      border-bottom: 1px solid var(--color-border);
    }
    .day-chapter-kicker {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 26px;
    }
    .chapter-num {
      color: var(--color-accent);
      font-size: 0.98rem;
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;
    }
    .chapter-rule {
      width: 14px;
      height: 1px;
      background: var(--color-accent-border);
      transform: translateY(-0.28em);
      flex-shrink: 0;
    }
    .chapter-date {
      font-size: 0.8125rem;
      font-weight: 500;
      line-height: 1.2;
      color: var(--color-text-secondary);
      white-space: nowrap;
    }
    .day-chapter-title {
      margin: 4px 0 0;
      font-size: 1.32rem;
      font-weight: 600;
      line-height: 1.26;
      color: var(--color-primary);
      overflow-wrap: anywhere;
    }
    .plan-pills {
      display: flex;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      gap: 2px;
      margin-bottom: var(--space-3);
      border-bottom: 1px solid var(--color-border);
    }
    .plan-pills::-webkit-scrollbar {
      display: none;
    }
    .plan-pill {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 10px;
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: var(--radius-xs) var(--radius-xs) 0 0;
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      margin-bottom: -1px;
      transition: color 140ms ease, border-color 140ms ease;
    }
    .plan-pill:hover:not(.selected) {
      color: var(--color-primary);
    }
    .plan-pill.selected {
      color: var(--color-primary);
      border-bottom-color: var(--color-accent);
    }
    .active-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--color-accent);
    }
    .share-summary {
      margin: 0 0 8px;
      font-size: 0.76rem;
      font-weight: 500;
      color: var(--color-text-muted);
    }
    .timeline {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .slot-group.has-choices {
      padding-left: 10px;
      border-left: 2px solid var(--color-accent-border);
    }
    .choice-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }
    .choice-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 9px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: var(--color-surface-alt);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
    }
    .choice-pill:hover:not(.active) {
      background: var(--color-surface-muted);
      color: var(--color-primary);
    }
    .choice-pill.active {
      border-color: var(--color-accent-border);
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
    }
    .choice-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-accent);
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
      bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
      z-index: 35;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(20, 29, 46, 0.3);
      cursor: pointer;
    }
    .fab-ico {
      color: var(--color-accent);
    }
    @media (min-width: 768px) {
      .sticky-share-top {
        padding: var(--space-3) var(--space-4) var(--space-2);
      }
      .share-header {
        gap: 4px;
        margin-bottom: var(--space-3);
      }
      .share-title {
        font-size: 1.32rem;
        white-space: normal;
      }
      .timeline-scroll {
        padding: var(--space-4) var(--space-4) 96px;
      }
      .share-summary {
        margin: 0 0 var(--space-3);
        font-size: 0.78rem;
      }
    }
    @media (min-width: 1024px) {
      .mobile-map-fab {
        display: none;
      }
      .share-layout {
        grid-template-columns: minmax(440px, 46%) minmax(0, 1fr);
        height: 100dvh;
      }
      .timeline-pane {
        max-width: none;
        height: 100dvh;
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
        height: 100dvh;
        position: sticky;
        top: 0;
      }
    }
  `,
})
export class PublicSharePageComponent implements OnInit {
  private readonly api = inject(TripilotApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly i18n = inject(I18nService);
  protected readonly viewport = inject(ViewportService);

  private readonly dayStrip = viewChild<ElementRef<HTMLDivElement>>('dayStrip');
  private readonly timelineScroll = viewChild<ElementRef<HTMLDivElement>>('timelineScroll');

  protected readonly trip = signal<PublicTrip | null>(null);
  protected readonly tripMapCenter = computed<readonly [number, number]>(() =>
    resolveCountryMapCenter(this.trip()?.country_codes ?? []),
  );
  protected readonly selectedDayIndex = signal(1);
  protected readonly previewOptionByDay = signal<Record<string, string>>({});
  protected readonly previewChoiceByGroup = signal<Record<string, string>>({});
  protected readonly selectedItemId = signal<string | null>(null);
  protected readonly mobileMapOpen = signal(false);
  protected readonly errorKey = signal<'share.errInvalid' | 'share.errNotFound' | null>(null);

  protected readonly dayStripScrollStepPx = DAY_STRIP_SCROLL_STEP_PX;
  protected readonly formatDateWithWeekday = formatDateWithWeekday;
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

  protected readonly timelineSlots = computed<ItinerarySlot[]>(() => {
    const opt = this.selectedOption();
    const publicTrip = this.trip();
    if (!opt) return [];
    const includeBackups = Boolean(publicTrip?.visibility_policy.include_backup_options);
    const visibleItems = includeBackups ? opt.items : opt.items.filter((i) => i.is_selected);
    const previewChoices = this.previewChoiceByGroup();
    return groupItemsIntoSlots(visibleItems).map((slot) => {
      const overrideId = previewChoices[slot.key];
      const overrideItem = overrideId
        ? slot.choices.find((c) => c.id === overrideId)
        : undefined;
      return overrideItem ? { ...slot, activeItem: overrideItem } : slot;
    });
  });

  protected readonly activeItems = computed<ItineraryItem[]>(() =>
    this.timelineSlots().map((slot) => slot.activeItem),
  );

  protected readonly stopCount = computed(
    () => this.activeItems().filter((item) => item.type !== 'LOCAL_TRANSIT').length,
  );

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

  protected readonly departureStayMapPin = computed<StayMapPin | null>(() =>
    toStayMapPin(this.departureStay()),
  );

  protected readonly stayMapPin = computed<StayMapPin | null>(() =>
    toStayMapPin(this.arrivalStay()),
  );

  // Public share stays lightweight: editorial Bezier curves render client-side with zero road geometry payload.
  protected readonly schematicMapRoutes = computed<DayMapRoutes>(() =>
    buildDayMapRoutes(
      this.activeItems(),
      [],
      'schematic',
      this.departureStay(),
      this.arrivalStay(),
    ),
  );

  protected readonly mapPins = computed<MapPin[]>(() =>
    buildDayMapPins(this.activeItems(), this.stayMapPin()?.id),
  );

  protected readonly pinOrderById = computed<Map<string, number>>(() =>
    buildPinOrderMap(this.mapPins()),
  );

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
      this.errorKey.set('share.errInvalid');
      return;
    }
    try {
      const data = await this.api.getPublicTrip(token);
      this.trip.set(data);
      this.selectedDayIndex.set(data.days[0]?.day_index ?? 1);
    } catch {
      this.errorKey.set('share.errNotFound');
    }
  }

  protected scrollDayStrip(deltaPx: number): void {
    const el = this.dayStrip()?.nativeElement;
    if (el) {
      el.scrollBy({ left: deltaPx, behavior: 'smooth' });
    }
  }

  protected onDayStripWheel(event: WheelEvent): void {
    const el = this.dayStrip()?.nativeElement;
    if (!el || el.scrollWidth <= el.clientWidth) {
      return;
    }
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    }
  }

  protected selectDay(dayIndex: number, event?: Event): void {
    this.selectedDayIndex.set(dayIndex);
    this.selectedItemId.set(null);
    (event?.currentTarget as HTMLElement | null)?.scrollIntoView({
      behavior: 'smooth',
      inline: 'nearest',
      block: 'nearest',
    });
  }

  protected selectOption(dayId: string, optionId: string): void {
    this.previewOptionByDay.update((curr) => ({ ...curr, [dayId]: optionId }));
    this.selectedItemId.set(null);
  }

  protected selectChoicePreview(slotKey: string, choiceId: string): void {
    this.previewChoiceByGroup.update((curr) => ({ ...curr, [slotKey]: choiceId }));
    this.selectedItemId.set(null);
  }

  protected onMapPinSelected(itemId: string): void {
    this.selectedItemId.set(itemId);
    const container = this.timelineScroll()?.nativeElement;
    if (!container) {
      return;
    }
    const target = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot-item-id]'),
    ).find((el) => el.getAttribute('data-slot-item-id') === itemId);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}
