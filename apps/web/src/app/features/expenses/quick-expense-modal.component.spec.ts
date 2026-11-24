import { TestBed } from '@angular/core/testing';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ExpenseItem, FxRateResponse } from '../../core/models/tripilot.models';
import { NetworkStatusService } from '../../core/network/network-status.service';
import { ExpenseStore } from '../../state/expense.store';
import { QuickExpenseModalComponent } from './quick-expense-modal.component';

describe('QuickExpenseModalComponent', () => {
  let getExchangeRateImpl: (from: string, to: string) => Promise<FxRateResponse>;
  let createExpensePayloads: Array<{ tripId: string; payload: unknown }>;

  beforeEach(async () => {
    localStorage.clear();
    createExpensePayloads = [];
    getExchangeRateImpl = async () => ({
      from_currency: 'JPY',
      to_currency: 'TWD',
      rate: 0.215,
      source: 'open_er_api',
      cached: false,
    });

    await TestBed.configureTestingModule({
      imports: [QuickExpenseModalComponent],
      providers: [
        {
          provide: TripilotApiService,
          useValue: {
            getExchangeRate: (from: string, to: string) => getExchangeRateImpl(from, to),
            listExpenses: async () => ({
              trip_id: 'trip-1',
              home_currency: 'TWD',
              total_home_amount: '0.00',
              by_category: {},
              items: [],
            }),
            createExpense: async (tripId: string, payload: unknown): Promise<ExpenseItem> => {
              createExpensePayloads.push({ tripId, payload });
              return {
                id: 'exp-1',
                trip_id: tripId,
                trip_day_id: 'day-2',
                itinerary_item_id: null,
                title: 'Ramen',
                category: 'FOOD',
                amount_original: '1000',
                currency_original: 'JPY',
                exchange_rate: '0.215',
                amount_home: '215.00',
                currency_home: 'TWD',
                paid_at: '2026-10-02T12:00:00Z',
                payment_method: null,
                notes: null,
              };
            },
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
    TestBed.inject(NetworkStatusService).isOnline.set(true);
    TestBed.inject(ExpenseStore).reset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('sends trip_day_id and live exchange rate when creating an expense', async () => {
    const fixture = TestBed.createComponent(QuickExpenseModalComponent);
    fixture.componentRef.setInput('tripId', 'trip-1');
    fixture.componentRef.setInput('tripDayId', 'day-2');
    fixture.componentRef.setInput('defaultCurrency', 'JPY');
    fixture.componentRef.setInput('homeCurrency', 'TWD');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.fx-warning-banner')).toBeNull();

    const titleInput = host.querySelector('input[name="title"]') as HTMLInputElement;
    titleInput.value = 'Ichiran Ramen';
    titleInput.dispatchEvent(new Event('input'));

    const amountInput = host.querySelector('input[name="amount"]') as HTMLInputElement;
    amountInput.value = '1000';
    amountInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    submitBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(createExpensePayloads).toHaveLength(1);
    expect(createExpensePayloads[0]).toEqual({
      tripId: 'trip-1',
      payload: expect.objectContaining({
        trip_day_id: 'day-2',
        title: 'Ichiran Ramen',
        amount_original: 1000,
        currency_original: 'JPY',
        exchange_rate: 0.215,
      }),
    });
  });

  it('shows fxUnavailableHint and blocks silent 1.0 submission when offline without cache', async () => {
    TestBed.inject(NetworkStatusService).isOnline.set(false);

    const fixture = TestBed.createComponent(QuickExpenseModalComponent);
    fixture.componentRef.setInput('tripId', 'trip-1');
    fixture.componentRef.setInput('tripDayId', 'day-1');
    fixture.componentRef.setInput('defaultCurrency', 'JPY');
    fixture.componentRef.setInput('homeCurrency', 'TWD');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const warning = host.querySelector('.fx-warning-banner');
    expect(warning).toBeTruthy();
    expect(warning?.textContent).toContain('enter the exchange rate manually');

    const titleInput = host.querySelector('input[name="title"]') as HTMLInputElement;
    titleInput.value = 'Sushi';
    titleInput.dispatchEvent(new Event('input'));

    const amountInput = host.querySelector('input[name="amount"]') as HTMLInputElement;
    amountInput.value = '10000';
    amountInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const rateInput = host.querySelector('input[name="exchangeRate"]') as HTMLInputElement;
    expect(rateInput.value).toBe('');

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    const form = host.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(createExpensePayloads).toHaveLength(0);

    // Once user enters an explicit FX rate, submission succeeds with that rate.
    rateInput.value = '0.22';
    rateInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(submitBtn.disabled).toBe(false);
    submitBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(createExpensePayloads).toHaveLength(1);
    expect(createExpensePayloads[0].payload).toEqual(
      expect.objectContaining({
        amount_original: 10000,
        currency_original: 'JPY',
        exchange_rate: 0.22,
      }),
    );
  });
});
