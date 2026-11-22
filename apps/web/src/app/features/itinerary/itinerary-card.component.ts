import { Component, input, output } from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem } from '../../core/models/tripilot.models';

/** Renders split-transit and venue itinerary cards with one-tap Google Maps deep links. */
@Component({
  selector: 'app-itinerary-card',
  imports: [TranslatePipe],
  template: `
    @if (item().type === 'LOCAL_TRANSIT') {
      <div class="connector-wrap">
        <div class="connector-line" aria-hidden="true"></div>
        <div class="connector-pill">
          <span>🚇 {{ item().title }}</span>
          @if (detail('duration_minutes')) {
            <span class="tabular-nums">· {{ detail('duration_minutes') }} min</span>
          }
          @if (mapsUrl()) {
            <a [href]="mapsUrl()" target="_blank" rel="noopener noreferrer" class="connector-link">↗</a>
          }
          @if (!readOnly()) {
            <button type="button" class="mini-btn" (click)="deleted.emit(item().id)" aria-label="Delete">×</button>
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
          <span class="flight-tag">✈ {{ detail('flight_number') || item().title }}</span>
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
              <button type="button" class="icon-btn dark" (click)="$event.stopPropagation(); moveUp.emit(item())">↑</button>
              <button type="button" class="icon-btn dark" (click)="$event.stopPropagation(); moveDown.emit(item())">↓</button>
            </div>
            <button type="button" class="icon-btn dark danger" (click)="$event.stopPropagation(); deleted.emit(item().id)">
              {{ 'common.delete' | t }}
            </button>
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
            <span class="type-pill">{{ typeLabel() | t }}</span>
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
              📍 {{ 'common.navigate' | t }}
            </a>
          }
        </div>

        <h4 class="card-title">{{ item().title }}</h4>

        @if (item().address) {
          <p class="card-sub">{{ item().address }}</p>
        }

        <div class="detail-chips">
          @if (detail('line_or_train_no')) {
            <span class="info-chip">🚅 {{ detail('line_or_train_no') }}</span>
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
            <span class="alert-chip">⚠ {{ detail('free_cancellation_deadline') }}</span>
          }
        </div>

        @if (item().notes) {
          <p class="card-notes">{{ item().notes }}</p>
        }

        @if (!readOnly()) {
          <div class="card-footer">
            <div class="order-controls">
              <button type="button" class="icon-btn" (click)="$event.stopPropagation(); moveUp.emit(item())">↑</button>
              <button type="button" class="icon-btn" (click)="$event.stopPropagation(); moveDown.emit(item())">↓</button>
              <button type="button" class="icon-btn alt-btn" (click)="$event.stopPropagation(); addAlternative.emit(item())">
                {{ 'itinerary.choice.addAlt' | t }}
              </button>
            </div>
            <button type="button" class="icon-btn danger" (click)="$event.stopPropagation(); deleted.emit(item().id)">
              {{ 'common.delete' | t }}
            </button>
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
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 700;
    }
    .mini-btn {
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: 0.875rem;
      padding: 0 2px;
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
      margin-bottom: 6px;
    }
    .card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .type-pill {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-primary);
      font-size: 0.7rem;
      font-weight: 700;
    }
    .time-pill {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .nav-link {
      font-size: 0.75rem;
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
    .info-chip {
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .alert-chip {
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      background: var(--color-alert-soft);
      color: var(--color-alert);
      font-size: 0.75rem;
      font-weight: 600;
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
    .order-controls {
      display: flex;
      gap: 6px;
    }
    .icon-btn {
      padding: 4px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .icon-btn.dark {
      border-color: rgba(255, 255, 255, 0.25);
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }
    .icon-btn.danger {
      color: var(--color-alert);
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
  readonly selected = input(false);
  readonly readOnly = input(false);

  readonly cardClicked = output<string>();
  readonly moveUp = output<ItineraryItem>();
  readonly moveDown = output<ItineraryItem>();
  readonly addAlternative = output<ItineraryItem>();
  readonly deleted = output<string>();

  protected detail(key: string): string | null {
    const val = this.item().details?.[key];
    return val === undefined || val === null || val === '' ? null : String(val);
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
