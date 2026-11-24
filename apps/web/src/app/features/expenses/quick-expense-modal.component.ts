import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { OfflineCacheService } from '../../core/cache/offline-cache.service';
import { ISO_CURRENCY_CODE_LENGTH } from '../../core/constants/app-limits';
import {
  COMMON_CURRENCIES,
  QuickCurrencyOption,
} from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory, ItineraryItem } from '../../core/models/tripilot.models';
import {
  estimateOfflineFxRate,
  EXPENSE_CATEGORIES,
  expenseCategoryKey,
  mapItemTypeToExpenseCategory,
  roundFxRate,
} from '../../core/utils/travel-format.utils';
import { AppModalComponent } from '../../shared/modal.component';
import { ExpenseStore } from '../../state/expense.store';

/** Low-friction modal for logging an expense directly from an itinerary card. */
@Component({
  selector: 'app-quick-expense-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppModalComponent, FormsModule, TranslatePipe],
  template: `
    <app-modal
      [open]="open()"
      [title]="'expenses.quickModalTitle' | t"
      (closed)="closed.emit()"
    >
      @if (item(); as stop) {
        <div class="linked-banner">
          <span class="ms-icon sm" aria-hidden="true">pin_drop</span>
          <span class="linked-label">{{ 'expenses.linkedItem' | t }}:</span>
          <strong class="linked-title">{{ stop.title }}</strong>
        </div>
      }

      <form class="form" (ngSubmit)="submit()">
        <label class="field">
          <span class="field-label">
            {{ 'expenses.field.title' | t }} <em class="req">*</em>
          </span>
          <input
            type="text"
            class="input-control"
            [(ngModel)]="title"
            name="title"
            [placeholder]="'expenses.itemPlaceholder' | t"
            required
          />
        </label>

        <div class="amount-grid">
          <label class="field">
            <span class="field-label">
              {{ 'expenses.field.amount' | t }} <em class="req">*</em>
            </span>
            <input
              type="number"
              step="any"
              min="0.01"
              class="input-control tabular-nums"
              [(ngModel)]="amount"
              name="amount"
              placeholder="0"
              required
            />
          </label>

          <label class="field">
            <span class="field-label">
              {{ 'expenses.field.currency' | t }} <em class="req">*</em>
            </span>
            <select
              class="input-control"
              [(ngModel)]="currency"
              name="currency"
              (ngModelChange)="onCurrencyChange($event)"
            >
              @for (opt of currencyOptions(); track opt.code) {
                <option [value]="opt.code">
                  {{ i18n.locale() === 'zh-TW' ? opt.labelZh : opt.labelEn }}
                </option>
              }
            </select>
          </label>
        </div>

        @if (currency !== homeCurrency() && rateNeedsConfirm()) {
          <label class="field">
            <span class="field-label">{{ 'expenses.rateLabel' | t }}</span>
            <input
              type="number"
              step="any"
              min="0.000001"
              class="input-control tabular-nums"
              [(ngModel)]="exchangeRate"
              name="exchangeRate"
            />
            <small class="rate-warn">{{ 'fx.manualConfirmHint' | t }}</small>
          </label>
        }

        @if (previewHomeAmount() !== null && currency !== homeCurrency()) {
          <div class="preview-line tabular-nums">
            <span>≈ {{ homeCurrency() }} {{ previewHomeAmount() }}</span>
          </div>
        }

        <div class="field">
          <span class="field-label">{{ 'expenses.field.category' | t }}</span>
          <div class="cat-chips">
            @for (cat of categories; track cat) {
              <button
                type="button"
                class="cat-chip"
                [class.active]="category === cat"
                (click)="category = cat"
              >
                {{ categoryKey(cat) | t }}
              </button>
            }
          </div>
        </div>

        <div class="extra-row">
          <label class="field">
            <span class="field-label">{{ 'expenses.field.paymentMethod' | t }}</span>
            <input
              type="text"
              class="input-control"
              [(ngModel)]="paymentMethod"
              name="paymentMethod"
              [placeholder]="'expenses.field.paymentPlaceholder' | t"
            />
          </label>

          <label class="field">
            <span class="field-label">{{ 'expenses.field.notes' | t }}</span>
            <input
              type="text"
              class="input-control"
              [(ngModel)]="notes"
              name="notes"
              [placeholder]="'expenses.field.notesPlaceholder' | t"
            />
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-ghost" (click)="closed.emit()">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="btn-primary" [disabled]="submitting() || fetchingRate()">
            + {{ 'common.add' | t }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .linked-banner {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      margin-bottom: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-accent-soft);
      color: var(--color-primary);
      font-size: 0.8125rem;
    }
    .linked-label {
      color: var(--color-text-secondary);
      white-space: nowrap;
    }
    .linked-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-label {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .req {
      color: var(--color-alert);
      font-style: normal;
      font-weight: 600;
    }
    .input-control {
      width: 100%;
      padding: 9px 11px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.875rem;
    }
    .amount-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 124px;
      gap: 10px;
    }
    .preview-line {
      margin-top: -6px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .rate-warn {
      font-size: 0.74rem;
      font-weight: 500;
      color: var(--color-accent-ink);
    }
    .cat-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .cat-chip {
      padding: 5px 11px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .cat-chip.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .extra-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    @media (min-width: 480px) {
      .extra-row {
        grid-template-columns: 1fr 1fr;
      }
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
    .btn-ghost {
      padding: 9px 16px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary {
      padding: 9px 20px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  `,
})
export class QuickExpenseModalComponent {
  readonly open = input<boolean>(false);
  readonly tripId = input.required<string>();
  readonly tripDayId = input<string | null>(null);
  readonly item = input<ItineraryItem | null>(null);
  readonly defaultCurrency = input<string>('JPY');
  readonly homeCurrency = input<string>('TWD');

  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly api = inject(TripilotApiService);
  private readonly cache = inject(OfflineCacheService);
  private readonly expenseStore = inject(ExpenseStore);
  protected readonly i18n = inject(I18nService);

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly categoryKey = expenseCategoryKey;
  protected readonly submitting = signal(false);
  protected readonly fetchingRate = signal(false);
  protected readonly rateNeedsConfirm = signal(false);

  protected readonly currencyOptions = computed<QuickCurrencyOption[]>(() => {
    const list: QuickCurrencyOption[] = [...COMMON_CURRENCIES];
    for (const code of [this.defaultCurrency(), this.homeCurrency()]) {
      const upper = code?.trim().toUpperCase();
      if (
        upper &&
        upper.length === ISO_CURRENCY_CODE_LENGTH &&
        !list.some((c) => c.code === upper)
      ) {
        list.unshift({ code: upper, labelEn: upper, labelZh: upper });
      }
    }
    return list;
  });

  protected title = '';
  protected amount: number | null = null;
  protected currency = 'JPY';
  protected exchangeRate = 1;
  protected category: ExpenseCategory = 'FOOD';
  protected paymentMethod = '';
  protected notes = '';

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      const stop = this.item();
      this.title = stop ? stop.title : '';
      this.amount = null;
      this.currency = (this.defaultCurrency() || 'JPY').toUpperCase();
      this.category = stop ? mapItemTypeToExpenseCategory(stop.type) : 'FOOD';
      this.paymentMethod = '';
      this.notes = '';
      void this.fetchLiveRate();
    });
  }

  protected previewHomeAmount(): string | null {
    if (!this.amount || !this.exchangeRate) {
      return null;
    }
    return Math.round(this.amount * this.exchangeRate).toLocaleString();
  }

  protected onCurrencyChange(code: string): void {
    const upper = code.trim().toUpperCase();
    if (upper.length === ISO_CURRENCY_CODE_LENGTH) {
      void this.fetchLiveRate(upper);
    }
  }

  private async fetchLiveRate(overrideCode?: string): Promise<void> {
    const src = (overrideCode || this.currency || 'JPY').trim().toUpperCase();
    const dst = (this.homeCurrency() || 'TWD').trim().toUpperCase();
    if (
      src.length !== ISO_CURRENCY_CODE_LENGTH ||
      dst.length !== ISO_CURRENCY_CODE_LENGTH
    ) {
      return;
    }
    if (src === dst) {
      this.exchangeRate = 1;
      this.rateNeedsConfirm.set(false);
      return;
    }
    this.fetchingRate.set(true);
    try {
      const res = await this.api.getExchangeRate(src, dst);
      const rounded = roundFxRate(res.rate);
      this.exchangeRate = rounded;
      this.rateNeedsConfirm.set(false);
      this.cache.setFxRate(src, rounded);
    } catch {
      const cached = this.cache.getFxRate(src);
      if (cached !== null) {
        this.exchangeRate = roundFxRate(cached);
        this.rateNeedsConfirm.set(false);
      } else {
        this.exchangeRate = estimateOfflineFxRate(src, dst) ?? 1;
        this.rateNeedsConfirm.set(true);
      }
    } finally {
      this.fetchingRate.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (!this.title.trim() || !this.amount || this.amount <= 0) {
      return;
    }
    const upperCurrency = (this.currency.trim() || 'JPY').toUpperCase();
    this.submitting.set(true);
    try {
      await this.expenseStore.addExpense(this.tripId(), {
        trip_day_id: this.tripDayId(),
        itinerary_item_id: this.item()?.id ?? null,
        title: this.title.trim(),
        category: this.category,
        amount_original: this.amount,
        currency_original: upperCurrency,
        exchange_rate: this.exchangeRate || 1,
        payment_method: this.paymentMethod.trim() || null,
        notes: this.notes.trim() || null,
      });
      this.saved.emit();
      this.closed.emit();
    } finally {
      this.submitting.set(false);
    }
  }
}
