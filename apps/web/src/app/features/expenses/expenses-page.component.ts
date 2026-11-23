import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { COMMON_CURRENCIES, CurrencyOption } from '../../core/config/currencies';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory } from '../../core/models/tripilot.models';
import { EXPENSE_CATEGORIES, expenseCategoryKey } from '../../core/utils/travel-format.utils';
import { TripSubnavComponent } from '../../shared/trip-subnav.component';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';

const RATE_STORAGE_PREFIX = 'tripilot.fxRate.';

/** Low-friction per-trip expense ledger with instant currency conversion. */
@Component({
  selector: 'app-expenses-page',
  imports: [FormsModule, TranslatePipe, TripSubnavComponent],
  template: `
    <div class="page">
      @if (itineraryStore.trip(); as trip) {
        <app-trip-subnav
          [tripId]="trip.id"
          [title]="trip.title"
          [dateRange]="trip.start_date + ' — ' + trip.end_date"
        />
      } @else {
        <app-trip-subnav [tripId]="tripId()" [title]="'expenses.title' | t" />
      }

      <div class="expenses-grid">
        <div class="summary-col">
          @if (expenseStore.summary(); as summary) {
            <section class="hero-card">
              <span class="hero-label">{{ 'expenses.total' | t }}</span>
              <div class="hero-amount tabular-nums">
                <span class="currency">{{ summary.home_currency }}</span>
                <span>{{ summary.total_home_amount }}</span>
              </div>
              <span class="hero-count tabular-nums">
                {{ 'expenses.count' | t: { count: summary.items.length } }}
              </span>
              @if (originalCurrencyTotals().length > 0) {
                <div class="currency-breakdown tabular-nums">
                  @for (entry of originalCurrencyTotals(); track entry.currency) {
                    <span class="currency-pill">
                      {{ entry.currency }} {{ entry.totalFormatted }}
                    </span>
                  }
                </div>
              }
            </section>
          }

          <!-- Ultra-Low-Friction Quick Add Form -->
          <form class="quick-card" (ngSubmit)="submitExpense()">
            <h3 class="section-title">{{ 'expenses.quickAdd' | t }}</h3>

            <label class="field">
              <span class="field-label">
                {{ 'expenses.field.title' | t }} <em class="req">*</em>
              </span>
              <input
                type="text"
                class="input-main"
                [(ngModel)]="title"
                name="title"
                [placeholder]="'expenses.itemPlaceholder' | t"
                required
              />
            </label>

            <div class="amount-row">
              <label class="field">
                <span class="field-label">
                  {{ 'expenses.field.amount' | t }} <em class="req">*</em>
                </span>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  class="input-amount tabular-nums"
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
                  class="input-currency"
                  [(ngModel)]="currency"
                  name="currency"
                  (ngModelChange)="onCurrencyChange($event)"
                >
                  @for (opt of currencyOptions(); track opt.code) {
                    <option [value]="opt.code">{{ opt.code }}</option>
                  }
                </select>
              </label>

              <div class="field">
                <span class="field-label">{{ 'expenses.rateLabel' | t }}</span>
                <div class="rate-box">
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    class="tabular-nums"
                    [(ngModel)]="exchangeRate"
                    name="exchangeRate"
                  />
                  <button
                    type="button"
                    class="fx-btn"
                    [disabled]="fetchingRate()"
                    [title]="'fx.refresh' | t"
                    (click)="fetchLiveRate()"
                  >
                    <span class="ms-icon sm" [class.spin]="fetchingRate()" aria-hidden="true">
                      sync
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div class="preview-row tabular-nums">
              @if (previewHomeAmount() !== null) {
                <span class="preview-line">
                  ≈ {{ expenseStore.summary()?.home_currency || 'TWD' }} {{ previewHomeAmount() }}
                </span>
              }
              @if (fetchingRate()) {
                <span class="fx-hint">{{ 'fx.loading' | t }}</span>
              } @else if (rateSource()) {
                <span class="fx-hint">
                  {{ (rateSource() === 'fallback' ? 'fx.fallbackHint' : 'fx.liveHint') | t }}
                </span>
              }
            </div>

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

            <button type="button" class="more-toggle" (click)="showMore.set(!showMore())">
              {{ showMore() ? '− ' : '+ ' }}{{ 'expenses.moreOptions' | t }}
            </button>

            @if (showMore()) {
              <div class="extra-fields">
                <label class="field">
                  <span class="field-label">{{ 'expenses.field.paymentMethod' | t }}</span>
                  <input
                    type="text"
                    class="input-main"
                    [(ngModel)]="paymentMethod"
                    name="paymentMethod"
                    [placeholder]="'expenses.field.paymentPlaceholder' | t"
                  />
                </label>
                <label class="field">
                  <span class="field-label">{{ 'expenses.field.notes' | t }}</span>
                  <input
                    type="text"
                    class="input-main"
                    [(ngModel)]="notes"
                    name="notes"
                    [placeholder]="'expenses.field.notesPlaceholder' | t"
                  />
                </label>
              </div>
            }

            <button type="submit" class="submit-btn" [disabled]="submitting()">
              + {{ 'common.add' | t }}
            </button>
          </form>

          @if (categoryEntries().length > 0) {
            <section class="breakdown-card">
              @for (entry of categoryEntries(); track entry.category) {
                <button
                  type="button"
                  class="bar-row"
                  [class.active]="expenseStore.selectedCategory() === entry.category"
                  (click)="toggleCategoryFilter(entry.category)"
                >
                  <div class="bar-head">
                    <span>{{ categoryKey(entry.category) | t }}</span>
                    <span class="tabular-nums">{{ entry.amount }}</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" [style.width.%]="entry.percent"></div>
                  </div>
                </button>
              }
            </section>
          }
        </div>

        <section class="ledger-col">
          @if (filteredItemTitle(); as itemTitle) {
            <div class="filter-banner">
              <span class="ms-icon sm" aria-hidden="true">filter_alt</span>
              <span>{{ 'expenses.filterByItem' | t: { title: itemTitle } }}</span>
              <button type="button" class="clear-filter-btn" (click)="clearItemFilter()">
                {{ 'expenses.clearFilter' | t }}
              </button>
            </div>
          }

          @if (expenseStore.loading()) {
            <p class="empty-box">{{ 'common.loading' | t }}</p>
          } @else if (expenseStore.filteredItems().length === 0) {
            <div class="empty-box">{{ 'expenses.empty' | t }}</div>
          } @else {
            <div class="ledger-list">
              @for (exp of expenseStore.filteredItems(); track exp.id) {
                <article class="exp-row">
                  <div class="exp-left">
                    <span class="exp-cat">{{ categoryKey(exp.category) | t }}</span>
                    <div>
                      <h4 class="exp-title">{{ exp.title }}</h4>
                      <p class="exp-meta tabular-nums">
                        {{ exp.paid_at.slice(0, 10) }}
                        @if (exp.payment_method) { · {{ exp.payment_method }} }
                      </p>
                    </div>
                  </div>
                  <div class="exp-right tabular-nums">
                    <div class="exp-amounts">
                      <span class="exp-home">{{ exp.currency_home }} {{ exp.amount_home }}</span>
                      @if (exp.currency_original !== exp.currency_home) {
                        <span class="exp-orig">
                          {{ exp.currency_original }} {{ exp.amount_original }}
                        </span>
                      }
                    </div>
                    <button
                      type="button"
                      class="del-btn"
                      (click)="expenseStore.deleteExpense(tripId(), exp.id)"
                    >
                      ×
                    </button>
                  </div>
                </article>
              }
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .page {
      max-width: 1120px;
      margin: 0 auto;
      padding: var(--space-5) var(--space-4) calc(var(--nav-bottom-height) + var(--space-6));
    }
    .page-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .back-btn {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 700;
    }
    .page-title {
      margin: 0;
      font-size: 1.375rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .trip-sub {
      margin: 2px 0 0;
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
    }
    .expenses-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-5);
    }
    .summary-col {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .hero-card {
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      background: var(--color-primary);
      color: #ffffff;
      box-shadow: var(--shadow-card);
    }
    .hero-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.75;
    }
    .hero-amount {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin: 6px 0;
      font-size: 2rem;
      font-weight: 800;
      color: var(--color-accent);
    }
    .hero-amount .currency {
      font-size: 1rem;
      font-weight: 600;
      color: #ffffff;
    }
    .hero-count {
      font-size: 0.8125rem;
      opacity: 0.8;
    }
    .currency-breakdown {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.14);
    }
    .currency-pill {
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.92);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--color-text-secondary);
    }
    .req {
      color: var(--color-alert);
      font-style: normal;
      font-weight: 700;
    }
    .exp-amounts {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 1px;
    }
    .quick-card,
    .breakdown-card {
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .section-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .input-main,
    .input-amount,
    .input-currency {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
    }
    .amount-row {
      display: grid;
      grid-template-columns: 1fr 78px 118px;
      gap: 8px;
      align-items: end;
    }
    .input-currency {
      text-transform: uppercase;
      font-weight: 700;
      padding: 9px 6px;
    }
    .rate-box {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 39px;
      padding: 0 4px 0 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }
    .rate-box input {
      width: 100%;
      min-width: 0;
      border: none;
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.8125rem;
      outline: none;
    }
    .fx-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-primary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .fx-btn:hover {
      background: rgba(27, 42, 74, 0.08);
    }
    .spin {
      animation: fx-spin 900ms linear infinite;
    }
    @keyframes fx-spin {
      to {
        transform: rotate(360deg);
      }
    }
    .preview-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: -4px;
      min-height: 18px;
    }
    .preview-line {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .fx-hint {
      margin-left: auto;
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }
    .filter-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      margin-bottom: 12px;
      border-radius: var(--radius-md);
      background: var(--color-accent-soft);
      border: 1px solid rgba(200, 155, 91, 0.45);
      color: var(--color-primary);
      font-size: 0.84rem;
      font-weight: 600;
    }
    .clear-filter-btn {
      margin-left: auto;
      padding: 4px 10px;
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-pill);
      background: #ffffff;
      color: var(--color-primary);
      font: inherit;
      font-size: 0.74rem;
      font-weight: 700;
      cursor: pointer;
    }
    .cat-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .cat-chip {
      padding: 6px 12px;
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
      color: #ffffff;
    }
    .more-toggle {
      align-self: flex-start;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
    }
    .extra-fields {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .submit-btn {
      padding: 11px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .bar-row {
      width: 100%;
      border: none;
      background: transparent;
      padding: 4px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      text-align: left;
      font: inherit;
    }
    .bar-row.active {
      background: var(--color-accent-soft);
    }
    .bar-head {
      display: flex;
      justify-content: space-between;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: 4px;
    }
    .bar-track {
      height: 6px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: var(--color-accent);
      border-radius: var(--radius-pill);
    }
    .ledger-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .exp-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }
    .exp-left {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .exp-cat {
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: #8b652d;
      font-size: 0.7rem;
      font-weight: 700;
    }
    .exp-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
    }
    .exp-meta {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .exp-right {
      display: flex;
      align-items: center;
      gap: 10px;
      text-align: right;
    }
    .exp-home {
      font-weight: 700;
      color: var(--color-primary);
      font-size: 0.9375rem;
    }
    .exp-orig {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .del-btn {
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      font-size: 1.1rem;
      cursor: pointer;
    }
    .empty-box {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
    }
    @media (min-width: 1024px) {
      .expenses-grid {
        grid-template-columns: 380px 1fr;
        align-items: start;
      }
    }
  `,
})
export class ExpensesPageComponent implements OnInit, OnDestroy {
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly itineraryStore = inject(ItineraryStore);
  private readonly api = inject(TripilotApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tripId = signal('');
  protected readonly showMore = signal(false);
  protected readonly submitting = signal(false);
  protected readonly fetchingRate = signal(false);
  protected readonly rateSource = signal<string | null>(null);
  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly categoryKey = expenseCategoryKey;

  protected title = '';
  protected amount: number | null = null;
  protected currency = 'JPY';
  protected exchangeRate = 0.215;
  protected category: ExpenseCategory = 'FOOD';
  protected paymentMethod = '';
  protected notes = '';

  protected readonly currencyOptions = computed<CurrencyOption[]>(() => {
    const list: CurrencyOption[] = [...COMMON_CURRENCIES];
    const extras = [
      this.itineraryStore.trip()?.default_currency,
      this.expenseStore.summary()?.home_currency,
      this.currency,
    ];
    for (const code of extras) {
      const upper = code?.trim().toUpperCase();
      if (upper && upper.length === 3 && !list.some((c) => c.code === upper)) {
        list.unshift({ code: upper, label: upper });
      }
    }
    return list;
  });

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
        totalFormatted: Number.isInteger(total)
          ? total.toLocaleString()
          : total.toLocaleString(undefined, { maximumFractionDigits: 2 }),
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

    const tripCurrency = this.itineraryStore.trip()?.default_currency;
    if (tripCurrency) {
      this.currency = tripCurrency;
      this.loadSavedRate(tripCurrency);
      await this.fetchLiveRate(tripCurrency);
    }
  }

  ngOnDestroy(): void {
    this.expenseStore.setItemFilter(null);
  }

  protected clearItemFilter(): void {
    this.expenseStore.setItemFilter(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { itemId: null },
      queryParamsHandling: 'merge',
    });
  }

  protected previewHomeAmount(): string | null {
    if (!this.amount || !this.exchangeRate) return null;
    return (this.amount * this.exchangeRate).toFixed(2);
  }

  protected onCurrencyChange(code: string): void {
    const upper = code.trim().toUpperCase();
    if (upper.length === 3) {
      this.loadSavedRate(upper);
      void this.fetchLiveRate(upper);
    }
  }

  protected async fetchLiveRate(overrideCode?: string): Promise<void> {
    const src = (overrideCode || this.currency || 'JPY').trim().toUpperCase();
    const dst = (this.expenseStore.summary()?.home_currency || 'TWD').trim().toUpperCase();
    if (src.length !== 3 || dst.length !== 3) {
      return;
    }
    if (src === dst) {
      this.exchangeRate = 1;
      this.rateSource.set('identity');
      return;
    }
    this.fetchingRate.set(true);
    try {
      const res = await this.api.getExchangeRate(src, dst);
      this.exchangeRate = res.rate;
      this.rateSource.set(res.source);
      this.saveRate(src, res.rate);
    } catch {
      this.rateSource.set(null);
    } finally {
      this.fetchingRate.set(false);
    }
  }

  protected toggleCategoryFilter(cat: ExpenseCategory): void {
    this.expenseStore.setCategoryFilter(
      this.expenseStore.selectedCategory() === cat ? 'ALL' : cat,
    );
  }

  protected async submitExpense(): Promise<void> {
    if (!this.title.trim() || !this.amount || this.amount <= 0) return;
    const upperCurrency = (this.currency.trim() || 'JPY').toUpperCase();
    this.saveRate(upperCurrency, this.exchangeRate);

    this.submitting.set(true);
    try {
      await this.expenseStore.addExpense(this.tripId(), {
        itinerary_item_id: this.expenseStore.selectedItemId(),
        title: this.title.trim(),
        category: this.category,
        amount_original: this.amount,
        currency_original: upperCurrency,
        exchange_rate: this.exchangeRate || 1,
        payment_method: this.paymentMethod.trim() || null,
        notes: this.notes.trim() || null,
      });
      this.title = '';
      this.amount = null;
      this.notes = '';
    } finally {
      this.submitting.set(false);
    }
  }

  private loadSavedRate(currency: string): void {
    const home = this.expenseStore.summary()?.home_currency || 'TWD';
    if (currency === home) {
      this.exchangeRate = 1;
      return;
    }
    try {
      const stored = localStorage.getItem(`${RATE_STORAGE_PREFIX}${currency}`);
      if (stored && Number(stored) > 0) {
        this.exchangeRate = Number(stored);
      }
    } catch {
      // Ignore storage access errors.
    }
  }

  private saveRate(currency: string, rate: number): void {
    try {
      localStorage.setItem(`${RATE_STORAGE_PREFIX}${currency}`, String(rate));
    } catch {
      // Ignore storage access errors.
    }
  }
}
