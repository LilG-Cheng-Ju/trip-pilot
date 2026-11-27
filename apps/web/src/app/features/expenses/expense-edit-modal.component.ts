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
  buildQuickCurrencyOptions,
  QuickCurrencyOption,
} from '../../core/constants/travel-options';
import {
  FxRateResolverService,
  FxResolutionStatus,
} from '../../core/fx/fx-rate-resolver.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory, ExpenseItem, TripDay } from '../../core/models/tripilot.models';
import { isIncompleteNumberInput, readInputValue } from '../../core/utils/form-events.utils';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryKey,
  findTripDayIdForItem,
  formatCurrencyAmount,
  roundFxRate,
} from '../../core/utils/travel-format.utils';
import { AppDateInputComponent } from '../../shared/date-input.component';
import { AppModalComponent } from '../../shared/modal.component';
import { AppSelectComponent, SelectOption } from '../../shared/select-input.component';
import { ExpenseStore } from '../../state/expense.store';

/** Modal dialog for editing an existing expense, including live FX conversion and day link. */
@Component({
  selector: 'app-expense-edit-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    AppDateInputComponent,
    AppModalComponent,
    AppSelectComponent,
  ],
  templateUrl: './expense-edit-modal.component.html',
  styleUrl: './expense-edit-modal.component.css',
})
export class ExpenseEditModalComponent {
  readonly expense = input<ExpenseItem | null>(null);
  readonly tripId = input.required<string>();
  readonly homeCurrency = input.required<string>();
  readonly defaultCurrency = input<string | undefined>(undefined);
  readonly tripDays = input<readonly TripDay[]>([]);

  readonly closed = output<void>();

  private readonly expenseStore = inject(ExpenseStore);
  private readonly fxResolver = inject(FxRateResolverService);
  protected readonly i18n = inject(I18nService);

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly categoryKey = expenseCategoryKey;
  protected readonly readInputValue = readInputValue;

  private rateSeq = 0;

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
  protected readonly fetchingRate = signal(false);
  protected readonly fxStatus = signal<FxResolutionStatus>('same');
  protected readonly manualRateRequired = signal(false);
  protected readonly rateError = signal(false);
  protected readonly category = signal<ExpenseCategory>('FOOD');
  protected readonly dayId = signal('');
  protected readonly paidAt = signal('');
  protected readonly paymentMethod = signal('');
  protected readonly notes = signal('');
  protected readonly submitting = signal(false);

  protected readonly isForeign = computed(
    () => (this.currency().trim() || 'JPY').toUpperCase() !== this.homeCurrency(),
  );

  protected readonly previewHomeAmount = computed<string | null>(() => {
    const amt = this.amount();
    const rate = this.isForeign() ? this.exchangeRate() : 1;
    if (!amt || !rate) return null;
    return formatCurrencyAmount(amt * rate, this.homeCurrency());
  });

  protected readonly currencyOptions = computed<QuickCurrencyOption[]>(() =>
    buildQuickCurrencyOptions([this.defaultCurrency(), this.homeCurrency(), this.currency()]),
  );

  protected readonly currencySelectOptions = computed<readonly SelectOption[]>(() => {
    const isZh = this.i18n.locale() === 'zh-TW';
    return this.currencyOptions().map((opt) => ({
      value: opt.code,
      label: isZh ? opt.labelZh : opt.labelEn,
    }));
  });

  protected readonly daySelectOptions = computed<readonly SelectOption[]>(() => [
    { value: '', label: this.i18n.t('expenses.unassignedDay') },
    ...this.tripDays().map((day) => ({
      value: day.id,
      label: this.i18n.t('expenses.dayOption', {
        day: day.day_index,
        date: day.date.slice(5),
      }),
    })),
  ]);

  constructor() {
    effect(() => {
      const exp = this.expense();
      if (!exp) {
        return;
      }
      untracked(() => {
        const upperCurrency = exp.currency_original.trim().toUpperCase();
        const numericRate = Number(exp.exchange_rate);
        this.title.set(exp.title);
        this.amountText.set(String(Number(exp.amount_original) || exp.amount_original));
        this.currency.set(upperCurrency);
        this.exchangeRateText.set(
          Number.isFinite(numericRate) && numericRate > 0 ? String(roundFxRate(numericRate)) : '',
        );
        this.fxStatus.set(upperCurrency === this.homeCurrency() ? 'same' : 'cached');
        this.manualRateRequired.set(false);
        this.rateError.set(false);
        this.category.set(exp.category);
        this.dayId.set(exp.trip_day_id ?? '');
        this.paidAt.set(exp.paid_at.slice(0, 10));
        this.paymentMethod.set(exp.payment_method ?? '');
        this.notes.set(exp.notes ?? '');
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
    const dst = this.homeCurrency();
    const seq = ++this.rateSeq;
    if (src.length !== ISO_CURRENCY_CODE_LENGTH || dst.length !== ISO_CURRENCY_CODE_LENGTH) {
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
    const target = this.expense();
    if (!target) {
      return;
    }
    const title = this.title().trim();
    const amount = this.amount();
    const upperCurrency = (this.currency().trim() || 'JPY').toUpperCase();
    const home = this.homeCurrency();
    const rate = upperCurrency === home ? 1 : this.exchangeRate();
    if (!title || !amount || amount <= 0) {
      return;
    }
    if (rate === null || rate <= 0) {
      this.rateError.set(true);
      return;
    }

    const nextDayId = this.dayId() || null;
    const itemDayId = target.itinerary_item_id
      ? findTripDayIdForItem(this.tripDays(), target.itinerary_item_id)
      : null;
    const keepItemLink =
      target.itinerary_item_id && (!nextDayId || !itemDayId || nextDayId === itemDayId);
    const nextDate = this.paidAt().trim();
    const paidAtChanged = nextDate && nextDate !== target.paid_at.slice(0, 10);

    this.submitting.set(true);
    try {
      await this.expenseStore.updateExpense(this.tripId(), target.id, {
        title,
        amount_original: amount,
        currency_original: upperCurrency,
        exchange_rate: rate,
        category: this.category(),
        trip_day_id: nextDayId,
        ...(target.itinerary_item_id && !keepItemLink ? { itinerary_item_id: null } : {}),
        ...(paidAtChanged ? { paid_at: `${nextDate}T00:00:00Z` } : {}),
        payment_method: this.paymentMethod().trim() || null,
        notes: this.notes().trim() || null,
      });
      if (upperCurrency !== home) {
        this.fxResolver.cacheRate(upperCurrency, home, rate);
      }
      this.closed.emit();
    } catch {
      // Error state is recorded on ExpenseStore and shown in the error banner.
    } finally {
      this.submitting.set(false);
    }
  }
}
