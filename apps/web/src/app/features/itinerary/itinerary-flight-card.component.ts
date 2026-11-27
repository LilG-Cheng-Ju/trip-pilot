import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem } from '../../core/models/tripilot.models';
import { getItemDetailString } from '../../core/utils/travel-format.utils';
import { ItemExpenseSummary } from '../../state/expense.store';
import { ItineraryCardFooterComponent } from './itinerary-card-footer.component';
import { ItineraryCardMenuComponent } from './itinerary-card-menu.component';

/** Deep-navy boarding-pass card for FLIGHT itinerary items. */
@Component({
  selector: 'app-itinerary-flight-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ItineraryCardMenuComponent, ItineraryCardFooterComponent],
  template: `
    <article
      class="card flight-card"
      tabindex="0"
      [class.selected]="selected()"
      (click)="cardClicked.emit(item().id)"
      (keydown)="onCardKeydown($event)"
    >
      <div class="flight-top">
        <div class="flight-head-left">
          <span class="flight-tag">
            <span class="ms-icon sm" aria-hidden="true">flight</span>
            <span>{{ detail('flight_number') || item().title }}</span>
          </span>
        </div>

        @if (!readOnly()) {
          <div class="head-actions" (click)="$event.stopPropagation()">
            <button
              type="button"
              class="icon-btn icon-btn--dark accent-dark"
              [title]="'item.logExpense' | t"
              [attr.aria-label]="'item.logExpense' | t"
              (click)="logExpense.emit(item())"
            >
              <span class="ms-icon sm" aria-hidden="true">payments</span>
            </button>
            <app-itinerary-card-menu
              variant="dark"
              (edited)="edited.emit(item())"
              (deleted)="deleted.emit(item().id)"
            />
          </div>
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

      <app-itinerary-card-footer
        [item]="item()"
        [tripId]="tripId()"
        [readOnly]="readOnly()"
        [canMoveUp]="canMoveUp()"
        [canMoveDown]="canMoveDown()"
        [expenseSummary]="expenseSummary()"
        [dark]="true"
        [showTransitMeta]="false"
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
    .flight-card {
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      border: 1px solid var(--color-primary-soft);
    }
    .flight-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: var(--space-3);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .flight-head-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .flight-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .head-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .icon-btn--dark {
      color: rgba(248, 250, 252, 0.82);
    }
    .icon-btn--dark:hover:not(:disabled),
    .icon-btn--dark:focus-visible:not(:disabled) {
      background: rgba(255, 255, 255, 0.14);
      color: var(--color-text-on-primary);
    }
    .icon-btn--dark.accent-dark {
      color: var(--color-accent-light);
    }
    .icon-btn--dark.accent-dark:hover:not(:disabled),
    .icon-btn--dark.accent-dark:focus-visible:not(:disabled) {
      background: var(--color-accent-tint);
      color: var(--color-accent-light);
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
      font-weight: 600;
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
      background: var(--color-accent-border);
    }
    .flight-km {
      color: var(--color-accent);
      font-size: 0.75rem;
      font-weight: 600;
    }
  `,
})
export class ItineraryFlightCardComponent {
  readonly item = input.required<ItineraryItem>();
  readonly tripId = input('');
  readonly selected = input(false);
  readonly readOnly = input(false);
  readonly canMoveUp = input(true);
  readonly canMoveDown = input(true);
  readonly expenseSummary = input<ItemExpenseSummary | null>(null);

  readonly cardClicked = output<string>();
  readonly moveUp = output<ItineraryItem>();
  readonly moveDown = output<ItineraryItem>();
  readonly logExpense = output<ItineraryItem>();
  readonly edited = output<ItineraryItem>();
  readonly deleted = output<string>();

  protected detail(key: string): string | null {
    return getItemDetailString(this.item().details, key);
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
}
