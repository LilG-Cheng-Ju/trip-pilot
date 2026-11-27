import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItemAttachment, ItineraryItem } from '../../core/models/tripilot.models';
import {
  extractItemAttachments,
  getItemDetailString,
} from '../../core/utils/travel-format.utils';
import { ItemExpenseSummary } from '../../state/expense.store';

/** Shared itinerary card footer displaying metadata, attachments, expense link, and ordering controls. */
@Component({
  selector: 'app-itinerary-card-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (!readOnly() || hasFooterPills()) {
      <div class="card-footer" [class.dark]="dark()" (click)="$event.stopPropagation()">
        <div
          class="footer-pills"
          [class.dark]="dark()"
          (wheel)="onFooterWheel($event)"
        >
          @if (hasDetailChips()) {
            <div class="footer-meta tabular-nums" [class.dark]="dark()">
              @if (showTransitMeta()) {
                @if (detail('line_or_train_no'); as trainNo) {
                  <span class="meta-item">{{ trainNo }}</span>
                }
                @if (detail('seat'); as seat) {
                  <span class="meta-item">{{ seat }}</span>
                }
              }
              @if (detail('booking_ref'); as ref) {
                <span class="meta-item">
                  {{ 'detail.bookingRef' | t }} <span class="font-mono">{{ ref }}</span>
                </span>
              }
              @if (detail('confirmation_code'); as conf) {
                <span class="meta-item">
                  {{ 'detail.confirmation' | t }} <span class="font-mono">{{ conf }}</span>
                </span>
              }
              @if (detail('free_cancellation_deadline'); as cancel) {
                <span class="meta-item alert">{{ 'detail.freeCancelBy' | t }} {{ cancel }}</span>
              }
            </div>
          }
          @for (att of attachments(); track $index) {
            <a
              class="attachment-chip"
              [class.dark]="dark()"
              [href]="att.url"
              target="_blank"
              rel="noopener noreferrer"
              [title]="att.name"
            >
              <span class="ms-icon sm" aria-hidden="true">attach_file</span>
              <span class="chip-truncate">{{ att.name }}</span>
            </a>
          }
          @if (expenseSummary(); as exp) {
            @if (tripId()) {
              <a
                class="head-expense-pill tabular-nums"
                [class.dark]="dark()"
                [routerLink]="['/trips', tripId(), 'expenses']"
                [queryParams]="{ itemId: item().id }"
                [title]="
                  'expenses.itemSummary'
                    | t: { count: exp.count, currency: exp.currencyHome, total: formatAmount(exp.totalHome) }
                "
              >
                <span class="ms-icon sm" aria-hidden="true">payments</span>
                <span>{{ exp.currencyHome }} {{ formatAmount(exp.totalHome) }}</span>
              </a>
            }
          }
        </div>

        @if (!readOnly()) {
          <div class="order-controls">
            <button
              type="button"
              class="icon-btn order-btn"
              [class.icon-btn--dark]="dark()"
              [disabled]="!canMoveUp()"
              (click)="moveUp.emit(item())"
              [attr.aria-label]="'item.moveUp' | t"
            >
              <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_up</span>
            </button>
            <button
              type="button"
              class="icon-btn order-btn"
              [class.icon-btn--dark]="dark()"
              [disabled]="!canMoveDown()"
              (click)="moveDown.emit(item())"
              [attr.aria-label]="'item.moveDown' | t"
            >
              <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_down</span>
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: nowrap;
      gap: 8px;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--color-border-soft);
    }
    .card-footer.dark {
      border-top-color: rgba(255, 255, 255, 0.12);
    }
    .footer-pills {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: rgba(20, 24, 31, 0.22) transparent;
      padding-bottom: 2px;
      gap: 10px;
    }
    .footer-pills::-webkit-scrollbar {
      height: 4px;
    }
    .footer-pills::-webkit-scrollbar-thumb {
      background: rgba(20, 24, 31, 0.18);
      border-radius: var(--radius-pill);
    }
    .footer-pills:hover::-webkit-scrollbar-thumb {
      background: rgba(20, 24, 31, 0.32);
    }
    .footer-pills.dark {
      scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
    }
    .footer-pills.dark::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.26);
    }
    .footer-meta {
      display: inline-flex;
      align-items: center;
      flex-wrap: nowrap;
      flex-shrink: 0;
      font-size: 0.74rem;
      font-weight: 500;
      color: var(--color-text-secondary);
      white-space: nowrap;
    }
    .footer-meta.dark {
      color: rgba(248, 250, 252, 0.8);
    }
    .meta-item + .meta-item::before {
      content: '·';
      margin: 0 6px;
      color: var(--color-text-muted);
    }
    .footer-meta.dark .meta-item + .meta-item::before {
      color: rgba(248, 250, 252, 0.42);
    }
    .meta-item.alert {
      color: var(--color-alert);
    }
    .footer-meta.dark .meta-item.alert {
      color: var(--color-alert-light);
    }
    .attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      background: var(--color-surface-alt);
      color: var(--color-primary);
      text-decoration: none;
      font-size: 0.74rem;
      font-weight: 500;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background-color 140ms ease;
    }
    .attachment-chip:hover {
      background: var(--color-primary-tint);
    }
    .attachment-chip.dark {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text-on-primary);
    }
    .attachment-chip.dark:hover {
      background: rgba(255, 255, 255, 0.18);
    }
    .chip-truncate {
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .head-expense-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-accent-border);
      background: var(--color-accent-tint);
      color: var(--color-accent-ink);
      text-decoration: none;
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
      transition: border-color 140ms ease, background-color 140ms ease;
    }
    .head-expense-pill:hover {
      border-color: var(--color-accent);
    }
    .head-expense-pill.dark {
      border-color: var(--color-accent-border);
      background: var(--color-accent-tint);
      color: var(--color-accent-light);
    }
    .head-expense-pill.dark:hover {
      border-color: var(--color-accent);
      background: rgba(196, 146, 76, 0.22);
    }
    .order-controls {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: auto;
    }
    .order-btn {
      color: var(--color-text-muted);
    }
    .icon-btn--dark {
      color: rgba(248, 250, 252, 0.82);
    }
    .icon-btn--dark:hover:not(:disabled),
    .icon-btn--dark:focus-visible:not(:disabled) {
      background: rgba(255, 255, 255, 0.14);
      color: var(--color-text-on-primary);
    }
  `,
})
export class ItineraryCardFooterComponent {
  readonly item = input.required<ItineraryItem>();
  readonly tripId = input('');
  readonly readOnly = input(false);
  readonly canMoveUp = input(true);
  readonly canMoveDown = input(true);
  readonly expenseSummary = input<ItemExpenseSummary | null>(null);
  readonly dark = input(false);
  readonly showTransitMeta = input(true);

  readonly moveUp = output<ItineraryItem>();
  readonly moveDown = output<ItineraryItem>();

  protected readonly attachments = computed<ItemAttachment[]>(() =>
    extractItemAttachments(this.item().details),
  );

  protected detail(key: string): string | null {
    return getItemDetailString(this.item().details, key);
  }

  protected hasDetailChips(): boolean {
    const hasTransit =
      this.showTransitMeta() &&
      Boolean(this.detail('line_or_train_no') || this.detail('seat'));
    return (
      hasTransit ||
      Boolean(
        this.detail('booking_ref') ||
          this.detail('confirmation_code') ||
          this.detail('free_cancellation_deadline'),
      )
    );
  }

  protected hasFooterPills(): boolean {
    return (
      this.hasDetailChips() ||
      this.attachments().length > 0 ||
      Boolean(this.expenseSummary() && this.tripId())
    );
  }

  protected formatAmount(value: number): string {
    return Math.round(value).toLocaleString();
  }

  protected onFooterWheel(event: WheelEvent): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || el.scrollWidth <= el.clientWidth) {
      return;
    }
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    }
  }
}
