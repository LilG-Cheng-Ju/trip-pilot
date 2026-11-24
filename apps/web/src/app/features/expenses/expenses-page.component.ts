import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

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
import { ExpenseCategory, ExpenseItem, TripDay } from '../../core/models/tripilot.models';
import { isIncompleteNumberInput, readInputValue } from '../../core/utils/form-events.utils';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryKey,
  roundFxRate,
} from '../../core/utils/travel-format.utils';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { AppModalComponent } from '../../shared/modal.component';
import { TripSubnavComponent } from '../../shared/trip-subnav.component';
import { AuthStore } from '../../state/auth.store';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';

/** Low-friction per-trip expense ledger with instant currency conversion. */
@Component({
  selector: 'app-expenses-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppConfirmModalComponent, AppModalComponent, TripSubnavComponent],
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
          <form class="quick-card" (submit)="$event.preventDefault(); submitExpense()">
            <h3 class="section-title">{{ 'expenses.quickAdd' | t }}</h3>

            <label class="field">
              <span class="field-label">
                {{ 'expenses.field.title' | t }} <em class="req">*</em>
              </span>
              <input
                type="text"
                class="input-main"
                [value]="title()"
                (input)="title.set(readInputValue($event))"
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
                  [value]="amountText()"
                  (input)="onAmountInput($event)"
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
                  [value]="currency()"
                  name="currency"
                  (change)="onCurrencyChange(readInputValue($event))"
                >
                  @for (opt of currencyOptions(); track opt.code) {
                    <option [value]="opt.code" [selected]="opt.code === currency()">
                      {{ i18n.locale() === 'zh-TW' ? opt.labelZh : opt.labelEn }}
                    </option>
                  }
                </select>
              </label>

              <div class="field" [class.has-error]="quickRateError()">
                <span class="field-label">
                  {{ 'expenses.rateLabel' | t }}
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
                    (click)="resolveQuickRate()"
                  >
                    <span class="ms-icon sm" [class.spin]="fetchingRate()" aria-hidden="true">
                      sync
                    </span>
                  </button>
                </div>
              </div>
            </div>

            @if (isQuickForeign() && manualRateRequired()) {
              <div class="fx-warning-banner" role="alert">
                <span class="ms-icon sm" aria-hidden="true">warning</span>
                <span>{{ 'fx.unavailableHint' | t }}</span>
              </div>
            }

            <div class="preview-row tabular-nums">
              @if (previewHomeAmount() !== null) {
                <span class="preview-line">
                  ≈ {{ homeCurrency() }} {{ previewHomeAmount() }}
                </span>
              }
              @if (fetchingRate()) {
                <span class="fx-hint">{{ 'fx.loading' | t }}</span>
              } @else if (fxStatus() === 'cached') {
                <span class="fx-hint cached">{{ 'fx.cachedHint' | t }}</span>
              } @else if (fxStatus() === 'live') {
                <span class="fx-hint">{{ 'fx.liveHint' | t }}</span>
              }
            </div>

            @if (tripDays().length > 0) {
              <label class="field">
                <span class="field-label">{{ 'expenses.field.day' | t }}</span>
                <select
                  class="input-main"
                  [value]="selectedDayId()"
                  name="tripDayId"
                  (change)="selectedDayId.set(readInputValue($event))"
                >
                  <option value="" [selected]="selectedDayId() === ''">
                    {{ 'expenses.unassignedDay' | t }}
                  </option>
                  @for (day of tripDays(); track day.id) {
                    <option [value]="day.id" [selected]="selectedDayId() === day.id">
                      {{ 'expenses.dayOption' | t: { day: day.day_index, date: day.date.slice(5) } }}
                    </option>
                  }
                </select>
              </label>
            }

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

            <button type="button" class="more-toggle" (click)="showMore.set(!showMore())">
              <span>
                {{ (showMore() ? 'expenses.showLessOptions' : 'expenses.showMoreOptions') | t }}
              </span>
              <span class="ms-icon sm" aria-hidden="true">
                {{ showMore() ? 'expand_less' : 'expand_more' }}
              </span>
            </button>

            @if (showMore()) {
              <div class="extra-fields">
                <label class="field">
                  <span class="field-label">{{ 'expenses.field.paymentMethod' | t }}</span>
                  <input
                    type="text"
                    class="input-main"
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
                    class="input-main"
                    [value]="notes()"
                    (input)="notes.set(readInputValue($event))"
                    name="notes"
                    [placeholder]="'expenses.field.notesPlaceholder' | t"
                  />
                </label>
              </div>
            }

            <button
              type="submit"
              class="submit-btn"
              [disabled]="submitting() || fetchingRate() || (isQuickForeign() && exchangeRate() === null)"
            >
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
          @if (expenseStore.error(); as err) {
            <div class="error-banner" role="alert">
              <span>{{ err }}</span>
              <button
                type="button"
                class="error-dismiss"
                [attr.aria-label]="'common.close' | t"
                (click)="expenseStore.clearError()"
              >
                <span class="ms-icon sm" aria-hidden="true">close</span>
              </button>
            </div>
          }

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
            <p class="empty-state">{{ 'common.loading' | t }}</p>
          } @else if (expenseStore.filteredItems().length === 0) {
            <div class="empty-state">{{ 'expenses.empty' | t }}</div>
          } @else {
            <div class="ledger-list">
              @for (exp of expenseStore.filteredItems(); track exp.id) {
                <article class="exp-row">
                  <div class="exp-left">
                    <span class="exp-cat">{{ categoryKey(exp.category) | t }}</span>
                    <div>
                      <h4 class="exp-title">{{ exp.title }}</h4>
                      <p class="exp-meta tabular-nums">
                        @if (exp.trip_day_id && dayIndexById().get(exp.trip_day_id); as dayNum) {
                          <span class="exp-day-pill">{{ 'expenses.dayShort' | t: { day: dayNum } }}</span>
                        }
                        <span>{{ exp.paid_at.slice(0, 10) }}</span>
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
                      class="row-icon-btn"
                      [attr.aria-label]="'common.edit' | t"
                      [title]="'common.edit' | t"
                      (click)="openEditExpenseModal(exp)"
                    >
                      <span class="ms-icon sm" aria-hidden="true">edit</span>
                    </button>
                    <button
                      type="button"
                      class="row-icon-btn danger"
                      [attr.aria-label]="'common.delete' | t"
                      [title]="'common.delete' | t"
                      (click)="pendingDeleteExpense.set({ id: exp.id, title: exp.title })"
                    >
                      <span class="ms-icon sm" aria-hidden="true">delete</span>
                    </button>
                  </div>
                </article>
              }
            </div>
          }
        </section>
      </div>

      <app-modal
        [open]="editingExpense() !== null"
        [title]="'expenses.editModalTitle' | t"
        (closed)="editingExpense.set(null)"
      >
        <form class="modal-form" (submit)="$event.preventDefault(); submitEditExpense()">
          <label class="field">
            <span class="field-label">
              {{ 'expenses.field.title' | t }} <em class="req">*</em>
            </span>
            <input
              type="text"
              [value]="editTitle()"
              (input)="editTitle.set(readInputValue($event))"
              name="editTitle"
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
                class="tabular-nums"
                [value]="editAmountText()"
                (input)="onEditAmountInput($event)"
                name="editAmount"
                placeholder="0"
                required
              />
            </label>

            <label class="field">
              <span class="field-label">
                {{ 'expenses.field.currency' | t }} <em class="req">*</em>
              </span>
              <select
                [value]="editCurrency()"
                name="editCurrency"
                (change)="onEditCurrencyChange(readInputValue($event))"
              >
                @for (opt of editCurrencyOptions(); track opt.code) {
                  <option [value]="opt.code" [selected]="opt.code === editCurrency()">
                    {{ i18n.locale() === 'zh-TW' ? opt.labelZh : opt.labelEn }}
                  </option>
                }
              </select>
            </label>

            <div class="field" [class.has-error]="editRateError()">
              <span class="field-label">
                {{ 'expenses.rateLabel' | t }}
                @if (editManualRateRequired()) {
                  <em class="req">*</em>
                }
              </span>
              <div class="rate-box">
                <input
                  type="number"
                  step="any"
                  min="0.000001"
                  class="tabular-nums"
                  [value]="editExchangeRateText()"
                  (input)="onEditRateInput($event)"
                  name="editExchangeRate"
                  placeholder="0"
                />
                <button
                  type="button"
                  class="fx-btn"
                  [disabled]="editFetchingRate()"
                  [title]="'fx.refresh' | t"
                  (click)="resolveEditRate()"
                >
                  <span class="ms-icon sm" [class.spin]="editFetchingRate()" aria-hidden="true">
                    sync
                  </span>
                </button>
              </div>
            </div>
          </div>

          @if (isEditForeign() && editManualRateRequired()) {
            <div class="fx-warning-banner" role="alert">
              <span class="ms-icon sm" aria-hidden="true">warning</span>
              <span>{{ 'fx.unavailableHint' | t }}</span>
            </div>
          }

          <div class="preview-row tabular-nums">
            @if (editPreviewHomeAmount() !== null) {
              <span class="preview-line">
                ≈ {{ homeCurrency() }} {{ editPreviewHomeAmount() }}
              </span>
            }
            @if (editFetchingRate()) {
              <span class="fx-hint">{{ 'fx.loading' | t }}</span>
            } @else if (editFxStatus() === 'cached') {
              <span class="fx-hint cached">{{ 'fx.cachedHint' | t }}</span>
            } @else if (editFxStatus() === 'live') {
              <span class="fx-hint">{{ 'fx.liveHint' | t }}</span>
            }
          </div>

          <div class="field">
            <span class="field-label">{{ 'expenses.field.category' | t }}</span>
            <div class="cat-chips">
              @for (cat of categories; track cat) {
                <button
                  type="button"
                  class="cat-chip"
                  [class.active]="editCategory() === cat"
                  (click)="editCategory.set(cat)"
                >
                  {{ categoryKey(cat) | t }}
                </button>
              }
            </div>
          </div>

          <div class="two-col">
            @if (tripDays().length > 0) {
              <label class="field">
                <span class="field-label">{{ 'expenses.field.day' | t }}</span>
                <select
                  [value]="editDayId()"
                  name="editDayId"
                  (change)="editDayId.set(readInputValue($event))"
                >
                  <option value="" [selected]="editDayId() === ''">
                    {{ 'expenses.unassignedDay' | t }}
                  </option>
                  @for (day of tripDays(); track day.id) {
                    <option [value]="day.id" [selected]="editDayId() === day.id">
                      {{ 'expenses.dayOption' | t: { day: day.day_index, date: day.date.slice(5) } }}
                    </option>
                  }
                </select>
              </label>
            }

            <label class="field">
              <span class="field-label">{{ 'expenses.field.date' | t }}</span>
              <input
                type="date"
                [value]="editPaidAt()"
                (input)="editPaidAt.set(readInputValue($event))"
                name="editPaidAt"
              />
            </label>
          </div>

          <label class="field">
            <span class="field-label">{{ 'expenses.field.paymentMethod' | t }}</span>
            <input
              type="text"
              [value]="editPaymentMethod()"
              (input)="editPaymentMethod.set(readInputValue($event))"
              name="editPaymentMethod"
              [placeholder]="'expenses.field.paymentPlaceholder' | t"
            />
          </label>

          <label class="field">
            <span class="field-label">{{ 'expenses.field.notes' | t }}</span>
            <input
              type="text"
              [value]="editNotes()"
              (input)="editNotes.set(readInputValue($event))"
              name="editNotes"
              [placeholder]="'expenses.field.notesPlaceholder' | t"
            />
          </label>

          <div class="modal-actions">
            <button type="button" class="btn-ghost" (click)="editingExpense.set(null)">
              {{ 'common.cancel' | t }}
            </button>
            <button
              type="submit"
              class="btn-primary"
              [disabled]="
                editSubmitting() ||
                editFetchingRate() ||
                !editTitle().trim() ||
                !editAmount() ||
                editAmount()! <= 0 ||
                (isEditForeign() && editExchangeRate() === null)
              "
            >
              {{ 'common.save' | t }}
            </button>
          </div>
        </form>
      </app-modal>

      <app-confirm-modal
        [open]="pendingDeleteExpense() !== null"
        [title]="'confirm.deleteExpenseTitle' | t"
        [message]="
          pendingDeleteExpense()
            ? ('confirm.deleteExpenseBody' | t: { name: pendingDeleteExpense()!.title })
            : ''
        "
        [busy]="deletingExpense()"
        (confirmed)="executeDeleteExpense()"
        (cancelled)="pendingDeleteExpense.set(null)"
      />
    </div>
  `,
  styles: `
    .page {
      max-width: 1120px;
      margin: 0 auto;
      padding: var(--space-5) var(--space-4) calc(var(--nav-bottom-height) + var(--space-6));
    }
    .expenses-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-5);
    }
    .summary-col,
    .ledger-col {
      min-width: 0;
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
      color: var(--color-text-on-primary);
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
      font-family: var(--font-display);
      font-size: 2.1rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--color-accent);
    }
    .hero-amount .currency {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-on-primary);
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
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .req {
      color: var(--color-alert);
      font-style: normal;
      font-weight: 600;
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
      font-weight: 600;
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
      grid-template-columns: minmax(0, 1fr) 122px 104px;
      gap: 8px;
      align-items: end;
    }
    @media (max-width: 440px) {
      .amount-row {
        grid-template-columns: minmax(0, 1fr) 124px;
      }
      .amount-row > :last-child {
        grid-column: 1 / -1;
      }
    }
    .input-currency {
      font-weight: 600;
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
    .field.has-error .rate-box {
      border-color: var(--color-alert);
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
    .fx-hint.cached {
      color: var(--color-accent-ink);
      font-weight: 600;
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
      font-weight: 600;
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
      color: var(--color-text-on-primary);
    }
    .more-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
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
      color: var(--color-text-on-primary);
      font: inherit;
      font-weight: 600;
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
      min-width: 0;
    }
    .exp-cat {
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
      font-size: 0.7rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .exp-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .exp-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .exp-day-pill {
      padding: 1px 7px;
      border-radius: var(--radius-pill);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.7rem;
      font-weight: 600;
    }
    .exp-right {
      display: flex;
      align-items: center;
      gap: 6px;
      text-align: right;
    }
    .exp-home {
      font-weight: 600;
      color: var(--color-primary);
      font-size: 0.9375rem;
    }
    .exp-orig {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .row-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
    }
    .row-icon-btn:hover {
      border-color: var(--color-border);
      color: var(--color-primary);
    }
    .row-icon-btn.danger:hover {
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    .two-col {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 10px;
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
  private readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(I18nService);
  private readonly fxResolver = inject(FxRateResolverService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

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
  protected readonly readInputValue = readInputValue;

  private quickRateSeq = 0;
  private editRateSeq = 0;

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

  protected readonly editTitle = signal('');
  protected readonly editAmountText = signal('');
  protected readonly editAmount = computed<number | null>(() => {
    const raw = this.editAmountText().trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });
  protected readonly editCurrency = signal('JPY');
  protected readonly editExchangeRateText = signal('1');
  protected readonly editExchangeRate = computed<number | null>(() => {
    const raw = this.editExchangeRateText().trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  protected readonly editFetchingRate = signal(false);
  protected readonly editFxStatus = signal<FxResolutionStatus>('same');
  protected readonly editManualRateRequired = signal(false);
  protected readonly editRateError = signal(false);
  protected readonly editCategory = signal<ExpenseCategory>('FOOD');
  protected readonly editDayId = signal('');
  protected readonly editPaidAt = signal('');
  protected readonly editPaymentMethod = signal('');
  protected readonly editNotes = signal('');
  protected readonly editSubmitting = signal(false);

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

  protected readonly isEditForeign = computed(
    () => (this.editCurrency().trim() || 'JPY').toUpperCase() !== this.homeCurrency(),
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
    return (amt * rate).toFixed(2);
  });

  protected readonly editPreviewHomeAmount = computed<string | null>(() => {
    const amt = this.editAmount();
    const rate = this.isEditForeign() ? this.editExchangeRate() : 1;
    if (!amt || !rate) return null;
    return (amt * rate).toFixed(2);
  });

  protected readonly currencyOptions = computed<QuickCurrencyOption[]>(() =>
    this.buildCurrencyOptions([
      this.itineraryStore.trip()?.default_currency,
      this.homeCurrency(),
      this.currency(),
    ]),
  );

  protected readonly editCurrencyOptions = computed<QuickCurrencyOption[]>(() =>
    this.buildCurrencyOptions([
      this.itineraryStore.trip()?.default_currency,
      this.homeCurrency(),
      this.editCurrency(),
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

    if (itemId) {
      const matchedDayId = this.findDayIdForItem(itemId);
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

  protected openEditExpenseModal(exp: ExpenseItem): void {
    const upperCurrency = exp.currency_original.trim().toUpperCase();
    const numericRate = Number(exp.exchange_rate);
    this.editTitle.set(exp.title);
    this.editAmountText.set(String(Number(exp.amount_original) || exp.amount_original));
    this.editCurrency.set(upperCurrency);
    this.editExchangeRateText.set(
      Number.isFinite(numericRate) && numericRate > 0 ? String(roundFxRate(numericRate)) : '',
    );
    this.editFxStatus.set(upperCurrency === this.homeCurrency() ? 'same' : 'cached');
    this.editManualRateRequired.set(false);
    this.editRateError.set(false);
    this.editCategory.set(exp.category);
    this.editDayId.set(exp.trip_day_id ?? '');
    this.editPaidAt.set(exp.paid_at.slice(0, 10));
    this.editPaymentMethod.set(exp.payment_method ?? '');
    this.editNotes.set(exp.notes ?? '');
    this.editingExpense.set(exp);
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

  protected onEditAmountInput(event: Event): void {
    if (isIncompleteNumberInput(event)) {
      return;
    }
    this.editAmountText.set(readInputValue(event));
  }

  protected onEditRateInput(event: Event): void {
    if (isIncompleteNumberInput(event)) {
      return;
    }
    this.editRateError.set(false);
    this.editExchangeRateText.set(readInputValue(event));
  }

  protected onEditCurrencyChange(code: string): void {
    this.editCurrency.set(code);
    const upper = code.trim().toUpperCase();
    if (upper.length === ISO_CURRENCY_CODE_LENGTH) {
      void this.resolveEditRate(upper);
    }
  }

  protected async resolveQuickRate(overrideCode?: string): Promise<void> {
    const src = (overrideCode || this.currency() || 'JPY').trim().toUpperCase();
    const dst = this.homeCurrency();
    const seq = ++this.quickRateSeq;
    if (
      src.length !== ISO_CURRENCY_CODE_LENGTH ||
      dst.length !== ISO_CURRENCY_CODE_LENGTH
    ) {
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

  protected async resolveEditRate(overrideCode?: string): Promise<void> {
    const src = (overrideCode || this.editCurrency() || 'JPY').trim().toUpperCase();
    const dst = this.homeCurrency();
    const seq = ++this.editRateSeq;
    if (
      src.length !== ISO_CURRENCY_CODE_LENGTH ||
      dst.length !== ISO_CURRENCY_CODE_LENGTH
    ) {
      return;
    }
    if (src === dst) {
      this.editFxStatus.set('same');
      this.editManualRateRequired.set(false);
      this.editRateError.set(false);
      this.editExchangeRateText.set('1');
      this.editFetchingRate.set(false);
      return;
    }
    this.editFetchingRate.set(true);
    this.editRateError.set(false);
    try {
      const res = await this.fxResolver.resolve(src, dst);
      if (seq !== this.editRateSeq) {
        return;
      }
      this.editFxStatus.set(res.status);
      this.editManualRateRequired.set(res.manualRequired);
      this.editExchangeRateText.set(res.rate !== null ? String(roundFxRate(res.rate)) : '');
    } finally {
      if (seq === this.editRateSeq) {
        this.editFetchingRate.set(false);
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
    const itemDayId = filteredItemId ? this.findDayIdForItem(filteredItemId) : null;
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

  protected async submitEditExpense(): Promise<void> {
    const target = this.editingExpense();
    if (!target) {
      return;
    }
    const title = this.editTitle().trim();
    const amount = this.editAmount();
    const upperCurrency = (this.editCurrency().trim() || 'JPY').toUpperCase();
    const home = this.homeCurrency();
    const rate = upperCurrency === home ? 1 : this.editExchangeRate();
    if (!title || !amount || amount <= 0) {
      return;
    }
    if (rate === null || rate <= 0) {
      this.editRateError.set(true);
      return;
    }

    const nextDayId = this.editDayId() || null;
    const itemDayId = target.itinerary_item_id
      ? this.findDayIdForItem(target.itinerary_item_id)
      : null;
    const keepItemLink =
      target.itinerary_item_id && (!nextDayId || !itemDayId || nextDayId === itemDayId);
    const nextDate = this.editPaidAt().trim();
    const paidAtChanged = nextDate && nextDate !== target.paid_at.slice(0, 10);

    this.editSubmitting.set(true);
    try {
      await this.expenseStore.updateExpense(this.tripId(), target.id, {
        title,
        amount_original: amount,
        currency_original: upperCurrency,
        exchange_rate: rate,
        category: this.editCategory(),
        trip_day_id: nextDayId,
        ...(target.itinerary_item_id && !keepItemLink ? { itinerary_item_id: null } : {}),
        ...(paidAtChanged ? { paid_at: `${nextDate}T00:00:00Z` } : {}),
        payment_method: this.editPaymentMethod().trim() || null,
        notes: this.editNotes().trim() || null,
      });
      if (upperCurrency !== home) {
        this.fxResolver.cacheRate(upperCurrency, home, rate);
      }
      this.editingExpense.set(null);
    } catch {
      // Error state is recorded on ExpenseStore and shown in the error banner.
    } finally {
      this.editSubmitting.set(false);
    }
  }

  private buildCurrencyOptions(extras: (string | undefined | null)[]): QuickCurrencyOption[] {
    const list: QuickCurrencyOption[] = [...COMMON_CURRENCIES];
    for (const code of extras) {
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
  }

  private findDayIdForItem(itemId: string): string | null {
    for (const day of this.tripDays()) {
      for (const opt of day.options) {
        if (opt.items.some((it) => it.id === itemId)) {
          return day.id;
        }
      }
    }
    return null;
  }
}
