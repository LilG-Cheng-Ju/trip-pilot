import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { COPY_FEEDBACK_DURATION_MS } from '../../core/constants/app-limits';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem } from '../../core/models/tripilot.models';
import {
  buildGoogleMapsUrl,
  getItemDetailString,
} from '../../core/utils/travel-format.utils';
import { ItemExpenseSummary } from '../../state/expense.store';
import { ItineraryCardFooterComponent } from './itinerary-card-footer.component';
import { ItineraryCardMenuComponent } from './itinerary-card-menu.component';

/** Standard itinerary card for SPOT, FOOD, STAY, and RESERVED_TRANSIT entries. */
@Component({
  selector: 'app-itinerary-venue-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ItineraryCardMenuComponent, ItineraryCardFooterComponent],
  template: `
    <article
      class="card standard-card"
      tabindex="0"
      [class.selected]="selected()"
      [attr.data-type]="item().type"
      (click)="cardClicked.emit(item().id)"
      (keydown)="onCardKeydown($event)"
    >
      <div class="card-head">
        <div class="card-meta">
          @if (pinOrder() !== null) {
            <span
              class="pin-badge tabular-nums"
              [attr.data-type]="item().type"
              [class.selected]="selected()"
            >
              {{ pinOrder() }}
            </span>
          }
          <div class="meta-text">
            <span class="type-label">
              @if (pinOrder() === null) {
                <span class="type-dot" [attr.data-type]="item().type" aria-hidden="true"></span>
              }
              <span>{{ typeLabel() | t }}</span>
            </span>
            @if (item().start_time) {
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="time-text tabular-nums">
                {{ item().start_time }}@if (item().end_time) { – {{ item().end_time }} }
              </span>
            }
          </div>
        </div>

        <div class="head-actions" (click)="$event.stopPropagation()">
          @if (mapsUrl()) {
            <a
              class="icon-btn head-nav-btn"
              [href]="mapsUrl()"
              target="_blank"
              rel="noopener noreferrer"
              [title]="'common.navigate' | t"
              [attr.aria-label]="'common.navigate' | t"
            >
              <span class="ms-icon sm" aria-hidden="true">near_me</span>
            </a>
          }

          @if (!readOnly()) {
            <button
              type="button"
              class="icon-btn expense-trigger"
              [title]="'item.logExpense' | t"
              [attr.aria-label]="'item.logExpense' | t"
              (click)="logExpense.emit(item())"
            >
              <span class="ms-icon sm" aria-hidden="true">payments</span>
            </button>

            <app-itinerary-card-menu
              variant="standard"
              [showAddAlternative]="true"
              [showMoveToDay]="showMoveToDay()"
              (edited)="edited.emit(item())"
              (addAlternative)="addAlternative.emit(item())"
              (moveToDay)="moveToDay.emit(item())"
              (deleted)="deleted.emit(item().id)"
            />
          }
        </div>
      </div>

      <h4 class="card-title">{{ item().title }}</h4>

      @if (item().address) {
        <p class="card-sub">{{ item().address }}</p>
      }

      @if (detail('local_name'); as localName) {
        <button
          type="button"
          class="local-copy-chip"
          (click)="$event.stopPropagation(); copyLocalName(localName)"
          [title]="localName"
        >
          <span class="ms-icon sm" aria-hidden="true">
            {{ copiedLocal() ? 'check' : 'content_copy' }}
          </span>
          <span class="chip-truncate">
            {{ copiedLocal() ? ('common.copied' | t) : localName }}
          </span>
        </button>
      }

      @if (item().notes) {
        <p class="card-notes">{{ item().notes }}</p>
      }

      <app-itinerary-card-footer
        [item]="item()"
        [tripId]="tripId()"
        [readOnly]="readOnly()"
        [canMoveUp]="canMoveUp()"
        [canMoveDown]="canMoveDown()"
        [expenseSummary]="expenseSummary()"
        [dark]="false"
        [showTransitMeta]="true"
        (moveUp)="moveUp.emit($event)"
        (moveDown)="moveDown.emit($event)"
      />
    </article>
  `,
  styles: `
    .card {
      border-radius: var(--radius-md);
      padding: var(--space-3) var(--space-4);
      box-shadow: var(--shadow-card);
      transition: border-color 140ms ease, transform 140ms ease;
      cursor: pointer;
    }
    .card.selected {
      outline: 2px solid var(--color-accent);
      outline-offset: 1px;
    }
    .card:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    .standard-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
    }
    .standard-card:hover {
      border-color: var(--color-border-strong);
    }
    .type-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--item-spot);
      flex-shrink: 0;
    }
    .type-dot[data-type='STAY'] {
      background: var(--item-stay);
    }
    .type-dot[data-type='FOOD'] {
      background: var(--item-food);
    }
    .type-dot[data-type='RESERVED_TRANSIT'] {
      background: var(--item-reserved);
    }
    .card-head {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: 6px;
    }
    .card-meta {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .meta-text {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 2px 6px;
      min-width: 0;
    }
    .pin-badge {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: var(--radius-pill);
      background: var(--item-spot);
      color: var(--color-text-on-primary);
      font-size: 0.75rem;
      font-weight: 600;
      flex-shrink: 0;
      transition: box-shadow 140ms ease;
    }
    .pin-badge[data-type='FOOD'] {
      background: var(--item-food);
    }
    .pin-badge[data-type='STAY'] {
      background: var(--item-stay);
    }
    .pin-badge[data-type='RESERVED_TRANSIT'] {
      background: var(--item-reserved);
    }
    .pin-badge.selected {
      box-shadow:
        0 0 0 2px var(--color-surface),
        0 0 0 4px var(--color-accent);
    }
    .type-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--color-text-secondary);
      font-size: var(--text-badge);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .meta-sep {
      color: var(--color-text-muted);
      font-size: var(--text-badge);
      font-weight: 600;
      user-select: none;
    }
    .time-text {
      font-family: var(--font-mono);
      font-size: 0.74rem;
      font-weight: 500;
      color: var(--color-text-muted);
    }
    .head-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .head-nav-btn {
      color: var(--color-primary);
    }
    .head-nav-btn:hover:not(:disabled),
    .head-nav-btn:focus-visible:not(:disabled) {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .icon-btn.expense-trigger {
      color: var(--color-accent-ink);
    }
    .icon-btn.expense-trigger:hover:not(:disabled),
    .icon-btn.expense-trigger:focus-visible:not(:disabled) {
      background: var(--color-accent-tint);
      color: var(--color-accent-ink);
    }
    .card-title {
      margin: 2px 0 3px;
      font-size: var(--text-card-title);
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.015em;
      color: var(--color-text-primary);
    }
    .card-sub {
      margin: 0 0 5px;
      font-size: var(--text-card-meta);
      line-height: 1.45;
      color: var(--color-text-muted);
    }
    .local-copy-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      margin: 0 0 6px -6px;
      padding: 3px 6px;
      border: none;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.76rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 140ms ease, color 140ms ease;
    }
    .local-copy-chip:hover,
    .local-copy-chip:focus-visible {
      background: rgba(20, 24, 31, 0.05);
      color: var(--color-primary);
    }
    .chip-truncate {
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-notes {
      margin: 7px 0 0;
      font-size: var(--text-card-body);
      line-height: 1.55;
      color: var(--color-text-secondary);
      white-space: pre-line;
    }
    @media (max-width: 380px) {
      .card {
        padding: var(--space-3);
      }
      .card-head {
        align-items: flex-start;
        gap: 6px;
      }
      .meta-text {
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
      }
      .meta-sep {
        display: none;
      }
      .head-actions .icon-btn {
        min-width: 28px;
        min-height: 28px;
      }
    }
  `,
})
export class ItineraryVenueCardComponent {
  readonly item = input.required<ItineraryItem>();
  readonly tripId = input('');
  readonly pinOrder = input<number | null>(null);
  readonly selected = input(false);
  readonly readOnly = input(false);
  readonly canMoveUp = input(true);
  readonly canMoveDown = input(true);
  readonly showMoveToDay = input(false);
  readonly expenseSummary = input<ItemExpenseSummary | null>(null);

  readonly cardClicked = output<string>();
  readonly moveUp = output<ItineraryItem>();
  readonly moveDown = output<ItineraryItem>();
  readonly moveToDay = output<ItineraryItem>();
  readonly addAlternative = output<ItineraryItem>();
  readonly logExpense = output<ItineraryItem>();
  readonly edited = output<ItineraryItem>();
  readonly deleted = output<string>();

  protected readonly copiedLocal = signal(false);

  protected detail(key: string): string | null {
    return getItemDetailString(this.item().details, key);
  }

  protected mapsUrl(): string | null {
    return buildGoogleMapsUrl(this.item());
  }

  protected typeLabel():
    | 'item.type.reservedTransit'
    | 'item.type.stay'
    | 'item.type.spot'
    | 'item.type.food' {
    switch (this.item().type) {
      case 'RESERVED_TRANSIT':
        return 'item.type.reservedTransit';
      case 'STAY':
        return 'item.type.stay';
      case 'FOOD':
        return 'item.type.food';
      default:
        return 'item.type.spot';
    }
  }

  protected onCardKeydown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.cardClicked.emit(this.item().id);
    }
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
