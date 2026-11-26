import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { provideTripilotDateAdapter } from '../../core/config/material-date-formats';
import { I18nService } from '../../core/i18n/i18n.service';
import {
  ExpenseItem,
  FxRateResponse,
  TripDetail,
  TripExpensesSummary,
} from '../../core/models/tripilot.models';
import { NetworkStatusService } from '../../core/network/network-status.service';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';
import { ExpensesPageComponent } from './expenses-page.component';

function makeTripDetail(): TripDetail {
  return {
    id: 'trip-1',
    title: 'Tokyo Trip',
    destination_summary: 'Tokyo',
    country_codes: ['JP'],
    start_date: '2026-10-01',
    end_date: '2026-10-02',
    default_currency: 'JPY',
    cover_image_url: null,
    status: 'PLANNING',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    notes: null,
    days: [
      {
        id: 'day-1',
        trip_id: 'trip-1',
        day_index: 1,
        date: '2026-10-01',
        title: null,
        active_option_id: 'opt-1',
        notes: null,
        options: [],
      },
      {
        id: 'day-2',
        trip_id: 'trip-1',
        day_index: 2,
        date: '2026-10-02',
        title: null,
        active_option_id: 'opt-2',
        notes: null,
        options: [],
      },
    ],
  };
}

describe('ExpensesPageComponent', () => {
  let getTripCalls: string[];
  let createCalls: Array<{ tripId: string; payload: Record<string, unknown> }>;
  let updateCalls: Array<{ expenseId: string; payload: Record<string, unknown> }>;
  let deleteCalls: string[];
  let fxImpl: (from: string, to: string) => Promise<FxRateResponse>;

  beforeEach(async () => {
    localStorage.clear();
    getTripCalls = [];
    createCalls = [];
    updateCalls = [];
    deleteCalls = [];
    fxImpl = async (from, to) => ({
      from_currency: from,
      to_currency: to,
      rate: from === 'USD' ? 32.1 : 0.215,
      source: 'open_er_api',
      cached: false,
    });

    const initialExpense: ExpenseItem = {
      id: 'exp-1',
      trip_id: 'trip-1',
      trip_day_id: 'day-1',
      itinerary_item_id: null,
      title: 'Airport Express',
      category: 'TRANSIT',
      amount_original: '3000',
      currency_original: 'JPY',
      exchange_rate: '0.215',
      amount_home: '645.00',
      currency_home: 'TWD',
      paid_at: '2026-10-01T09:00:00Z',
      payment_method: 'IC Card',
      notes: null,
    };

    const summary: TripExpensesSummary = {
      trip_id: 'trip-1',
      home_currency: 'TWD',
      total_home_amount: '645.00',
      by_category: { TRANSIT: '645.00' },
      items: [initialExpense],
    };

    await TestBed.configureTestingModule({
      imports: [ExpensesPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideTripilotDateAdapter(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ tripId: 'trip-1' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        {
          provide: TripilotApiService,
          useValue: {
            getTrip: async (tripId: string) => {
              getTripCalls.push(tripId);
              return makeTripDetail();
            },
            listExpenses: async () => summary,
            getExchangeRate: (from: string, to: string) => fxImpl(from, to),
            createExpense: async (tripId: string, payload: Record<string, unknown>) => {
              createCalls.push({ tripId, payload });
              return {
                ...initialExpense,
                id: 'exp-2',
                trip_day_id: (payload['trip_day_id'] as string | null) ?? null,
                title: String(payload['title']),
                category: payload['category'] as ExpenseItem['category'],
                amount_original: String(payload['amount_original']),
                currency_original: String(payload['currency_original']),
                exchange_rate: String(payload['exchange_rate']),
                amount_home: (
                  Number(payload['amount_original']) * Number(payload['exchange_rate'])
                ).toFixed(2),
                paid_at: '2026-10-02T12:00:00Z',
              };
            },
            updateExpense: async (expenseId: string, payload: Record<string, unknown>) => {
              updateCalls.push({ expenseId, payload });
              return {
                ...initialExpense,
                id: expenseId,
                trip_day_id:
                  'trip_day_id' in payload
                    ? (payload['trip_day_id'] as string | null)
                    : initialExpense.trip_day_id,
                title: String(payload['title'] ?? initialExpense.title),
                category:
                  (payload['category'] as ExpenseItem['category']) ?? initialExpense.category,
                amount_original: String(
                  payload['amount_original'] ?? initialExpense.amount_original,
                ),
                currency_original: String(
                  payload['currency_original'] ?? initialExpense.currency_original,
                ),
                exchange_rate: String(payload['exchange_rate'] ?? initialExpense.exchange_rate),
                amount_home: (
                  Number(payload['amount_original'] ?? initialExpense.amount_original) *
                  Number(payload['exchange_rate'] ?? initialExpense.exchange_rate)
                ).toFixed(2),
                paid_at: String(payload['paid_at'] ?? initialExpense.paid_at),
                notes: (payload['notes'] as string | null) ?? null,
              };
            },
            deleteExpense: async (expenseId: string) => {
              deleteCalls.push(expenseId);
            },
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
    TestBed.inject(NetworkStatusService).isOnline.set(true);
    TestBed.inject(ItineraryStore).reset();
    TestBed.inject(ExpenseStore).reset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('loads trip days on direct reload, displays Day N pill, supports day attribution and editing', async () => {
    const fixture = TestBed.createComponent(ExpensesPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getTripCalls).toEqual(['trip-1']);
    const host = fixture.nativeElement as HTMLElement;

    // Day attribution dropdown contains Unassigned + Day 1 + Day 2.
    const daySelect = fixture.debugElement.query(
      By.css('mat-select[name="tripDayId"]'),
    ).componentInstance as MatSelect;
    expect(daySelect.options.map((o) => o.viewValue.trim())).toEqual([
      'Unassigned',
      'Day 1 · 10-01',
      'Day 2 · 10-02',
    ]);

    // Existing row shows Day 1 pill and currency-aware formatted amounts.
    expect(host.querySelector('.exp-day-pill')?.textContent?.trim()).toBe('Day 1');
    expect(host.querySelector('.hero-amount > span:last-child')?.textContent?.trim()).toBe('645');
    expect(host.querySelector('.exp-home')?.textContent?.trim()).toBe('TWD 645');
    expect(host.querySelector('.exp-orig')?.textContent?.trim()).toBe('JPY 3,000');

    // Quick-add expense attributed to Day 2.
    const titleInput = host.querySelector('input[name="title"]') as HTMLInputElement;
    titleInput.value = 'Sushi Lunch';
    titleInput.dispatchEvent(new Event('input'));
    const amountInput = host.querySelector('input[name="amount"]') as HTMLInputElement;
    amountInput.value = '2000';
    amountInput.dispatchEvent(new Event('input'));
    daySelect.selectionChange.emit(new MatSelectChange(daySelect, 'day-2'));
    fixture.detectChanges();

    const submitBtn = host.querySelector('.quick-card button[type="submit"]') as HTMLButtonElement;
    submitBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].payload).toEqual(
      expect.objectContaining({
        title: 'Sushi Lunch',
        trip_day_id: 'day-2',
      }),
    );

    // Edit the second row (Airport Express, originally 2026-10-01) and change currency to USD.
    const editButtons = host.querySelectorAll('.row-icon-btn[aria-label="Edit"]');
    (editButtons[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    const editCurrencySelect = fixture.debugElement.query(
      By.css('mat-select[name="editCurrency"]'),
    ).componentInstance as MatSelect;
    editCurrencySelect.selectionChange.emit(new MatSelectChange(editCurrencySelect, 'USD'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const editRateInput = host.querySelector(
      'input[name="editExchangeRate"]',
    ) as HTMLInputElement;
    expect(editRateInput.value).toBe('32.1');

    const editTitleInput = host.querySelector('input[name="editTitle"]') as HTMLInputElement;
    editTitleInput.value = 'Updated Pass';
    editTitleInput.dispatchEvent(new Event('input'));
    const editAmountInput = host.querySelector('input[name="editAmount"]') as HTMLInputElement;
    editAmountInput.value = '10';
    editAmountInput.dispatchEvent(new Event('input'));
    const editDaySelect = fixture.debugElement.query(
      By.css('mat-select[name="editDayId"]'),
    ).componentInstance as MatSelect;
    editDaySelect.selectionChange.emit(new MatSelectChange(editDaySelect, 'day-2'));
    const editDateInput = host.querySelector('input[name="editPaidAt"]') as HTMLInputElement;
    editDateInput.value = '2026-10-03';
    editDateInput.dispatchEvent(new Event('input'));
    const editNotesInput = host.querySelector('input[name="editNotes"]') as HTMLInputElement;
    editNotesInput.value = 'Airport kiosk';
    editNotesInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const editSaveBtn = host.querySelector(
      'app-modal button[type="submit"]',
    ) as HTMLButtonElement;
    editSaveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual(
      expect.objectContaining({
        title: 'Updated Pass',
        amount_original: 10,
        currency_original: 'USD',
        exchange_rate: 32.1,
        trip_day_id: 'day-2',
        paid_at: '2026-10-03T00:00:00Z',
        notes: 'Airport kiosk',
      }),
    );

    // Delete confirmation opens AppConfirmModalComponent and deletes on confirm.
    const deleteBtn = host.querySelector(
      '.row-icon-btn[aria-label="Delete"]',
    ) as HTMLButtonElement;
    deleteBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const confirmDeleteBtn = host.querySelector(
      'app-confirm-modal .btn-danger',
    ) as HTMLButtonElement;
    expect(confirmDeleteBtn).toBeTruthy();
    confirmDeleteBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(deleteCalls).toHaveLength(1);
  });
});
