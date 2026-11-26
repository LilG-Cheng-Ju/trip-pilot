import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';

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
import { NetworkStatusService } from '../../core/network/network-status.service';
import { isIncompleteNumberInput, readInputValue } from '../../core/utils/form-events.utils';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryKey,
  findTripDayIdForItem,
  formatCurrencyAmount,
  roundFxRate,
} from '../../core/utils/travel-format.utils';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { TripSubnavComponent } from '../../shared/trip-subnav.component';
import { AuthStore } from '../../state/auth.store';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';
import { ExpenseEditModalComponent } from './expense-edit-modal.component';

/** Low-friction per-trip expense ledger with instant currency conversion. */
@Component({
  selector: 'app-expenses-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    MatFormFieldModule,
    MatSelectModule,
    AppConfirmModalComponent,
    ExpenseEditModalComponent,
    TripSubnavComponent,
  ],
  templateUrl: './expenses-page.component.html',
  styleUrl: './expenses-page.component.css',
})
export class ExpensesPageComponent implements OnInit, OnDestroy {
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly itineraryStore = inject(ItineraryStore);
  private readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(I18nService);
  private readonly network = inject(NetworkStatusService);
  private readonly fxResolver = inject(FxRateResolverService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isOfflineReadOnly = computed(() => !this.network.isOnline());

  protected readonly tripId = signal('');
  protected readonly showMore = signal(false);
  protected readonly submitting = signal(false);
  protected readonly fetchingRate = signal(false);
  protected readonly fxStatus = signal<FxResolutionStatus>('same');
  protected readonly manualRateRequired = signal(false);
  protected readonly quickRateError = signal(false);
  protected readonly pendingDeleteExpense = signal<{ id: string; title: string } | null>(null);
  protected readonly deletingExpense = signal(false);
  protected readonly editingExpense = signal<ExpenseItem | null>(null);
  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly categoryKey = expenseCategoryKey;
  protected readonly formatCurrencyAmount = formatCurrencyAmount;
  protected readonly readInputValue = readInputValue;

  private quickRateSeq = 0;

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
  protected readonly selectedDayId = signal('');
  protected readonly category = signal<ExpenseCategory>('FOOD');
  protected readonly paymentMethod = signal('');
  protected readonly notes = signal('');

  protected readonly homeCurrency = computed(() =>
    (
      this.expenseStore.summary()?.home_currency ||
      this.authStore.profile()?.home_currency ||
      'TWD'
    )
      .trim()
      .toUpperCase(),
  );

  protected readonly isQuickForeign = computed(
    () => (this.currency().trim() || 'JPY').toUpperCase() !== this.homeCurrency(),
  );

  protected readonly tripDays = computed<TripDay[]>(() => {
    const days = this.itineraryStore.trip()?.days ?? [];
    return [...days].sort((a, b) => a.day_index - b.day_index);
  });

  protected readonly dayIndexById = computed(() => {
    const map = new Map<string, number>();
    for (const day of this.tripDays()) {
      map.set(day.id, day.day_index);
    }
    return map;
  });

  protected readonly previewHomeAmount = computed<string | null>(() => {
    const amt = this.amount();
    const rate = this.isQuickForeign() ? this.exchangeRate() : 1;
    if (!amt || !rate) return null;
    return formatCurrencyAmount(amt * rate, this.homeCurrency());
  });

  protected readonly currencyOptions = computed<QuickCurrencyOption[]>(() =>
    buildQuickCurrencyOptions([
      this.itineraryStore.trip()?.default_currency,
      this.homeCurrency(),
      this.currency(),
    ]),
  );

  protected readonly originalCurrencyTotals = computed(() => {
    const summary = this.expenseStore.summary();
    if (!summary || summary.items.length === 0) {
      return [];
    }
    const totals = new Map<string, number>();
    for (const exp of summary.items) {
      const cur = exp.currency_original.toUpperCase();
      totals.set(cur, (totals.get(cur) ?? 0) + (Number(exp.amount_original) || 0));
    }
    // Only show breakdown when spending occurs in a foreign currency or multiple currencies.
    if (totals.size === 1 && totals.has(summary.home_currency.toUpperCase())) {
      return [];
    }
    return Array.from(totals.entries())
      .map(([currency, total]) => ({
        currency,
        total,
        totalFormatted: formatCurrencyAmount(total, currency),
      }))
      .sort((a, b) => b.total - a.total);
  });

  protected readonly filteredItemTitle = computed(() => {
    const itemId = this.expenseStore.selectedItemId();
    if (!itemId) {
      return null;
    }
    const trip = this.itineraryStore.trip();
    if (trip) {
      for (const day of trip.days) {
        for (const opt of day.options) {
          const found = opt.items.find((it) => it.id === itemId);
          if (found) {
            return found.title;
          }
        }
      }
    }
    return itemId;
  });

  protected readonly categoryEntries = computed(() => {
    const summary = this.expenseStore.summary();
    if (!summary) return [];
    const total = Math.max(0.01, Number(summary.total_home_amount));
    return Object.entries(summary.by_category)
      .map(([cat, amt]) => ({
        category: cat as ExpenseCategory,
        amount: amt,
        percent: Math.min(100, Math.round((Number(amt) / total) * 100)),
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('tripId') ?? '';
    const itemId = this.route.snapshot.queryParamMap.get('itemId');
    this.tripId.set(id);
    this.expenseStore.setItemFilter(itemId);
    if (!id) return;

    await Promise.all([
      this.expenseStore.loadExpenses(id),
      this.itineraryStore.trip()?.id === id
        ? Promise.resolve()
        : this.itineraryStore.loadTrip(id),
    ]);

    if (itemId) {
      const matchedDayId = findTripDayIdForItem(this.tripDays(), itemId);
      if (matchedDayId) {
        this.selectedDayId.set(matchedDayId);
      }
    }

    const tripCurrency = this.itineraryStore.trip()?.default_currency;
    if (tripCurrency) {
      this.currency.set(tripCurrency);
    }
    await this.resolveQuickRate(this.currency());
  }

  ngOnDestroy(): void {
    this.expenseStore.setItemFilter(null);
  }

  protected async executeDeleteExpense(): Promise<void> {
    const target = this.pendingDeleteExpense();
    if (!target) {
      return;
    }
    this.deletingExpense.set(true);
    try {
      await this.expenseStore.deleteExpense(this.tripId(), target.id);
      this.pendingDeleteExpense.set(null);
    } finally {
      this.deletingExpense.set(false);
    }
  }

  protected clearItemFilter(): void {
    this.expenseStore.setItemFilter(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { itemId: null },
      queryParamsHandling: 'merge',
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
    this.quickRateError.set(false);
    this.exchangeRateText.set(readInputValue(event));
  }

  protected onCurrencyChange(code: string): void {
    this.currency.set(code);
    const upper = code.trim().toUpperCase();
    if (upper.length === ISO_CURRENCY_CODE_LENGTH) {
      void this.resolveQuickRate(upper);
    }
  }

  protected async resolveQuickRate(overrideCode?: string): Promise<void> {
    const src = (overrideCode || this.currency() || 'JPY').trim().toUpperCase();
    const dst = this.homeCurrency();
    const seq = ++this.quickRateSeq;
    if (src.length !== ISO_CURRENCY_CODE_LENGTH || dst.length !== ISO_CURRENCY_CODE_LENGTH) {
      return;
    }
    if (src === dst) {
      this.fxStatus.set('same');
      this.manualRateRequired.set(false);
      this.quickRateError.set(false);
      this.exchangeRateText.set('1');
      this.fetchingRate.set(false);
      return;
    }
    this.fetchingRate.set(true);
    this.quickRateError.set(false);
    try {
      const res = await this.fxResolver.resolve(src, dst);
      if (seq !== this.quickRateSeq) {
        return;
      }
      this.fxStatus.set(res.status);
      this.manualRateRequired.set(res.manualRequired);
      this.exchangeRateText.set(res.rate !== null ? String(roundFxRate(res.rate)) : '');
    } finally {
      if (seq === this.quickRateSeq) {
        this.fetchingRate.set(false);
      }
    }
  }

  protected toggleCategoryFilter(cat: ExpenseCategory): void {
    this.expenseStore.setCategoryFilter(
      this.expenseStore.selectedCategory() === cat ? 'ALL' : cat,
    );
  }

  protected async submitExpense(): Promise<void> {
    const title = this.title().trim();
    const amount = this.amount();
    const upperCurrency = (this.currency().trim() || 'JPY').toUpperCase();
    const home = this.homeCurrency();
    const rate = upperCurrency === home ? 1 : this.exchangeRate();
    if (!title || !amount || amount <= 0) {
      return;
    }
    if (rate === null || rate <= 0) {
      this.quickRateError.set(true);
      return;
    }

    const chosenDayId = this.selectedDayId() || null;
    const filteredItemId = this.expenseStore.selectedItemId();
    // Avoid backend 400 when user assigns an expense to a day that differs from the filtered item.
    const itemDayId = filteredItemId ? findTripDayIdForItem(this.tripDays(), filteredItemId) : null;
    const linkedItemId =
      filteredItemId && (!chosenDayId || !itemDayId || chosenDayId === itemDayId)
        ? filteredItemId
        : null;

    this.submitting.set(true);
    try {
      await this.expenseStore.addExpense(this.tripId(), {
        trip_day_id: chosenDayId,
        itinerary_item_id: linkedItemId,
        title,
        category: this.category(),
        amount_original: amount,
        currency_original: upperCurrency,
        exchange_rate: rate,
        payment_method: this.paymentMethod().trim() || null,
        notes: this.notes().trim() || null,
      });
      if (!this.expenseStore.error()) {
        if (upperCurrency !== home) {
          this.fxResolver.cacheRate(upperCurrency, home, rate);
        }
        this.title.set('');
        this.amountText.set('');
        this.notes.set('');
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
