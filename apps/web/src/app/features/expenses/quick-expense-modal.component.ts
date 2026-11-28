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

import { ISO_CURRENCY_CODE_LENGTH } from '../../core/constants/app-limits';
import {
  COMMON_CURRENCIES,
  QuickCurrencyOption,
} from '../../core/constants/travel-options';
import {
  FxRateResolverService,
  FxResolutionStatus,
} from '../../core/fx/fx-rate-resolver.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory, ItineraryItem } from '../../core/models/tripilot.models';
import { isIncompleteNumberInput, readInputValue } from '../../core/utils/form-events.utils';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryKey,
  mapItemTypeToExpenseCategory,
  roundFxRate,
} from '../../core/utils/travel-format.utils';
import { AppModalComponent } from '../../shared/modal.component';
import { AppSelectComponent, SelectOption } from '../../shared/select-input.component';
import { ExpenseStore } from '../../state/expense.store';

/** Low-friction modal for logging an expense directly from an itinerary card. */
@Component({
  selector: 'app-quick-expense-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppModalComponent, AppSelectComponent, TranslatePipe],
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

      <form class="form" (submit)="$event.preventDefault(); submit()">
        <label class="field">
          <span class="field-label">
            {{ 'expenses.field.title' | t }} <em class="req">*</em>
          </span>
          <input
            type="text"
            class="input-control"
            [value]="title()"
            (input)="title.set(readInputValue($event))"
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
              [value]="amountText()"
              (input)="onAmountInput($event)"
              name="amount"
              placeholder="0"
              required
            />
          </label>

          <div class="field">
            <span class="field-label">
              {{ 'expenses.field.currency' | t }} <em class="req">*</em>
            </span>
            <app-select
              name="currency"
              [ariaLabel]="'expenses.field.currency' | t"
              [panelWidth]="null"
              [options]="currencySelectOptions()"
              [value]="currency()"
              (valueChange)="onCurrencyChange($event)"
            />
          </div>
        </div>

        @if (isForeignCurrency()) {
          @if (manualRateRequired()) {
            <div class="fx-warning-banner" role="alert">
              <span class="ms-icon sm" aria-hidden="true">warning</span>
              <span>{{ 'fx.unavailableHint' | t }}</span>
            </div>
          }

          <label class="field" [class.has-error]="rateError()">
            <span class="field-label">
              {{ 'expenses.rateLabel' | t }} (1 {{ currency() }} → {{ homeCurrency() }})
              @if (manualRateRequired()) {
                <em class="req">*</em>
              }
            </span>
            <div class="rate-box">
              <input
                type="number"
                step="any"
                min="0.000001"
                class="tabular-nums"
                [value]="exchangeRateText()"
                (input)="onRateInput($event)"
                name="exchangeRate"
                placeholder="0"
              />
              <button
                type="button"
                class="fx-btn"
                [disabled]="fetchingRate()"
                [title]="'fx.refresh' | t"
                (click)="resolveRate()"
              >
                <span class="ms-icon sm" [class.spin]="fetchingRate()" aria-hidden="true">
                  sync
                </span>
              </button>
            </div>
            @if (fetchingRate()) {
              <small class="fx-hint">{{ 'fx.loading' | t }}</small>
            } @else if (fxStatus() === 'cached') {
              <small class="fx-hint cached">{{ 'fx.cachedHint' | t }}</small>
            } @else if (fxStatus() === 'live') {
              <small class="fx-hint">{{ 'fx.liveHint' | t }}</small>
            }
            @if (rateError()) {
              <small class="err-msg">{{ 'fx.errRateRequired' | t }}</small>
            }
          </label>
        }

        @if (previewHomeAmount() !== null && isForeignCurrency()) {
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
                [class.active]="category() === cat"
                (click)="category.set(cat)"
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
              [value]="paymentMethod()"
              (input)="paymentMethod.set(readInputValue($event))"
              name="paymentMethod"
              [placeholder]="'expenses.field.paymentPlaceholder' | t"
            />
          </label>

          <label class="field">
            <span class="field-label">{{ 'expenses.field.notes' | t }}</span>
            <input
              type="text"
              class="input-control"
              [value]="notes()"
              (input)="notes.set(readInputValue($event))"
              name="notes"
              [placeholder]="'expenses.field.notesPlaceholder' | t"
            />
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-ghost" (click)="closed.emit()">
            {{ 'common.cancel' | t }}
          </button>
          <button
            type="submit"
            class="btn-primary"
            [disabled]="submitting() || fetchingRate() || (isForeignCurrency() && exchangeRate() === null)"
          >
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
      height: 40px;
      padding: 9px 11px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background-color: var(--color-surface);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.875rem;
    }
    .amount-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 138px;
      gap: 10px;
    }
    .preview-line {
      margin-top: -4px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .fx-warning-banner {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-alert-soft);
      border: 1px solid rgba(200, 75, 59, 0.35);
      color: var(--color-alert);
      font-size: 0.78rem;
      font-weight: 600;
    }
    .rate-box {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 39px;
      padding: 0 6px 0 11px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background-color: var(--color-surface);
    }
    .rate-box input {
      width: 100%;
      min-width: 0;
      border: none;
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.875rem;
      outline: none;
      -moz-appearance: textfield;
      appearance: textfield;
    }
    .rate-box input::-webkit-outer-spin-button,
    .rate-box input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .field.has-error .rate-box {
      border-color: var(--color-alert);
    }
    .fx-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-primary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .fx-hint {
      font-size: 0.74rem;
      color: var(--color-text-muted);
    }
    .fx-hint.cached {
      color: var(--color-accent-ink);
      font-weight: 500;
    }
    .cat-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .cat-chip {
      padding: 5px 11px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
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

  private readonly fxResolver = inject(FxRateResolverService);
  private readonly expenseStore = inject(ExpenseStore);
  protected readonly i18n = inject(I18nService);

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly categoryKey = expenseCategoryKey;
  protected readonly readInputValue = readInputValue;
  protected readonly submitting = signal(false);
  protected readonly fetchingRate = signal(false);
  protected readonly fxStatus = signal<FxResolutionStatus>('same');
  protected readonly manualRateRequired = signal(false);
  protected readonly rateError = signal(false);
  private rateSeq = 0;

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

  protected readonly currencySelectOptions = computed<readonly SelectOption[]>(() => {
    const isZh = this.i18n.locale() === 'zh-TW';
    return this.currencyOptions().map((opt) => ({
      value: opt.code,
      label: isZh ? opt.labelZh : opt.labelEn,
    }));
  });

  protected readonly title = signal('');
  protected readonly amountText = signal('');
  protected readonly amount = computed<number | null>(() => {
    const raw = this.amountText().trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });
  protected readonly currency = signal('JPY');
  protected readonly exchangeRateText = signal('1');
  protected readonly exchangeRate = computed<number | null>(() => {
    const raw = this.exchangeRateText().trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  protected readonly isForeignCurrency = computed(() => {
    const src = (this.currency().trim() || 'JPY').toUpperCase();
    const dst = (this.homeCurrency().trim() || 'TWD').toUpperCase();
    return src !== dst;
  });
  protected readonly category = signal<ExpenseCategory>('FOOD');
  protected readonly paymentMethod = signal('');
  protected readonly notes = signal('');

  protected readonly previewHomeAmount = computed<string | null>(() => {
    const amt = this.amount();
    const rate = this.exchangeRate();
    if (!amt || !rate) {
      return null;
    }
    return Math.round(amt * rate).toLocaleString();
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      const stop = this.item();
      untracked(() => {
        this.title.set(stop ? stop.title : '');
        this.amountText.set('');
        this.currency.set((this.defaultCurrency() || 'JPY').toUpperCase());
        this.category.set(stop ? mapItemTypeToExpenseCategory(stop.type) : 'FOOD');
        this.paymentMethod.set('');
        this.notes.set('');
        this.rateError.set(false);
        void this.resolveRate();
      });
    });
  }

  protected onAmountInput(event: Event): void {
    if (isIncompleteNumberInput(event)) {
      return;
    }
    this.amountText.set(readInputValue(event));
  }

  protected onRateInput(event: Event): void {
    if (isIncompleteNumberInput(event)) {
      return;
    }
    this.rateError.set(false);
    this.exchangeRateText.set(readInputValue(event));
  }

  protected onCurrencyChange(code: string): void {
    this.currency.set(code);
    const upper = code.trim().toUpperCase();
    if (upper.length === ISO_CURRENCY_CODE_LENGTH) {
      void this.resolveRate(upper);
    }
  }

  protected async resolveRate(overrideCode?: string): Promise<void> {
    const src = (overrideCode || this.currency() || 'JPY').trim().toUpperCase();
    const dst = (this.homeCurrency() || 'TWD').trim().toUpperCase();
    const seq = ++this.rateSeq;
    if (
      src.length !== ISO_CURRENCY_CODE_LENGTH ||
      dst.length !== ISO_CURRENCY_CODE_LENGTH
    ) {
      return;
    }
    if (src === dst) {
      this.fxStatus.set('same');
      this.manualRateRequired.set(false);
      this.rateError.set(false);
      this.exchangeRateText.set('1');
      this.fetchingRate.set(false);
      return;
    }
    this.fetchingRate.set(true);
    this.rateError.set(false);
    try {
      const res = await this.fxResolver.resolve(src, dst);
      if (seq !== this.rateSeq) {
        return;
      }
      this.fxStatus.set(res.status);
      this.manualRateRequired.set(res.manualRequired);
      this.exchangeRateText.set(res.rate !== null ? String(roundFxRate(res.rate)) : '');
    } finally {
      if (seq === this.rateSeq) {
        this.fetchingRate.set(false);
      }
    }
  }

  protected async submit(): Promise<void> {
    const title = this.title().trim();
    const amount = this.amount();
    const upperCurrency = (this.currency().trim() || 'JPY').toUpperCase();
    const home = (this.homeCurrency().trim() || 'TWD').toUpperCase();
    const rate = upperCurrency === home ? 1 : this.exchangeRate();
    if (!title || !amount || amount <= 0) {
      return;
    }
    if (rate === null || rate <= 0) {
      this.rateError.set(true);
      return;
    }
    this.submitting.set(true);
    try {
      await this.expenseStore.addExpense(this.tripId(), {
        trip_day_id: this.tripDayId(),
        itinerary_item_id: this.item()?.id ?? null,
        title,
        category: this.category(),
        amount_original: amount,
        currency_original: upperCurrency,
        exchange_rate: rate,
        payment_method: this.paymentMethod().trim() || null,
        notes: this.notes().trim() || null,
      });
      if (upperCurrency !== home) {
        this.fxResolver.cacheRate(upperCurrency, home, rate);
      }
      this.saved.emit();
      this.closed.emit();
    } finally {
      this.submitting.set(false);
    }
  }
}
