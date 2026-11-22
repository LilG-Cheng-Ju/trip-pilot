import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItemType } from '../../core/models/tripilot.models';
import { ItineraryStore } from '../../state/itinerary.store';
import { TripStore } from '../../state/trip.store';
import { ItineraryCardComponent } from './itinerary-card.component';
import { ItineraryMapComponent, MapPin } from './itinerary-map.component';

/** Mobile-first itinerary timeline with Plan A/B switcher and collapsible desktop map. */
@Component({
  selector: 'app-itinerary-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    ItineraryCardComponent,
    ItineraryMapComponent,
  ],
  template: `
    @if (store.trip(); as trip) {
      <div class="itinerary-layout" [class.map-hidden]="!store.desktopMapVisible()">
        <section class="timeline-pane">
          <header class="trip-bar">
            <div class="trip-bar-left">
              <a routerLink="/trips" class="back-btn">←</a>
              <div>
                <h2 class="trip-name">{{ trip.title }}</h2>
                <p class="trip-range tabular-nums">{{ trip.start_date }} — {{ trip.end_date }}</p>
              </div>
            </div>
            <div class="trip-bar-actions">
              <a class="pill-btn" [routerLink]="['/trips', trip.id, 'expenses']">
                💰 {{ 'common.expenses' | t }}
              </a>
              <button type="button" class="pill-btn" (click)="openShareModal(trip.id)">
                🔗 {{ 'common.share' | t }}
              </button>
              <button
                type="button"
                class="pill-btn desktop-only"
                (click)="store.toggleDesktopMap()"
              >
                {{ store.desktopMapVisible() ? ('itinerary.map.hide' | t) : ('itinerary.map.show' | t) }}
              </button>
            </div>
          </header>

          <!-- Horizontal Day Switcher -->
          <div class="day-strip" role="tablist">
            @for (day of trip.days; track day.id) {
              <button
                type="button"
                class="day-chip tabular-nums"
                [class.active]="store.selectedDay()?.id === day.id"
                (click)="store.selectDay(day.day_index)"
              >
                <span class="day-num">D{{ day.day_index }}</span>
                <span class="day-date">{{ day.date.slice(5) }}</span>
              </button>
            }
          </div>

          @if (store.selectedDay(); as day) {
            <!-- Per-Day Plan A / Plan B Segmented Switcher -->
            <div class="plan-bar">
              <div class="plan-pills">
                @for (opt of day.options; track opt.id) {
                  <button
                    type="button"
                    class="plan-pill"
                    [class.selected]="store.selectedOption()?.id === opt.id"
                    (click)="store.previewOption(day.id, opt.id)"
                  >
                    @if (day.active_option_id === opt.id) {
                      <span class="active-dot" aria-hidden="true"></span>
                    }
                    <span>{{ opt.label }}</span>
                    @if (opt.cached_ground_distance_km > 0) {
                      <span class="opt-km tabular-nums">
                        {{ opt.cached_distance_is_approx ? '~' : '' }}{{ opt.cached_ground_distance_km }} km
                      </span>
                    }
                  </button>
                }
              </div>
              <button type="button" class="clone-btn" (click)="promptCloneOption()">
                {{ 'itinerary.plan.addOption' | t }}
              </button>
            </div>

            @if (store.selectedOption(); as option) {
              @if (!store.isPreviewingActiveOption()) {
                <div class="activate-banner">
                  <span>{{ option.label }}</span>
                  <button
                    type="button"
                    class="btn-accent"
                    (click)="store.setActiveOption(day.id, option.id)"
                  >
                    {{ 'itinerary.plan.setActive' | t }}
                  </button>
                </div>
              }

              <!-- Clean Day Summary Header (Stops + Distance only, no cost noise) -->
              <div class="summary-bar">
                <span class="summary-text tabular-nums">
                  {{ 'itinerary.summary.stops' | t: { count: store.stopCount() } }}
                  · {{ option.cached_distance_is_approx ? '~' : '' }}{{ option.cached_ground_distance_km }} km
                </span>

                <div class="summary-controls">
                  <div class="mobile-toggle">
                    <button
                      type="button"
                      [class.active]="store.mobileView() === 'list'"
                      (click)="store.setMobileView('list')"
                    >
                      {{ 'itinerary.view.list' | t }}
                    </button>
                    <button
                      type="button"
                      [class.active]="store.mobileView() === 'map'"
                      (click)="store.setMobileView('map')"
                    >
                      {{ 'itinerary.view.map' | t }}
                    </button>
                  </div>
                  <button type="button" class="add-item-btn" (click)="showAddItem.set(!showAddItem())">
                    + {{ 'itinerary.addItem' | t }}
                  </button>
                </div>
              </div>

              @if (showAddItem()) {
                <form class="add-card" (ngSubmit)="submitItem()">
                  <div class="add-grid">
                    <label class="field">
                      <span>{{ 'itinerary.form.type' | t }}</span>
                      <select [(ngModel)]="itemType" name="itemType">
                        <option value="SPOT">{{ 'item.type.spot' | t }}</option>
                        <option value="FOOD">{{ 'item.type.food' | t }}</option>
                        <option value="STAY">{{ 'item.type.stay' | t }}</option>
                        <option value="FLIGHT">{{ 'item.type.flight' | t }}</option>
                        <option value="RESERVED_TRANSIT">{{ 'item.type.reservedTransit' | t }}</option>
                        <option value="LOCAL_TRANSIT">{{ 'item.type.localTransit' | t }}</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>{{ 'itinerary.form.title' | t }}</span>
                      <input type="text" [(ngModel)]="itemTitle" name="itemTitle" required />
                    </label>
                    <label class="field">
                      <span>{{ 'itinerary.form.startTime' | t }}</span>
                      <input type="time" [(ngModel)]="startTime" name="startTime" />
                    </label>
                    <label class="field">
                      <span>{{ 'itinerary.form.endTime' | t }}</span>
                      <input type="time" [(ngModel)]="endTime" name="endTime" />
                    </label>

                    @if (itemType === 'FLIGHT') {
                      <label class="field">
                        <span>{{ 'itinerary.form.flightNo' | t }}</span>
                        <input type="text" [(ngModel)]="flightNo" name="flightNo" placeholder="NH852" />
                      </label>
                      <label class="field">
                        <span>{{ 'itinerary.form.originIata' | t }}</span>
                        <input type="text" [(ngModel)]="originIata" name="originIata" maxlength="3" placeholder="TSA" />
                      </label>
                      <label class="field">
                        <span>{{ 'itinerary.form.destIata' | t }}</span>
                        <input type="text" [(ngModel)]="destIata" name="destIata" maxlength="3" placeholder="HND" />
                      </label>
                      <label class="field">
                        <span>{{ 'itinerary.form.bookingRef' | t }}</span>
                        <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
                      </label>
                    } @else if (itemType === 'RESERVED_TRANSIT') {
                      <label class="field">
                        <span>{{ 'itinerary.form.trainLine' | t }}</span>
                        <input type="text" [(ngModel)]="trainLine" name="trainLine" />
                      </label>
                      <label class="field">
                        <span>{{ 'itinerary.form.seat' | t }}</span>
                        <input type="text" [(ngModel)]="seat" name="seat" />
                      </label>
                      <label class="field">
                        <span>{{ 'itinerary.form.bookingRef' | t }}</span>
                        <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
                      </label>
                    } @else if (itemType === 'LOCAL_TRANSIT') {
                      <label class="field">
                        <span>{{ 'itinerary.form.transitMin' | t }}</span>
                        <input type="number" [(ngModel)]="transitMin" name="transitMin" min="1" />
                      </label>
                    } @else {
                      <label class="field">
                        <span>{{ 'itinerary.form.address' | t }}</span>
                        <input type="text" [(ngModel)]="address" name="address" />
                      </label>
                      <label class="field">
                        <span>{{ 'itinerary.form.lat' | t }}</span>
                        <input type="number" step="any" [(ngModel)]="latitude" name="latitude" placeholder="35.6812" />
                      </label>
                      <label class="field">
                        <span>{{ 'itinerary.form.lng' | t }}</span>
                        <input type="number" step="any" [(ngModel)]="longitude" name="longitude" placeholder="139.7671" />
                      </label>
                      @if (itemType === 'STAY') {
                        <label class="field">
                          <span>{{ 'itinerary.form.bookingRef' | t }}</span>
                          <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
                        </label>
                        <label class="field">
                          <span>{{ 'itinerary.form.freeCancel' | t }}</span>
                          <input type="text" [(ngModel)]="freeCancel" name="freeCancel" placeholder="Nov 20" />
                        </label>
                      }
                    }
                  </div>
                  <label class="field full">
                    <span>{{ 'itinerary.form.notes' | t }}</span>
                    <input type="text" [(ngModel)]="notes" name="notes" />
                  </label>
                  <div class="add-actions">
                    <button type="button" class="pill-btn" (click)="showAddItem.set(false)">
                      {{ 'common.cancel' | t }}
                    </button>
                    <button type="submit" class="add-item-btn">{{ 'common.save' | t }}</button>
                  </div>
                </form>
              }

              @if (store.mobileView() === 'map') {
                <div class="mobile-map-box">
                  <app-itinerary-map
                    [pins]="mapPins()"
                    [selectedPinId]="store.selectedItemId()"
                    (pinSelected)="store.selectItem($event)"
                  />
                </div>
              } @else {
                @if (option.items.length === 0) {
                  <div class="empty-day">{{ 'itinerary.emptyDay' | t }}</div>
                } @else {
                  <div class="timeline-list">
                    @for (item of option.items; track item.id) {
                      <app-itinerary-card
                        [item]="item"
                        [selected]="store.selectedItemId() === item.id"
                        (cardClicked)="store.selectItem($event)"
                        (moveUp)="store.moveItem($event, -1)"
                        (moveDown)="store.moveItem($event, 1)"
                        (deleted)="store.deleteItem($event)"
                      />
                    }
                  </div>
                }
              }
            }
          }
        </section>

        @if (store.desktopMapVisible()) {
          <aside class="desktop-map-pane">
            <app-itinerary-map
              [pins]="mapPins()"
              [selectedPinId]="store.selectedItemId()"
              (pinSelected)="store.selectItem($event)"
            />
          </aside>
        }
      </div>

      @if (showShareModal()) {
        <div class="modal-backdrop" (click)="showShareModal.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h3>{{ 'share.title' | t }}</h3>
              <button type="button" class="pill-btn" (click)="showShareModal.set(false)">×</button>
            </div>
            <div class="share-options">
              <label class="check-row">
                <input type="checkbox" [(ngModel)]="hideSecrets" name="hideSecrets" />
                <span>{{ 'share.hideSecrets' | t }}</span>
              </label>
              <label class="check-row">
                <input type="checkbox" [(ngModel)]="includeNotes" name="includeNotes" />
                <span>{{ 'share.includeNotes' | t }}</span>
              </label>
              <label class="check-row">
                <input type="checkbox" [(ngModel)]="includeBackups" name="includeBackups" />
                <span>{{ 'share.includeBackups' | t }}</span>
              </label>
              <button type="button" class="add-item-btn" (click)="createShareLink(trip.id)">
                {{ 'share.create' | t }}
              </button>
            </div>

            @for (share of store.shares(); track share.id) {
              @if (!share.revoked_at) {
                <div class="share-row">
                  <code class="share-url">{{ shareUrl(share.token) }}</code>
                  <div class="share-row-actions">
                    <button type="button" class="pill-btn" (click)="copyShareUrl(share.token)">
                      {{ copiedToken() === share.token ? ('common.copied' | t) : ('common.copy' | t) }}
                    </button>
                    <button type="button" class="pill-btn danger" (click)="store.revokeShare(trip.id, share.id)">
                      {{ 'share.revoke' | t }}
                    </button>
                  </div>
                </div>
              }
            }
          </div>
        </div>
      }
    } @else if (store.loading()) {
      <p class="empty-day">{{ 'common.loading' | t }}</p>
    }
  `,
  styles: `
    .itinerary-layout {
      display: grid;
      grid-template-columns: 1fr;
      min-height: 100dvh;
    }
    .timeline-pane {
      padding: var(--space-4) var(--space-4) calc(var(--nav-bottom-height) + var(--space-6));
      max-width: 780px;
      width: 100%;
      margin: 0 auto;
    }
    .desktop-map-pane,
    .desktop-only {
      display: none;
    }
    .trip-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .trip-bar-left {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .back-btn {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 700;
    }
    .trip-name {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .trip-range {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .trip-bar-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .pill-btn {
      padding: 7px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-primary);
      text-decoration: none;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .pill-btn.danger {
      color: var(--color-alert);
    }
    .day-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: var(--space-2);
      margin-bottom: var(--space-3);
    }
    .day-chip {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 64px;
      padding: 8px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      cursor: pointer;
    }
    .day-chip.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .day-num {
      font-weight: 700;
      font-size: 0.875rem;
    }
    .day-date {
      font-size: 0.7rem;
      opacity: 0.8;
    }
    .plan-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
      flex-wrap: wrap;
    }
    .plan-pills {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px;
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
      font-size: 0.8125rem;
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
      border-radius: var(--radius-pill);
      background: var(--color-accent);
    }
    .opt-km {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .clone-btn {
      padding: 6px 12px;
      border: 1px dashed var(--color-accent);
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: #8b652d;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }
    .activate-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      margin-bottom: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-accent-soft);
      border: 1px solid var(--color-accent);
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .btn-accent {
      padding: 6px 12px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }
    .summary-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
    .summary-text {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .summary-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mobile-toggle {
      display: inline-flex;
      padding: 3px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
    }
    .mobile-toggle button {
      padding: 5px 12px;
      border: none;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .mobile-toggle button.active {
      background: var(--color-surface);
      color: var(--color-primary);
    }
    .add-item-btn {
      padding: 7px 14px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .add-card {
      padding: var(--space-4);
      margin-bottom: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }
    .add-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .field.full {
      margin-bottom: var(--space-3);
    }
    .field input,
    .field select {
      padding: 8px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
    }
    .add-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .mobile-map-box {
      height: 62dvh;
    }
    .empty-day {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: grid;
      place-items: center;
      padding: var(--space-4);
      background: rgba(23, 32, 51, 0.45);
    }
    .modal-card {
      width: 100%;
      max-width: 480px;
      padding: var(--space-5);
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-float);
    }
    .modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-4);
    }
    .modal-head h3 {
      margin: 0;
      color: var(--color-primary);
    }
    .share-options {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
    .check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
      color: var(--color-text-primary);
    }
    .share-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px;
      margin-top: 8px;
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .share-url {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      word-break: break-all;
      color: var(--color-primary);
    }
    .share-row-actions {
      display: flex;
      gap: 6px;
    }

    @media (min-width: 1024px) {
      .desktop-only {
        display: inline-flex;
      }
      .mobile-toggle,
      .mobile-map-box {
        display: none;
      }
      .itinerary-layout:not(.map-hidden) {
        grid-template-columns: minmax(420px, 46%) 1fr;
        height: 100dvh;
      }
      .itinerary-layout:not(.map-hidden) .timeline-pane {
        max-width: none;
        overflow-y: auto;
        padding: var(--space-5);
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
export class ItineraryPageComponent implements OnInit {
  protected readonly store = inject(ItineraryStore);
  private readonly tripStore = inject(TripStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly showAddItem = signal(false);
  protected readonly showShareModal = signal(false);
  protected readonly copiedToken = signal<string | null>(null);

  protected itemType: ItemType = 'SPOT';
  protected itemTitle = '';
  protected startTime = '';
  protected endTime = '';
  protected address = '';
  protected latitude: number | null = null;
  protected longitude: number | null = null;
  protected notes = '';
  protected flightNo = '';
  protected originIata = '';
  protected destIata = '';
  protected bookingRef = '';
  protected trainLine = '';
  protected seat = '';
  protected transitMin: number | null = 15;
  protected freeCancel = '';

  protected hideSecrets = true;
  protected includeNotes = false;
  protected includeBackups = false;

  protected readonly mapPins = computed<MapPin[]>(() => {
    const option = this.store.selectedOption();
    if (!option) {
      return [];
    }
    const pins: MapPin[] = [];
    let order = 1;
    for (const item of option.items) {
      if (item.latitude !== null && item.longitude !== null) {
        pins.push({
          id: item.id,
          order: order++,
          title: item.title,
          lat: item.latitude,
          lng: item.longitude,
          type: item.type,
        });
      }
    }
    return pins;
  });

  ngOnInit(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      this.tripStore.setLastSelectedTripId(tripId);
      void this.store.loadTrip(tripId);
    }
  }

  protected async promptCloneOption(): Promise<void> {
    const label = window.prompt('New plan label (e.g. Plan B · Rainy)', 'Plan B · Rainy');
    if (label && label.trim()) {
      await this.store.cloneCurrentOption(label.trim());
    }
  }

  protected async submitItem(): Promise<void> {
    if (!this.itemTitle.trim()) {
      return;
    }
    const details: Record<string, unknown> = {};
    if (this.itemType === 'FLIGHT') {
      if (this.flightNo) details['flight_number'] = this.flightNo.trim();
      if (this.originIata) details['origin_iata'] = this.originIata.trim().toUpperCase();
      if (this.destIata) details['dest_iata'] = this.destIata.trim().toUpperCase();
      if (this.bookingRef) details['booking_ref'] = this.bookingRef.trim();
    } else if (this.itemType === 'RESERVED_TRANSIT') {
      if (this.trainLine) details['line_or_train_no'] = this.trainLine.trim();
      if (this.seat) details['seat'] = this.seat.trim();
      if (this.bookingRef) details['booking_ref'] = this.bookingRef.trim();
    } else if (this.itemType === 'LOCAL_TRANSIT') {
      if (this.transitMin) details['duration_minutes'] = this.transitMin;
    } else if (this.itemType === 'STAY') {
      if (this.bookingRef) details['confirmation_code'] = this.bookingRef.trim();
      if (this.freeCancel) details['free_cancellation_deadline'] = this.freeCancel.trim();
    }

    await this.store.addItem({
      type: this.itemType,
      title: this.itemTitle.trim(),
      start_time: this.startTime || null,
      end_time: this.endTime || null,
      address: this.address.trim() || null,
      latitude: this.latitude,
      longitude: this.longitude,
      notes: this.notes.trim() || null,
      details,
    });

    this.itemTitle = '';
    this.address = '';
    this.latitude = null;
    this.longitude = null;
    this.notes = '';
    this.bookingRef = '';
    this.showAddItem.set(false);
  }

  protected openShareModal(tripId: string): void {
    this.showShareModal.set(true);
    void this.store.loadShares(tripId);
  }

  protected async createShareLink(tripId: string): Promise<void> {
    await this.store.createShare(tripId, 'Shared Link', {
      include_booking_refs: !this.hideSecrets,
      include_notes: this.includeNotes,
      include_expenses: false,
      include_backup_options: this.includeBackups,
    });
  }

  protected shareUrl(token: string): string {
    return `${window.location.origin}/s/${token}`;
  }

  protected async copyShareUrl(token: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl(token));
      this.copiedToken.set(token);
      setTimeout(() => this.copiedToken.set(null), 1800);
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts.
    }
  }
}
