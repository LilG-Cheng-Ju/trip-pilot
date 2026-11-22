import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory } from '../../core/models/tripilot.models';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';

const RATE_STORAGE_PREFIX = 'tripilot.fxRate.';

const CATEGORIES: ExpenseCategory[] = [
  'FOOD',
  'TRANSIT',
  'LODGING',
  'FLIGHT',
  'ACTIVITY',
  'SHOPPING',
  'OTHER',
];

/** Low-friction per-trip expense ledger with instant currency conversion. */
@Component({
  selector: 'app-expenses-page',
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-head">
        <a class="back-btn" [routerLink]="['/trips', tripId()]">←</a>
        <div>
          <h2 class="page-title">{{ 'expenses.title' | t }}</h2>
          @if (itineraryStore.trip(); as trip) {
            <p class="trip-sub">{{ trip.title }}</p>
          }
        </div>
      </header>

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
            </section>
          }

          <!-- Ultra-Low-Friction Quick Add Form -->
          <form class="quick-card" (ngSubmit)="submitExpense()">
            <h3 class="section-title">{{ 'expenses.quickAdd' | t }}</h3>

            <input
              type="text"
              class="input-main"
              [(ngModel)]="title"
              name="title"
              [placeholder]="'expenses.itemPlaceholder' | t"
              required
            />

            <div class="amount-row">
              <input
                type="number"
                step="any"
                min="0.01"
                class="input-amount tabular-nums"
                [(ngModel)]="amount"
                name="amount"
                [placeholder]="'expenses.amountPlaceholder' | t"
                required
              />
              <input
                type="text"
                maxlength="3"
                class="input-currency"
                [(ngModel)]="currency"
                name="currency"
                (ngModelChange)="onCurrencyChange($event)"
              />
              <label class="rate-box">
                <span>{{ 'expenses.rateLabel' | t }}</span>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  class="tabular-nums"
                  [(ngModel)]="exchangeRate"
                  name="exchangeRate"
                />
              </label>
            </div>

            @if (previewHomeAmount() !== null) {
              <p class="preview-line tabular-nums">
                ≈ {{ expenseStore.summary()?.home_currency || 'TWD' }} {{ previewHomeAmount() }}
              </p>
            }

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
                <input
                  type="text"
                  class="input-main"
                  [(ngModel)]="paymentMethod"
                  name="paymentMethod"
                  [placeholder]="'expenses.paymentMethod' | t"
                />
                <input
                  type="text"
                  class="input-main"
                  [(ngModel)]="notes"
                  name="notes"
                  [placeholder]="'itinerary.form.notes' | t"
                />
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
                    <span class="exp-home">{{ exp.currency_home }} {{ exp.amount_home }}</span>
                    @if (exp.currency_original !== exp.currency_home) {
                      <span class="exp-orig">{{ exp.currency_original }} {{ exp.amount_original }}</span>
                    }
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
      grid-template-columns: 1fr 72px 104px;
      gap: 8px;
    }
    .input-currency {
      text-transform: uppercase;
      text-align: center;
      font-weight: 700;
    }
    .rate-box {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }
    .rate-box input {
      width: 100%;
      border: none;
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.8125rem;
      outline: none;
    }
    .preview-line {
      margin: -4px 0 0;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-primary);
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
export class ExpensesPageComponent implements OnInit {
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly itineraryStore = inject(ItineraryStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly tripId = signal('');
  protected readonly showMore = signal(false);
  protected readonly submitting = signal(false);
  protected readonly categories = CATEGORIES;

  protected title = '';
  protected amount: number | null = null;
  protected currency = 'JPY';
  protected exchangeRate = 0.215;
  protected category: ExpenseCategory = 'FOOD';
  protected paymentMethod = '';
  protected notes = '';

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
    this.tripId.set(id);
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
    }
  }

  protected categoryKey(
    cat: ExpenseCategory,
  ):
    | 'expenses.cat.FLIGHT'
    | 'expenses.cat.LODGING'
    | 'expenses.cat.TRANSIT'
    | 'expenses.cat.FOOD'
    | 'expenses.cat.ACTIVITY'
    | 'expenses.cat.SHOPPING'
    | 'expenses.cat.OTHER' {
    return `expenses.cat.${cat}`;
  }

  protected previewHomeAmount(): string | null {
    if (!this.amount || !this.exchangeRate) return null;
    return (this.amount * this.exchangeRate).toFixed(2);
  }

  protected onCurrencyChange(code: string): void {
    const upper = code.trim().toUpperCase();
    if (upper.length === 3) {
      this.loadSavedRate(upper);
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
