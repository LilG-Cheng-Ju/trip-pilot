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
              <h3 class="font-display">{{ 'brief.stays' | t }}</h3>
              <span class="section-count font-mono tabular-nums">{{ staySpans().length }}</span>
            </div>

            @if (staySpans().length === 0) {
              <p class="empty-hint">{{ 'brief.staysEmpty' | t }}</p>
            } @else {
              <div class="dossier-list">
                @for (stay of staySpans(); track stay.item.id + '-' + stay.startDayIndex) {
                  <article class="dossier-row">
                    <div class="dossier-kicker tabular-nums">
                      <span class="kicker-dates">
                        {{ stay.checkInDate }} → {{ stay.checkOutDate }}
                      </span>
                      <span class="kicker-sep" aria-hidden="true">·</span>
                      <span class="kicker-nights">
                        {{
                          stay.nights === 1
                            ? ('brief.nightSingle' | t)
                            : ('brief.nights' | t: { count: stay.nights })
                        }}
                      </span>
                      @if (stay.isHotelChange) {
                        <span class="change-inline">
                          <span class="ms-icon sm" aria-hidden="true">swap_horiz</span>
                          <span>{{ 'brief.hotelChange' | t }}</span>
                        </span>
                      }
                    </div>

                    <h4 class="item-title">{{ stay.item.title }}</h4>
                    @if (stay.item.address) {
                      <p class="item-sub">{{ stay.item.address }}</p>
                    }

                    @if (
                      detail(stay.item, 'confirmation_code') ||
                      detail(stay.item, 'booking_ref') ||
                      detail(stay.item, 'free_cancellation_deadline') ||
                      detail(stay.item, 'local_name') ||
                      mapsUrl(stay.item)
                    ) {
                      <div class="dossier-meta">
                        @if (detail(stay.item, 'confirmation_code') || detail(stay.item, 'booking_ref'); as conf) {
                          <span class="meta-code font-mono">{{ 'detail.confirmation' | t }} {{ conf }}</span>
                        }
                        @if (detail(stay.item, 'free_cancellation_deadline'); as cancel) {
                          <span class="meta-alert">
                            <span class="ms-icon sm" aria-hidden="true">warning</span>
                            <span>{{ 'detail.freeCancelBy' | t }} {{ cancel }}</span>
                          </span>
                        }
                        @if (detail(stay.item, 'local_name'); as localName) {
                          <button
                            type="button"
                            class="dossier-action"
                            (click)="copyText(stay.item.id, localName)"
                          >
                            <span class="ms-icon sm" aria-hidden="true">
                              {{ copiedId() === stay.item.id ? 'check' : 'content_copy' }}
                            </span>
                            <span>{{ copiedId() === stay.item.id ? ('common.copied' | t) : localName }}</span>
                          </button>
                        }
                        @if (mapsUrl(stay.item); as url) {
                          <a class="dossier-action" [href]="url" target="_blank" rel="noopener noreferrer">
                            <span class="ms-icon sm" aria-hidden="true">near_me</span>
                            <span>{{ 'common.navigate' | t }}</span>
                          </a>
                        }
                      </div>
                    }
                  </article>
                }
              </div>
            }
          </section>

          <!-- 2. Flights -->
          <section class="brief-section">
            <div class="section-head">
              <h3 class="font-display">{{ 'brief.flights' | t }}</h3>
              <span class="section-count font-mono tabular-nums">{{ flights().length }}</span>
            </div>

            @if (flights().length === 0) {
              <p class="empty-hint">{{ 'brief.flightsEmpty' | t }}</p>
            } @else {
              <div class="dossier-list">
                @for (entry of flights(); track entry.item.id) {
                  <article class="dossier-row">
                    <div class="dossier-kicker tabular-nums">
                      <span>Day {{ entry.dayIndex }} · {{ entry.date }}</span>
                      @if (detail(entry.item, 'booking_ref'); as ref) {
                        <span class="meta-code font-mono kicker-right">
                          {{ 'detail.bookingRef' | t }} {{ ref }}
                        </span>
                      } @else if (detail(entry.item, 'confirmation_code'); as conf) {
                        <span class="meta-code font-mono kicker-right">
                          {{ 'detail.confirmation' | t }} {{ conf }}
                        </span>
                      }
                    </div>
                    <div class="flight-line tabular-nums">
                      <div class="flight-end">
                        <strong class="iata font-display">{{ detail(entry.item, 'origin_iata') || '---' }}</strong>
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
                        <strong class="iata font-display">{{ detail(entry.item, 'dest_iata') || '---' }}</strong>
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
              <h3 class="font-display">{{ 'brief.transit' | t }}</h3>
              <span class="section-count font-mono tabular-nums">{{ reservedTransits().length }}</span>
            </div>

            @if (reservedTransits().length === 0) {
              <p class="empty-hint">{{ 'brief.transitEmpty' | t }}</p>
            } @else {
              <div class="dossier-list">
                @for (entry of reservedTransits(); track entry.item.id) {
                  <article class="dossier-row">
                    <div class="dossier-kicker tabular-nums">
                      <span>Day {{ entry.dayIndex }} · {{ entry.date }}</span>
                      @if (entry.item.start_time) {
                        <span class="kicker-sep" aria-hidden="true">·</span>
                        <span class="time-tag">
                          {{ entry.item.start_time }}@if (entry.item.end_time) { – {{ entry.item.end_time }} }
                        </span>
                      }
                    </div>
                    <h4 class="item-title">{{ entry.item.title }}</h4>
                    @if (entry.item.address) {
                      <p class="item-sub">{{ entry.item.address }}</p>
                    }
                    @if (
                      detail(entry.item, 'line_or_train_no') ||
                      detail(entry.item, 'seat') ||
                      detail(entry.item, 'booking_ref') ||
                      detail(entry.item, 'confirmation_code') ||
                      detail(entry.item, 'free_cancellation_deadline')
                    ) {
                      <div class="dossier-meta">
                        @if (detail(entry.item, 'line_or_train_no'); as line) {
                          <span class="meta-text">{{ line }}</span>
                        }
                        @if (detail(entry.item, 'seat'); as seat) {
                          <span class="meta-text">{{ seat }}</span>
                        }
                        @if (detail(entry.item, 'booking_ref'); as ref) {
                          <span class="meta-code font-mono">{{ 'detail.bookingRef' | t }} {{ ref }}</span>
                        }
                        @if (detail(entry.item, 'confirmation_code'); as conf) {
                          <span class="meta-code font-mono">{{ 'detail.confirmation' | t }} {{ conf }}</span>
                        }
                        @if (detail(entry.item, 'free_cancellation_deadline'); as cancel) {
                          <span class="meta-alert">
                            <span class="ms-icon sm" aria-hidden="true">warning</span>
                            <span>{{ 'detail.freeCancelBy' | t }} {{ cancel }}</span>
                          </span>
                        }
                      </div>
                    }
                  </article>
                }
              </div>
            }
          </section>

          <!-- 4. All Cloud Attachments Vault -->
          <section class="brief-section">
            <div class="section-head">
              <h3 class="font-display">{{ 'brief.attachments' | t }}</h3>
              <span class="section-count font-mono tabular-nums">{{ allAttachments().length }}</span>
            </div>

            @if (allAttachments().length === 0) {
              <p class="empty-hint">{{ 'brief.attachmentsEmpty' | t }}</p>
            } @else {
              <div class="dossier-list">
                @for (entry of allAttachments(); track entry.attachment.url + '-' + $index) {
                  <a
                    class="vault-row"
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
    .brief-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
    }
    .brief-section {
      min-width: 0;
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-card);
    }
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 10px;
      margin-bottom: 2px;
      border-bottom: 1px solid var(--color-border);
    }
    .section-head h3 {
      margin: 0;
      font-size: 1.12rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .section-count {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-accent);
    }
    .empty-hint {
      margin: 0;
      padding: 14px 0 4px;
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
    .dossier-list {
      display: flex;
      flex-direction: column;
    }
    .dossier-row {
      padding: 14px 0;
      border-bottom: 1px solid var(--color-border-soft);
    }
    .dossier-row:last-child {
      border-bottom: none;
      padding-bottom: 2px;
    }
    .dossier-kicker {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 5px;
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--color-text-muted);
    }
    .kicker-dates {
      color: var(--color-primary);
    }
    .kicker-sep {
      color: var(--color-text-muted);
    }
    .kicker-nights {
      color: var(--color-accent-ink);
    }
    .kicker-right {
      margin-left: auto;
    }
    .change-inline {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: var(--color-accent);
      font-size: 0.73rem;
      font-weight: 600;
    }
    .item-title {
      margin: 0 0 2px;
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .item-sub {
      margin: 0;
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }
    .dossier-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      margin-top: 8px;
      font-size: 0.76rem;
    }
    .meta-text {
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .meta-code {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .meta-alert {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      color: var(--color-alert);
    }
    .dossier-action {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border: none;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--color-primary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: background-color 140ms ease, color 140ms ease;
    }
    .dossier-action:hover {
      background: var(--color-surface-alt);
      color: var(--color-accent-ink);
    }
    .time-tag {
      color: var(--color-text-secondary);
    }
    .flight-line {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 14px;
      margin-top: 6px;
    }
    .flight-end {
      display: flex;
      flex-direction: column;
    }
    .flight-end.right {
      text-align: right;
    }
    .iata {
      font-size: 1.4rem;
      font-weight: 600;
      line-height: 1.15;
      letter-spacing: 0.02em;
      color: var(--color-primary);
    }
    .time {
      font-size: 0.78rem;
      color: var(--color-text-secondary);
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
      color: var(--color-primary);
    }
    .arc-bar {
      width: 100%;
      height: 1px;
      background: var(--color-accent-border);
    }
    .flight-km {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--color-accent);
    }
    .vault-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 6px;
      border-bottom: 1px solid var(--color-border-soft);
      color: var(--color-text-primary);
      text-decoration: none;
      transition: background-color 140ms ease;
    }
    .vault-row:last-child {
      border-bottom: none;
    }
    .vault-row:hover {
      background: var(--color-surface-alt);
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
    @media (min-width: 640px) {
      .brief-grid {
        gap: var(--space-4);
      }
      .brief-section {
        padding: var(--space-5);
      }
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
