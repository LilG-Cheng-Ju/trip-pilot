import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { COPY_FEEDBACK_DURATION_MS, MS_PER_DAY } from '../../core/constants/app-limits';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItemAttachment, ItineraryItem } from '../../core/models/tripilot.models';
import {
  buildGoogleMapsUrl,
  extractItemAttachments,
  getItemDetailString,
  getSelectedDayItems,
} from '../../core/utils/travel-format.utils';
import { TripSubnavComponent } from '../../shared/trip-subnav.component';
import { ItineraryStore } from '../../state/itinerary.store';

interface StaySpan {
  item: ItineraryItem;
  checkInDate: string;
  checkOutDate: string;
  startDayIndex: number;
  nights: number;
  isHotelChange: boolean;
}

interface DayTaggedItem {
  dayIndex: number;
  date: string;
  item: ItineraryItem;
}

interface TripAttachmentEntry {
  attachment: ItemAttachment;
  dayIndex: number;
  itemTitle: string;
}

/** At-a-glance trip summary: accommodations & hotel changes, flights, reserved transit, and attachments vault. */
@Component({
  selector: 'app-trip-brief-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, TripSubnavComponent],
  template: `
    <div class="page">
      @if (store.trip(); as trip) {
        <app-trip-subnav
          [tripId]="trip.id"
          [title]="trip.title"
          [dateRange]="trip.start_date + ' — ' + trip.end_date"
        />

        <div class="brief-grid">
          <!-- 1. Accommodations & Hotel Changes -->
          <section class="brief-section">
            <div class="section-head">
              <span class="ms-icon sm section-ico stay" aria-hidden="true">hotel</span>
              <h3>{{ 'brief.stays' | t }}</h3>
              <span class="count-badge tabular-nums">{{ staySpans().length }}</span>
            </div>

            @if (staySpans().length === 0) {
              <p class="empty-hint">{{ 'brief.staysEmpty' | t }}</p>
            } @else {
              <div class="card-stack">
                @for (stay of staySpans(); track stay.item.id + '-' + stay.startDayIndex) {
                  <article class="brief-card stay-card">
                    <div class="brief-card-top">
                      <div class="date-span tabular-nums">
                        <span>{{ stay.checkInDate }}</span>
                        <span class="arrow">→</span>
                        <span>{{ stay.checkOutDate }}</span>
                        <span class="nights-pill">
                          {{
                            stay.nights === 1
                              ? ('brief.nightSingle' | t)
                              : ('brief.nights' | t: { count: stay.nights })
                          }}
                        </span>
                      </div>
                      @if (stay.isHotelChange) {
                        <span class="change-badge">
                          <span class="ms-icon sm" aria-hidden="true">swap_horiz</span>
                          <span>{{ 'brief.hotelChange' | t }}</span>
                        </span>
                      }
                    </div>

                    <h4 class="item-title">{{ stay.item.title }}</h4>
                    @if (stay.item.address) {
                      <p class="item-sub">{{ stay.item.address }}</p>
                    }

                    <div class="chip-row">
                      @if (detail(stay.item, 'confirmation_code') || detail(stay.item, 'booking_ref'); as conf) {
                        <span class="info-chip">{{ 'detail.confirmation' | t }} {{ conf }}</span>
                      }
                      @if (detail(stay.item, 'free_cancellation_deadline'); as cancel) {
                        <span class="alert-chip">
                          <span class="ms-icon sm" aria-hidden="true">warning</span>
                          <span>{{ 'detail.freeCancelBy' | t }} {{ cancel }}</span>
                        </span>
                      }
                      @if (detail(stay.item, 'local_name'); as localName) {
                        <button
                          type="button"
                          class="action-chip"
                          (click)="copyText(stay.item.id, localName)"
                        >
                          <span class="ms-icon sm" aria-hidden="true">
                            {{ copiedId() === stay.item.id ? 'check' : 'content_copy' }}
                          </span>
                          <span>{{ copiedId() === stay.item.id ? ('common.copied' | t) : localName }}</span>
                        </button>
                      }
                      @if (mapsUrl(stay.item); as url) {
                        <a class="action-chip" [href]="url" target="_blank" rel="noopener noreferrer">
                          <span class="ms-icon sm" aria-hidden="true">near_me</span>
                          <span>{{ 'common.navigate' | t }}</span>
                        </a>
                      }
                    </div>
                  </article>
                }
              </div>
            }
          </section>

          <!-- 2. Flights -->
          <section class="brief-section">
            <div class="section-head">
              <span class="ms-icon sm section-ico flight" aria-hidden="true">flight</span>
              <h3>{{ 'brief.flights' | t }}</h3>
              <span class="count-badge tabular-nums">{{ flights().length }}</span>
            </div>

            @if (flights().length === 0) {
              <p class="empty-hint">{{ 'brief.flightsEmpty' | t }}</p>
            } @else {
              <div class="card-stack">
                @for (entry of flights(); track entry.item.id) {
                  <article class="brief-card flight-card">
                    <div class="brief-card-top">
                      <span class="day-tag tabular-nums">
                        Day {{ entry.dayIndex }} · {{ entry.date }}
                      </span>
                      @if (detail(entry.item, 'booking_ref'); as ref) {
                        <span class="ref-pill">{{ 'detail.bookingRef' | t }} {{ ref }}</span>
                      } @else if (detail(entry.item, 'confirmation_code'); as conf) {
                        <span class="ref-pill">{{ 'detail.confirmation' | t }} {{ conf }}</span>
                      }
                    </div>
                    <div class="flight-line tabular-nums">
                      <div class="flight-end">
                        <strong class="iata">{{ detail(entry.item, 'origin_iata') || '---' }}</strong>
                        <span class="time">{{ entry.item.start_time || '--:--' }}</span>
                      </div>
                      <div class="flight-mid">
                        <span class="flight-no">
                          {{ detail(entry.item, 'flight_number') || entry.item.title }}
                        </span>
                        <span class="arc-bar"></span>
                        @if (detail(entry.item, 'distance_km'); as km) {
                          <span class="flight-km">{{ km }} km</span>
                        }
                      </div>
                      <div class="flight-end right">
                        <strong class="iata">{{ detail(entry.item, 'dest_iata') || '---' }}</strong>
                        <span class="time">{{ entry.item.end_time || '--:--' }}</span>
                      </div>
                    </div>
                  </article>
                }
              </div>
            }
          </section>

          <!-- 3. Reserved Transit -->
          <section class="brief-section">
            <div class="section-head">
              <span class="ms-icon sm section-ico transit" aria-hidden="true">train</span>
              <h3>{{ 'brief.transit' | t }}</h3>
              <span class="count-badge tabular-nums">{{ reservedTransits().length }}</span>
            </div>

            @if (reservedTransits().length === 0) {
              <p class="empty-hint">{{ 'brief.transitEmpty' | t }}</p>
            } @else {
              <div class="card-stack">
                @for (entry of reservedTransits(); track entry.item.id) {
                  <article class="brief-card transit-card">
                    <div class="brief-card-top">
                      <span class="day-tag light tabular-nums">
                        Day {{ entry.dayIndex }} · {{ entry.date }}
                      </span>
                      @if (entry.item.start_time) {
                        <span class="time-tag tabular-nums">
                          {{ entry.item.start_time }}@if (entry.item.end_time) { – {{ entry.item.end_time }} }
                        </span>
                      }
                    </div>
                    <h4 class="item-title">{{ entry.item.title }}</h4>
                    @if (entry.item.address) {
                      <p class="item-sub">{{ entry.item.address }}</p>
                    }
                    <div class="chip-row">
                      @if (detail(entry.item, 'line_or_train_no'); as line) {
                        <span class="info-chip">{{ line }}</span>
                      }
                      @if (detail(entry.item, 'seat'); as seat) {
                        <span class="info-chip">{{ seat }}</span>
                      }
                      @if (detail(entry.item, 'booking_ref'); as ref) {
                        <span class="info-chip">{{ 'detail.bookingRef' | t }} {{ ref }}</span>
                      }
                      @if (detail(entry.item, 'confirmation_code'); as conf) {
                        <span class="info-chip">{{ 'detail.confirmation' | t }} {{ conf }}</span>
                      }
                      @if (detail(entry.item, 'free_cancellation_deadline'); as cancel) {
                        <span class="alert-chip">
                          <span class="ms-icon sm" aria-hidden="true">warning</span>
                          <span>{{ 'detail.freeCancelBy' | t }} {{ cancel }}</span>
                        </span>
                      }
                    </div>
                  </article>
                }
              </div>
            }
          </section>

          <!-- 4. All Cloud Attachments Vault -->
          <section class="brief-section">
            <div class="section-head">
              <span class="ms-icon sm section-ico files" aria-hidden="true">folder_open</span>
              <h3>{{ 'brief.attachments' | t }}</h3>
              <span class="count-badge tabular-nums">{{ allAttachments().length }}</span>
            </div>

            @if (allAttachments().length === 0) {
              <p class="empty-hint">{{ 'brief.attachmentsEmpty' | t }}</p>
            } @else {
              <div class="vault-grid">
                @for (entry of allAttachments(); track entry.attachment.url + '-' + $index) {
                  <a
                    class="vault-card"
                    [href]="entry.attachment.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span class="ms-icon vault-ico" aria-hidden="true">attach_file</span>
                    <div class="vault-meta">
                      <strong class="vault-name">{{ entry.attachment.name }}</strong>
                      <span class="vault-source tabular-nums">
                        Day {{ entry.dayIndex }} · {{ entry.itemTitle }}
                      </span>
                    </div>
                    <span class="ms-icon sm vault-ext" aria-hidden="true">open_in_new</span>
                  </a>
                }
              </div>
            }
          </section>
        </div>
      } @else if (store.loading()) {
        <p class="empty-hint">{{ 'common.loading' | t }}</p>
      } @else {
        <div class="brief-error" role="alert">
          <span class="ms-icon lg" aria-hidden="true">error_outline</span>
          <p>{{ store.error() || ('itinerary.errLoad' | t) }}</p>
          <div class="brief-error-actions">
            <button type="button" class="btn-primary" (click)="retryLoad()">
              {{ 'common.retry' | t }}
            </button>
            <a routerLink="/trips" class="btn-ghost">{{ 'itinerary.goTrips' | t }}</a>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .page {
      max-width: 1120px;
      margin: 0 auto;
      padding: var(--space-4) var(--space-4) calc(var(--nav-bottom-height) + var(--space-6));
    }
    .brief-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
    }
    .brief-section {
      min-width: 0;
      padding: var(--space-4);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-card);
    }
    .section-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: var(--space-3);
    }
    .section-head h3 {
      margin: 0;
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .section-ico {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .section-ico.stay {
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
    }
    .count-badge {
      margin-left: auto;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: 0.74rem;
      font-weight: 600;
    }
    .empty-hint {
      margin: 0;
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-muted);
      font-size: 0.82rem;
    }
    .brief-error {
      max-width: 420px;
      margin: 48px auto;
      padding: var(--space-6);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }
    .brief-error p {
      margin: 0;
      font-size: 0.85rem;
    }
    .brief-error-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
    }
    .card-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .brief-card {
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .stay-card,
    .transit-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
    }
    .flight-card {
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      border-color: var(--color-primary);
    }
    .brief-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }
    .date-span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .arrow {
      color: var(--color-text-muted);
    }
    .nights-pill {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
      font-size: 0.72rem;
    }
    .change-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.72rem;
      font-weight: 600;
    }
    .item-title {
      margin: 0 0 3px;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .item-sub {
      margin: 0 0 8px;
      font-size: 0.78rem;
      color: var(--color-text-secondary);
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .info-chip,
    .alert-chip,
    .action-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 7px;
      font-size: 0.74rem;
      font-weight: 600;
      text-decoration: none;
    }
    .info-chip {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .alert-chip {
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    .action-chip {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-primary);
      font-family: inherit;
      cursor: pointer;
    }
    .action-chip:hover {
      border-color: var(--color-primary);
    }
    .day-tag {
      font-size: 0.76rem;
      font-weight: 600;
      opacity: 0.85;
    }
    .day-tag.light {
      color: var(--color-primary);
      opacity: 1;
    }
    .time-tag {
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .ref-pill {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.16);
      font-family: var(--font-mono);
      font-size: 0.74rem;
    }
    .flight-line {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
      margin-top: 4px;
    }
    .flight-end {
      display: flex;
      flex-direction: column;
    }
    .flight-end.right {
      text-align: right;
    }
    .iata {
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .time {
      font-size: 0.78rem;
      opacity: 0.8;
    }
    .flight-mid {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .flight-no {
      font-size: 0.76rem;
      font-weight: 600;
      opacity: 0.9;
    }
    .arc-bar {
      width: 100%;
      height: 1px;
      background: rgba(200, 155, 91, 0.6);
    }
    .flight-km {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--color-accent);
    }
    .vault-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .vault-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 9px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      text-decoration: none;
    }
    .vault-card:hover {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
    }
    .vault-ico {
      color: var(--color-accent);
    }
    .vault-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .vault-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vault-source {
      font-size: 0.73rem;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vault-ext {
      color: var(--color-text-muted);
    }
    @media (min-width: 900px) {
      .brief-grid {
        grid-template-columns: 1fr 1fr;
        align-items: start;
      }
    }
  `,
})
export class TripBriefPageComponent implements OnInit {
  protected readonly store = inject(ItineraryStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly copiedId = signal<string | null>(null);

  /** Derive check-in -> check-out spans and detect hotel changes across Day 1..N. */
  protected readonly staySpans = computed<StaySpan[]>(() => {
    const trip = this.store.trip();
    if (!trip || trip.days.length === 0) {
      return [];
    }
    const sortedDays = [...trip.days].sort((a, b) => a.day_index - b.day_index);
    const spans: StaySpan[] = [];

    for (const day of sortedDays) {
      const stay = getSelectedDayItems(day).find((it) => it.type === 'STAY');
      if (!stay) {
        continue;
      }
      const prev = spans[spans.length - 1];
      // Merge consecutive days with the exact same hotel title into one continuous stay.
      if (prev && prev.item.title.trim().toLowerCase() === stay.title.trim().toLowerCase()) {
        continue;
      }
      if (prev) {
        prev.checkOutDate = day.date;
        prev.nights = Math.max(1, this.diffDays(prev.checkInDate, day.date));
      }
      spans.push({
        item: stay,
        checkInDate: day.date,
        checkOutDate: trip.end_date,
        startDayIndex: day.day_index,
        nights: Math.max(1, this.diffDays(day.date, trip.end_date)),
        isHotelChange: spans.length > 0,
      });
    }
    return spans;
  });

  protected readonly flights = computed<DayTaggedItem[]>(() =>
    this.collectItemsByType('FLIGHT'),
  );

  protected readonly reservedTransits = computed<DayTaggedItem[]>(() =>
    this.collectItemsByType('RESERVED_TRANSIT'),
  );

  protected readonly allAttachments = computed<TripAttachmentEntry[]>(() => {
    const trip = this.store.trip();
    if (!trip) {
      return [];
    }
    const result: TripAttachmentEntry[] = [];
    const sortedDays = [...trip.days].sort((a, b) => a.day_index - b.day_index);
    for (const day of sortedDays) {
      for (const item of getSelectedDayItems(day)) {
        for (const attachment of extractItemAttachments(item.details)) {
          result.push({
            attachment,
            dayIndex: day.day_index,
            itemTitle: item.title,
          });
        }
      }
    }
    return result;
  });

  ngOnInit(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId && this.store.trip()?.id !== tripId) {
      void this.store.loadTrip(tripId);
    }
  }

  protected retryLoad(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      void this.store.loadTrip(tripId);
    }
  }

  protected detail(item: ItineraryItem, key: string): string | null {
    return getItemDetailString(item.details, key);
  }

  protected mapsUrl(item: ItineraryItem): string | null {
    return buildGoogleMapsUrl(item);
  }

  protected async copyText(id: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedId.set(id);
      setTimeout(() => this.copiedId.set(null), COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Ignore clipboard failures in restricted contexts.
    }
  }

  private collectItemsByType(type: 'FLIGHT' | 'RESERVED_TRANSIT'): DayTaggedItem[] {
    const trip = this.store.trip();
    if (!trip) {
      return [];
    }
    const items: DayTaggedItem[] = [];
    const sortedDays = [...trip.days].sort((a, b) => a.day_index - b.day_index);
    for (const day of sortedDays) {
      for (const item of getSelectedDayItems(day)) {
        if (item.type === type) {
          items.push({ dayIndex: day.day_index, date: day.date, item });
        }
      }
    }
    return items;
  }

  private diffDays(startIso: string, endIso: string): number {
    const start = Date.parse(`${startIso}T00:00:00Z`);
    const end = Date.parse(`${endIso}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return 1;
    }
    return Math.round((end - start) / MS_PER_DAY);
  }
}
