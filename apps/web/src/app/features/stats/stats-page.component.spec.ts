import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TravelStats } from '../../core/models/tripilot.models';
import { StatsStore } from '../../state/stats.store';
import { StatsPageComponent } from './stats-page.component';

function makeStats(): TravelStats {
  return {
    year: 2026,
    scope: 'all',
    home_country_code: 'TW',
    home_currency: 'TWD',
    available_years: [2026, 2025],
    total_trips: 4,
    domestic_trips: 1,
    international_trips: 3,
    countries_visited: ['JP', 'TW'],
    country_visit_counts: { JP: 3, TW: 1 },
    total_travel_days: 18,
    flight_count: 6,
    total_flight_distance_km: 4250,
    total_ground_distance_km: 610,
    total_spend_home: '68500',
    avg_spend_per_day: '3806',
    spend_by_category: { FLIGHT: '28500', FOOD: '40000' },
    trips: [
      {
        id: 'trip-1',
        title: 'Tokyo Sakura',
        start_date: '2026-03-20',
        end_date: '2026-03-26',
        days: 7,
        country_codes: ['JP'],
        is_international: true,
        spend_home: '42000',
      },
    ],
  };
}

describe('StatsPageComponent', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(async () => {
    localStorage.clear();
    window.matchMedia = (() => ({
      matches: true,
    })) as unknown as typeof window.matchMedia;

    await TestBed.configureTestingModule({
      imports: [StatsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: TripilotApiService,
          useValue: {
            getStats: async () => makeStats(),
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
    TestBed.inject(StatsStore).reset();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    localStorage.clear();
  });

  it('renders 4 uniform paper KPI cards without highlight or panel icon boxes', async () => {
    const fixture = TestBed.createComponent(StatsPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.kpi-card').length).toBe(4);
    expect(host.querySelector('.kpi-card.highlight')).toBeNull();
    expect(host.querySelector('.panel-ico')).toBeNull();
    expect(host.querySelector('.count-pill')).toBeNull();

    const kpiValues = Array.from(host.querySelectorAll('.kpi-value')).map((el) =>
      el.textContent?.trim(),
    );
    expect(kpiValues).toEqual(['4', '18', '4,250 km', 'TWD 68,500']);
  });
});
