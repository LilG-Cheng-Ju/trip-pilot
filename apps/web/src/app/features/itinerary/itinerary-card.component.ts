import { Component, input, output } from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem } from '../../core/models/tripilot.models';

/** Renders split-transit and venue itinerary cards with synced map pin badges. */
@Component({
  selector: 'app-itinerary-card',
  imports: [TranslatePipe],
  template: `
    @if (item().type === 'LOCAL_TRANSIT') {
      <div class="connector-wrap">
        <div class="connector-line" aria-hidden="true"></div>
        <div class="connector-pill">
          <span class="ms-icon sm" aria-hidden="true">subway</span>
          <span>{{ item().title }}</span>
          @if (detail('duration_minutes')) {
            <span class="tabular-nums">· {{ detail('duration_minutes') }} min</span>
          }
          @if (mapsUrl()) {
            <a [href]="mapsUrl()" target="_blank" rel="noopener noreferrer" class="connector-link">
              <span class="ms-icon sm">open_in_new</span>
            </a>
          }
          @if (!readOnly()) {
            <button type="button" class="mini-btn" (click)="edited.emit(item())" aria-label="Edit">
              <span class="ms-icon sm">edit</span>
            </button>
            <button type="button" class="mini-btn" (click)="deleted.emit(item().id)" aria-label="Delete">
              <span class="ms-icon sm">close</span>
            </button>
          }
        </div>
        <div class="connector-line" aria-hidden="true"></div>
      </div>
    } @else if (item().type === 'FLIGHT') {
      <article
        class="card flight-card"
        [class.selected]="selected()"
        (click)="cardClicked.emit(item().id)"
      >
        <div class="flight-top">
          <span class="flight-tag">
            <span class="ms-icon sm" aria-hidden="true">flight</span>
            <span>{{ detail('flight_number') || item().title }}</span>
          </span>
          @if (detail('booking_ref')) {
            <span class="ref-chip">{{ detail('booking_ref') }}</span>
          }
        </div>
        <div class="flight-route tabular-nums">
          <div class="airport-col">
            <span class="iata">{{ detail('origin_iata') || '---' }}</span>
            <span class="time">{{ item().start_time || '--:--' }}</span>
          </div>
          <div class="flight-arc">
            <span class="arc-line"></span>
            @if (detail('distance_km')) {
              <span class="flight-km">{{ detail('distance_km') }} km</span>
            }
          </div>
          <div class="airport-col right">
            <span class="iata">{{ detail('dest_iata') || '---' }}</span>
            <span class="time">{{ item().end_time || '--:--' }}</span>
          </div>
        </div>
        @if (!readOnly()) {
          <div class="card-footer dark">
            <div class="order-controls">
              <button type="button" class="icon-btn dark" (click)="$event.stopPropagation(); moveUp.emit(item())" aria-label="Move up">
                <span class="ms-icon">keyboard_arrow_up</span>
              </button>
              <button type="button" class="icon-btn dark" (click)="$event.stopPropagation(); moveDown.emit(item())" aria-label="Move down">
                <span class="ms-icon">keyboard_arrow_down</span>
              </button>
            </div>
            <div class="right-controls">
              <button type="button" class="icon-btn dark" (click)="$event.stopPropagation(); edited.emit(item())" aria-label="Edit">
                <span class="ms-icon sm">edit</span>
              </button>
              <button type="button" class="icon-btn dark danger" (click)="$event.stopPropagation(); deleted.emit(item().id)" aria-label="Delete">
                <span class="ms-icon sm">delete</span>
              </button>
            </div>
          </div>
        }
      </article>
    } @else {
      <article
        class="card standard-card"
        [class.selected]="selected()"
        [attr.data-type]="item().type"
        (click)="cardClicked.emit(item().id)"
      >
        <div class="card-head">
          <div class="card-meta">
            @if (pinOrder() !== null) {
              <span class="pin-badge tabular-nums" [class.selected]="selected()">
                {{ pinOrder() }}
              </span>
            }
            <span class="type-pill">
              <span class="ms-icon sm" aria-hidden="true">{{ typeIcon() }}</span>
              <span>{{ typeLabel() | t }}</span>
            </span>
            @if (item().start_time) {
              <span class="time-pill tabular-nums">
                {{ item().start_time }}@if (item().end_time) { – {{ item().end_time }} }
              </span>
            }
          </div>
          @if (mapsUrl()) {
            <a
              class="nav-link"
              [href]="mapsUrl()"
              target="_blank"
              rel="noopener noreferrer"
              (click)="$event.stopPropagation()"
            >
              <span class="ms-icon sm" aria-hidden="true">near_me</span>
              <span>{{ 'common.navigate' | t }}</span>
            </a>
          }
        </div>

        <h4 class="card-title">{{ item().title }}</h4>

        @if (item().address) {
          <p class="card-sub">{{ item().address }}</p>
        }

        <div class="detail-chips">
          @if (detail('line_or_train_no')) {
            <span class="info-chip">
              <span class="ms-icon sm">train</span> {{ detail('line_or_train_no') }}
            </span>
          }
          @if (detail('seat')) {
            <span class="info-chip">{{ detail('seat') }}</span>
          }
          @if (detail('booking_ref')) {
            <span class="info-chip">Ref: {{ detail('booking_ref') }}</span>
          }
          @if (detail('confirmation_code')) {
            <span class="info-chip">Conf: {{ detail('confirmation_code') }}</span>
          }
          @if (detail('free_cancellation_deadline')) {
            <span class="alert-chip">
              <span class="ms-icon sm">warning</span> {{ detail('free_cancellation_deadline') }}
            </span>
          }
        </div>

        @if (item().notes) {
          <p class="card-notes">{{ item().notes }}</p>
        }

        @if (!readOnly()) {
          <div class="card-footer">
            <div class="order-controls">
              <button type="button" class="icon-btn" (click)="$event.stopPropagation(); moveUp.emit(item())" aria-label="Move up">
                <span class="ms-icon">keyboard_arrow_up</span>
              </button>
              <button type="button" class="icon-btn" (click)="$event.stopPropagation(); moveDown.emit(item())" aria-label="Move down">
                <span class="ms-icon">keyboard_arrow_down</span>
              </button>
              <button type="button" class="icon-btn alt-btn" (click)="$event.stopPropagation(); addAlternative.emit(item())">
                <span class="ms-icon sm" aria-hidden="true">alt_route</span>
                <span>{{ 'itinerary.choice.addAlt' | t }}</span>
              </button>
            </div>
            <div class="right-controls">
              <button type="button" class="icon-btn" (click)="$event.stopPropagation(); edited.emit(item())" aria-label="Edit">
                <span class="ms-icon sm">edit</span>
              </button>
              <button type="button" class="icon-btn danger" (click)="$event.stopPropagation(); deleted.emit(item().id)" aria-label="Delete">
                <span class="ms-icon sm">delete</span>
              </button>
            </div>
          </div>
        }
      </article>
    }
  `,
  styles: `
    .connector-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 2px 0;
    }
    .connector-line {
      width: 2px;
      height: 10px;
      background: var(--color-border);
    }
    .connector-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .connector-link {
      display: inline-flex;
      color: var(--color-primary);
      text-decoration: none;
    }
    .mini-btn {
      display: inline-flex;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 2px;
    }
    .card {
      border-radius: var(--radius-md);
      padding: var(--space-4);
      box-shadow: var(--shadow-card);
      transition: border-color 140ms ease, transform 140ms ease;
      cursor: pointer;
    }
    .card.selected {
      outline: 2px solid var(--color-accent);
      outline-offset: 1px;
    }
    .flight-card {
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      border: 1px solid var(--color-primary-soft);
    }
    .flight-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .flight-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .ref-chip {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.14);
      font-family: var(--font-mono);
      font-size: 0.75rem;
    }
    .flight-route {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--space-3);
    }
    .airport-col {
      display: flex;
      flex-direction: column;
    }
    .airport-col.right {
      text-align: right;
    }
    .iata {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .time {
      font-size: 0.8125rem;
      opacity: 0.8;
    }
    .flight-arc {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .arc-line {
      width: 100%;
      height: 1px;
      background: rgba(200, 155, 91, 0.55);
    }
    .flight-km {
      color: var(--color-accent);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .standard-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-left: 4px solid var(--item-spot);
    }
    .standard-card[data-type='STAY'] {
      border-left-color: var(--item-stay);
    }
    .standard-card[data-type='FOOD'] {
      border-left-color: var(--item-food);
    }
    .standard-card[data-type='RESERVED_TRANSIT'] {
      border-left-color: var(--item-reserved);
    }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: 8px;
    }
    .card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .pin-badge {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 800;
      flex-shrink: 0;
    }
    .pin-badge.selected {
      background: var(--color-accent);
    }
    .type-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-primary);
      font-size: 0.72rem;
      font-weight: 700;
    }
    .time-pill {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .nav-link {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
      text-decoration: none;
    }
    .card-title {
      margin: 0 0 4px;
      font-size: 1rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .card-sub {
      margin: 0 0 6px;
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
    }
    .detail-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .info-chip,
    .alert-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .info-chip {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .alert-chip {
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    .card-notes {
      margin: 8px 0 0;
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      white-space: pre-line;
    }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: var(--space-3);
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border);
    }
    .card-footer.dark {
      border-top-color: rgba(255, 255, 255, 0.14);
    }
    .order-controls,
    .right-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 34px;
      height: 34px;
      padding: 0 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .icon-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .icon-btn.dark {
      border-color: rgba(255, 255, 255, 0.25);
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }
    .icon-btn.danger {
      border-color: rgba(217, 107, 82, 0.4);
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    .icon-btn.danger:hover {
      border-color: var(--color-alert);
      background: var(--color-alert);
      color: #ffffff;
    }
    .icon-btn.dark.danger {
      border-color: rgba(217, 107, 82, 0.6);
      background: rgba(217, 107, 82, 0.22);
      color: #ffd6cc;
    }
    .icon-btn.alt-btn {
      border-style: dashed;
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
      color: #8b652d;
    }
  `,
})
export class ItineraryCardComponent {
  readonly item = input.required<ItineraryItem>();
  readonly pinOrder = input<number | null>(null);
  readonly selected = input(false);
  readonly readOnly = input(false);

  readonly cardClicked = output<string>();
  readonly moveUp = output<ItineraryItem>();
  readonly moveDown = output<ItineraryItem>();
  readonly addAlternative = output<ItineraryItem>();
  readonly edited = output<ItineraryItem>();
  readonly deleted = output<string>();

  protected detail(key: string): string | null {
    const val = this.item().details?.[key];
    return val === undefined || val === null || val === '' ? null : String(val);
  }

  protected typeIcon(): string {
    switch (this.item().type) {
      case 'FLIGHT':
        return 'flight';
      case 'RESERVED_TRANSIT':
        return 'train';
      case 'LOCAL_TRANSIT':
        return 'subway';
      case 'STAY':
        return 'hotel';
      case 'FOOD':
        return 'restaurant';
      default:
        return 'place';
    }
  }

  protected typeLabel():
    | 'item.type.flight'
    | 'item.type.reservedTransit'
    | 'item.type.localTransit'
    | 'item.type.stay'
    | 'item.type.spot'
    | 'item.type.food' {
    switch (this.item().type) {
      case 'FLIGHT':
        return 'item.type.flight';
      case 'RESERVED_TRANSIT':
        return 'item.type.reservedTransit';
      case 'LOCAL_TRANSIT':
        return 'item.type.localTransit';
      case 'STAY':
        return 'item.type.stay';
      case 'FOOD':
        return 'item.type.food';
      default:
        return 'item.type.spot';
    }
  }

  protected mapsUrl(): string | null {
    const it = this.item();
    if (it.google_maps_url) {
      return it.google_maps_url;
    }
    if (it.latitude !== null && it.longitude !== null) {
      return `https://www.google.com/maps/search/?api=1&query=${it.latitude},${it.longitude}`;
    }
    if (it.address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.address)}`;
    }
    return null;
  }
}
