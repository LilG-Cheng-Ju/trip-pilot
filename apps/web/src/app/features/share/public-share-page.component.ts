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
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem, PublicTrip } from '../../core/models/tripilot.models';
import {
  buildDayMapPins,
  buildMapRoutePath,
  buildPinOrderMap,
  groupItemsIntoSlots,
  ItinerarySlot,
  toStayMapPin,
} from '../../core/utils/travel-format.utils';
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
                <div class="empty-day">{{ 'itinerary.emptyDay' | t }}</div>
              } @else {
                <div class="timeline">
                  @for (slot of timelineSlots(); track slot.key) {
                    <div class="slot-group" [class.has-choices]="slot.choices.length > 1">
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
    } @else if (errorKey(); as errKey) {
      <div class="state-wrap">
        <p class="empty-day">{{ errKey | t }}</p>
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
      background: rgba(247, 244, 239, 0.95);
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
      border-radius: var(--radius-pill);
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
      border-radius: var(--radius-pill);
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
      padding: 10px var(--space-3) 84px;
    }
    .day-theme-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      margin-bottom: 8px;
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
    }
    .theme-ico {
      color: var(--color-accent);
      flex-shrink: 0;
    }
    .day-theme-text {
      font-size: 0.82rem;
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
      padding: 8px;
      border-radius: var(--radius-md);
      background: rgba(200, 155, 91, 0.08);
      border: 1px solid rgba(200, 155, 91, 0.35);
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
      padding: 4px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .choice-pill.active {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .choice-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-accent);
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
      bottom: calc(env(safe-area-inset-bottom) + 14px);
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
      .day-theme-bar {
        padding: 8px 12px;
        margin-bottom: var(--space-3);
      }
      .day-theme-text {
        font-size: 0.875rem;
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

  private readonly dayStrip = viewChild<ElementRef<HTMLDivElement>>('dayStrip');
  protected readonly dayStripScrollStepPx = DAY_STRIP_SCROLL_STEP_PX;

  protected readonly trip = signal<PublicTrip | null>(null);
  protected readonly selectedDayIndex = signal(1);
  protected readonly previewOptionByDay = signal<Record<string, string>>({});
  protected readonly previewChoiceByGroup = signal<Record<string, string>>({});
  protected readonly selectedItemId = signal<string | null>(null);
  protected readonly mobileMapOpen = signal(false);
  protected readonly errorKey = signal<'share.errInvalid' | 'share.errNotFound' | null>(null);

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

  protected readonly connectFromStay = computed(() => {
    const items = this.activeItems();
    return items.length > 0 && items[0].type !== 'FLIGHT';
  });

  protected readonly connectToStay = computed(() => {
    const items = this.activeItems();
    return items.length > 0 && items[items.length - 1].type !== 'FLIGHT';
  });

  protected readonly mapRoutePath = computed<[number, number][]>(() =>
    buildMapRoutePath(this.activeItems()),
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
}
