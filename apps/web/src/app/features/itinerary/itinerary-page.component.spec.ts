import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { provideTripilotDateAdapter } from '../../core/config/material-date-formats';
import { I18nService } from '../../core/i18n/i18n.service';
import { ItineraryItem, TripDetail } from '../../core/models/tripilot.models';
import { ViewportService } from '../../core/utils/viewport.service';
import { AuthStore } from '../../state/auth.store';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';
import { ItineraryPageComponent } from './itinerary-page.component';

function makeItem(overrides: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: 'item-1',
    day_option_id: 'opt-a',
    type: 'SPOT',
    sort_order: 0,
    title: 'Senso-ji Temple',
    start_time: '09:00',
    end_time: '11:00',
    timezone: null,
    address: 'Asakusa, Tokyo',
    latitude: 35.7148,
    longitude: 139.7967,
    google_maps_url: null,
    notes: null,
    details: {},
    choice_group_id: null,
    is_selected: true,
    ...overrides,
  };
}

function makeTrip(): TripDetail {
  return {
    id: 'trip-1',
    title: 'Tokyo Spring',
    destination_summary: 'Tokyo',
    country_codes: ['JP'],
    start_date: '2026-04-01',
    end_date: '2026-04-02',
    default_currency: 'JPY',
    cover_image_url: null,
    status: 'PLANNING',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    notes: null,
    days: [
      {
        id: 'day-1',
        trip_id: 'trip-1',
        day_index: 1,
        date: '2026-04-01',
        title: 'Asakusa Walk',
        active_option_id: 'opt-a',
        notes: null,
        options: [
          {
            id: 'opt-a',
            trip_day_id: 'day-1',
            label: 'Plan A',
            sort_order: 0,
            summary_notes: null,
            cached_ground_distance_km: 12.4,
            cached_distance_is_approx: false,
            items: [makeItem({ id: 'item-a1', day_option_id: 'opt-a', title: 'Senso-ji Temple' })],
            route_segments: [],
          },
          {
            id: 'opt-b',
            trip_day_id: 'day-1',
            label: 'Plan B',
            sort_order: 1,
            summary_notes: null,
            cached_ground_distance_km: 18.4,
            cached_distance_is_approx: true,
            items: [
              makeItem({ id: 'item-b1', day_option_id: 'opt-b', title: 'Meiji Shrine', sort_order: 0 }),
              makeItem({ id: 'item-b2', day_option_id: 'opt-b', title: 'Shibuya Sky', sort_order: 1 }),
            ],
            route_segments: [],
          },
        ],
      },
    ],
  };
}

describe('ItineraryPageComponent', () => {
  let setActiveOptionSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.clear();
    const trip = makeTrip();
    setActiveOptionSpy = vi.fn(async (dayId: string, optionId: string) => ({
      ...trip.days[0],
      id: dayId,
      active_option_id: optionId,
    }));

    await TestBed.configureTestingModule({
      imports: [ItineraryPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideTripilotDateAdapter(),
        {
          provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
          useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ tripId: 'trip-1' }) } },
        },
        {
          provide: ViewportService,
          useValue: { isDesktop: signal(false) },
        },
        {
          provide: TripilotApiService,
          useValue: {
            getTrip: async () => trip,
            listExpenses: async () => ({
              trip_id: 'trip-1',
              home_currency: 'TWD',
              total_home_amount: '0',
              by_category: {},
              items: [],
            }),
            listShares: async () => [],
            setActiveOption: setActiveOptionSpy,
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
    TestBed.inject(AuthStore).reset();
    TestBed.inject(ItineraryStore).reset();
    TestBed.inject(ExpenseStore).reset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders day chapter, clean plan tabs without km, and diagonal split CTA buttons', async () => {
    const fixture = TestBed.createComponent(ItineraryPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.chapter-num')?.textContent?.trim()).toBe('Day 1');
    expect(host.querySelector('.day-chapter-title')?.textContent?.trim()).toBe('Asakusa Walk');

    const tabs = Array.from(host.querySelectorAll('.plan-bar .plan-pill')).map((el) =>
      el.textContent?.trim(),
    );
    expect(tabs).toEqual(['Plan A', 'Plan B']);
    expect(host.querySelector('.opt-km')).toBeNull();
    expect(host.querySelectorAll('.plan-bar .plan-actions .plan-icon-btn')).toHaveLength(2);
    expect(host.querySelector('.summary-meta .set-active-pill')).toBeNull();
    expect(host.querySelector('.summary-text')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '1 stops · 12.4 km',
    );
    expect(host.querySelector('.split-cta .add-plan-btn')?.textContent).toContain('Add Plan');
    expect(host.querySelector('.split-cta .add-item-btn')?.textContent).toContain('Add Item');
  });

  it('switches to Plan B preview, shows inline Set Active pill without banner, and activates on click', async () => {
    const fixture = TestBed.createComponent(ItineraryPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const planButtons = Array.from(
      host.querySelectorAll('.plan-bar .plan-pill'),
    ) as HTMLButtonElement[];
    planButtons[1].click();
    fixture.detectChanges();

    expect(host.querySelector('.activate-banner')).toBeNull();
    expect(host.querySelector('.summary-text')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '2 stops · ~18.4 km',
    );

    const setActiveBtn = host.querySelector('.summary-meta .set-active-pill') as HTMLButtonElement;
    expect(setActiveBtn).not.toBeNull();
    expect(setActiveBtn.textContent?.trim()).toBe('Set Active');

    setActiveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setActiveOptionSpy).toHaveBeenCalledWith('day-1', 'opt-b');
    expect(host.querySelector('.summary-meta .set-active-pill')).toBeNull();
  });

  it('opens Add Item and Add Plan modals from the split CTA bar', async () => {
    const fixture = TestBed.createComponent(ItineraryPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    const addItemBtn = host.querySelector('.split-cta .add-item-btn') as HTMLButtonElement;
    addItemBtn.click();
    fixture.detectChanges();

    const typeOptions = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.add-type-menu .add-type-option'),
    );
    expect(typeOptions).toHaveLength(6);

    const flightOption = typeOptions.find((btn) => btn.textContent?.includes('Flight'));
    expect(flightOption).toBeTruthy();
    flightOption!.click();
    fixture.detectChanges();

    expect(
      host.querySelector('app-item-form-modal [role="dialog"]')?.getAttribute('aria-label'),
    ).toBe('Add Flight');

    const closeItemBtn = host.querySelector('app-item-form-modal .close-btn') as HTMLButtonElement;
    closeItemBtn.click();
    fixture.detectChanges();

    const addPlanBtn = host.querySelector('.split-cta .add-plan-btn') as HTMLButtonElement;
    addPlanBtn.click();
    fixture.detectChanges();
    expect(
      host.querySelector('app-day-option-modals [role="dialog"]')?.getAttribute('aria-label'),
    ).toBe('Add Day Plan');
  });

  it('closes the Add Item type menu when scrolling past the close threshold', async () => {
    const fixture = TestBed.createComponent(ItineraryPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const addItemBtn = host.querySelector('.split-cta .add-item-btn') as HTMLButtonElement;
    addItemBtn.click();
    fixture.detectChanges();

    expect(document.querySelector('.add-type-menu')).not.toBeNull();

    const origScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    try {
      Object.defineProperty(window, 'scrollY', { value: 40, configurable: true });
      document.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    } finally {
      if (origScrollY) {
        Object.defineProperty(window, 'scrollY', origScrollY);
      } else {
        Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      }
    }

    expect(document.querySelector('.add-type-menu')).toBeNull();
  });
});
