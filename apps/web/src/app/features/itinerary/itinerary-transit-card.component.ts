import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem } from '../../core/models/tripilot.models';
import {
  buildGoogleMapsUrl,
  getItemDetailString,
} from '../../core/utils/travel-format.utils';
import { ItineraryCardMenuComponent } from './itinerary-card-menu.component';

/** Compact timeline connector pill for LOCAL_TRANSIT segments. */
@Component({
  selector: 'app-itinerary-transit-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ItineraryCardMenuComponent],
  template: `
    <div class="connector-wrap">
      <div class="connector-line" aria-hidden="true"></div>
      <div class="connector-pill">
        <span class="ms-icon sm" aria-hidden="true">subway</span>
        <span class="connector-title" [title]="item().title">{{ item().title }}</span>
        @if (detail('duration_minutes')) {
          <span class="tabular-nums connector-dur">· {{ detail('duration_minutes') }} min</span>
        }
        @if (mapsUrl()) {
          <a
            [href]="mapsUrl()"
            target="_blank"
            rel="noopener noreferrer"
            class="icon-btn connector-icon-btn connector-link"
            [title]="'common.navigate' | t"
            [attr.aria-label]="'common.navigate' | t"
          >
            <span class="ms-icon sm" aria-hidden="true">open_in_new</span>
          </a>
        }
        @if (!readOnly()) {
          <button
            type="button"
            class="icon-btn connector-icon-btn connector-spend-btn"
            (click)="logExpense.emit(item())"
            [title]="'item.logExpense' | t"
            [attr.aria-label]="'item.logExpense' | t"
          >
            <span class="ms-icon sm" aria-hidden="true">payments</span>
          </button>
          <app-itinerary-card-menu
            variant="connector"
            [showOrderActions]="true"
            [canMoveUp]="canMoveUp()"
            [canMoveDown]="canMoveDown()"
            [showMoveToDay]="showMoveToDay()"
            (moveUp)="moveUp.emit(item())"
            (moveDown)="moveDown.emit(item())"
            (moveToDay)="moveToDay.emit(item())"
            (edited)="edited.emit(item())"
            (deleted)="deleted.emit(item().id)"
          />
        }
      </div>
      <div class="connector-line" aria-hidden="true"></div>
    </div>
  `,
  styles: `
    .connector-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      min-width: 0;
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
      flex-wrap: nowrap;
      max-width: 100%;
      min-width: 0;
      gap: 4px;
      padding: 3px 6px 3px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border-soft);
      color: var(--color-text-secondary);
      font-size: 0.76rem;
      font-weight: 600;
    }
    .connector-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .connector-dur {
      flex-shrink: 0;
      white-space: nowrap;
      color: var(--color-text-muted);
    }
    .connector-icon-btn {
      min-width: 26px;
      min-height: 26px;
      width: 26px;
      height: 26px;
      border-radius: var(--radius-xs);
    }
    .connector-icon-btn::after {
      content: '';
      position: absolute;
      inset: -4px;
    }
    .connector-link {
      color: var(--color-primary);
    }
    .connector-link:hover:not(:disabled),
    .connector-link:focus-visible:not(:disabled) {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .connector-spend-btn {
      color: var(--color-accent-ink);
    }
    .connector-spend-btn:hover:not(:disabled),
    .connector-spend-btn:focus-visible:not(:disabled) {
      background: var(--color-accent-tint);
      color: var(--color-accent-ink);
    }
  `,
})
export class ItineraryTransitCardComponent {
  readonly item = input.required<ItineraryItem>();
  readonly readOnly = input(false);
  readonly canMoveUp = input(true);
  readonly canMoveDown = input(true);
  readonly showMoveToDay = input(false);

  readonly moveUp = output<ItineraryItem>();
  readonly moveDown = output<ItineraryItem>();
  readonly moveToDay = output<ItineraryItem>();
  readonly logExpense = output<ItineraryItem>();
  readonly edited = output<ItineraryItem>();
  readonly deleted = output<string>();

  protected detail(key: string): string | null {
    return getItemDetailString(this.item().details, key);
  }

  protected mapsUrl(): string | null {
    return buildGoogleMapsUrl(this.item());
  }
}
