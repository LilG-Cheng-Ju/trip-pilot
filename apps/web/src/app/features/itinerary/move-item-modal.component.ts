import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { DayOption, ItineraryItem, TripDay } from '../../core/models/tripilot.models';
import { formatDateWithWeekday } from '../../core/utils/travel-format.utils';
import { AppModalComponent } from '../../shared/modal.component';

export interface MoveItemConfirmEvent {
  itemId: string;
  targetOptionId: string;
}

/** Pure presentational modal for choosing a target day (and Plan A/B option) to move an item into. */
@Component({
  selector: 'app-move-item-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppModalComponent],
  template: `
    <app-modal [open]="open()" [title]="'itinerary.move.title' | t" (closed)="closed.emit()">
      @if (item(); as stop) {
        <div class="move-body">
          <div class="stop-banner">
            <span class="ms-icon sm stop-ico" aria-hidden="true">drive_file_move</span>
            <strong class="stop-title">{{ stop.title }}</strong>
            @if (stop.start_time) {
              <span class="stop-time tabular-nums">{{ stop.start_time }}</span>
            }
          </div>

          <div class="day-list" role="radiogroup" [attr.aria-label]="'itinerary.move.title' | t">
            @for (day of sortedDays(); track day.id) {
              @let options = sortedOptions(day);
              @if (options.length === 1) {
                @let opt = options[0];
                @let isCurrent = opt.id === currentOptionId();
                @let isSelected = selectedOptionId() === opt.id;
                <button
                  type="button"
                  role="radio"
                  class="day-card single"
                  [class.selected]="isSelected"
                  [class.current]="isCurrent"
                  [attr.aria-checked]="isSelected"
                  [disabled]="isCurrent || moving()"
                  (click)="selectedOptionId.set(opt.id)"
                >
                  <div class="day-main">
                    <div class="day-heading tabular-nums">
                      <span class="day-num">Day {{ day.day_index }}</span>
                      <span class="day-date">{{ formatDate(day.date) }}</span>
                    </div>
                    @if (day.title) {
                      <div class="day-theme">{{ day.title }}</div>
                    }
                  </div>
                  @if (isCurrent) {
                    <span class="current-badge">{{ 'itinerary.move.currentBadge' | t }}</span>
                  } @else if (isSelected) {
                    <span class="ms-icon sm check-ico" aria-hidden="true">check_circle</span>
                  }
                </button>
              } @else {
                <div class="day-card multi">
                  <div class="day-main">
                    <div class="day-heading tabular-nums">
                      <span class="day-num">Day {{ day.day_index }}</span>
                      <span class="day-date">{{ formatDate(day.date) }}</span>
                    </div>
                    @if (day.title) {
                      <div class="day-theme">{{ day.title }}</div>
                    }
                  </div>
                  <div class="plan-pills">
                    @for (opt of options; track opt.id) {
                      @let isCurrent = opt.id === currentOptionId();
                      @let isSelected = selectedOptionId() === opt.id;
                      <button
                        type="button"
                        role="radio"
                        class="plan-chip"
                        [class.selected]="isSelected"
                        [class.current]="isCurrent"
                        [attr.aria-checked]="isSelected"
                        [disabled]="isCurrent || moving()"
                        (click)="selectedOptionId.set(opt.id)"
                      >
                        <span>{{ opt.label }}</span>
                        @if (isCurrent) {
                          <small>({{ 'itinerary.move.currentBadge' | t }})</small>
                        }
                      </button>
                    }
                  </div>
                </div>
              }
            }
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-ghost" [disabled]="moving()" (click)="closed.emit()">
              {{ 'common.cancel' | t }}
            </button>
            <button
              type="button"
              class="btn-primary"
              [disabled]="!selectedOptionId() || moving()"
              (click)="confirm()"
            >
              {{ moving() ? ('itinerary.move.moving' | t) : ('itinerary.move.confirm' | t) }}
            </button>
          </div>
        </div>
      }
    </app-modal>
  `,
  styles: `
    .move-body {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .stop-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 11px;
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      min-width: 0;
    }
    .stop-ico {
      color: var(--color-accent);
      flex-shrink: 0;
    }
    .stop-title {
      flex: 1;
      min-width: 0;
      font-size: 0.875rem;
      color: var(--color-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .stop-time {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-text-secondary);
      flex-shrink: 0;
    }
    .day-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 52dvh;
      overflow-y: auto;
      padding: 1px;
    }
    .day-card {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      font: inherit;
      text-align: left;
      transition: border-color 140ms ease, background-color 140ms ease;
    }
    .day-card.single {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      cursor: pointer;
    }
    .day-card.single:hover:not(:disabled) {
      border-color: var(--color-border-strong);
      background: var(--color-bg);
    }
    .day-card.single.selected {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
    }
    .day-card.single.current {
      background: var(--color-surface-alt);
      opacity: 0.7;
      cursor: not-allowed;
    }
    .day-card.multi {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .day-main {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .day-heading {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .day-num {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .day-date {
      font-size: 0.76rem;
      color: var(--color-text-secondary);
    }
    .day-theme {
      font-size: 0.76rem;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .current-badge {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: 0.72rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .check-ico {
      color: var(--color-primary);
      flex-shrink: 0;
    }
    .plan-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .plan-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }
    .plan-chip:hover:not(:disabled) {
      border-color: var(--color-primary);
    }
    .plan-chip.selected {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .plan-chip.current {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .plan-chip small {
      font-size: 0.7rem;
      font-weight: 500;
    }
  `,
})
export class MoveItemModalComponent {
  private readonly i18n = inject(I18nService);

  readonly open = input(false);
  readonly item = input<ItineraryItem | null>(null);
  readonly days = input<readonly TripDay[]>([]);
  readonly currentOptionId = input('');
  readonly moving = input(false);

  readonly closed = output<void>();
  readonly confirmed = output<MoveItemConfirmEvent>();

  protected readonly selectedOptionId = signal<string | null>(null);

  protected readonly sortedDays = computed(() =>
    [...this.days()].sort((a, b) => a.day_index - b.day_index),
  );

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const targetId = this.item()?.id ?? null;
      untracked(() => {
        if (isOpen && targetId) {
          this.selectedOptionId.set(null);
        }
      });
    });
  }

  protected sortedOptions(day: TripDay): DayOption[] {
    return [...day.options].sort((a, b) => a.sort_order - b.sort_order);
  }

  protected formatDate(isoDate: string): string {
    return formatDateWithWeekday(isoDate, this.i18n.locale());
  }

  protected confirm(): void {
    const targetItem = this.item();
    const targetOptionId = this.selectedOptionId();
    if (!targetItem || !targetOptionId || this.moving()) {
      return;
    }
    this.confirmed.emit({ itemId: targetItem.id, targetOptionId });
  }
}
