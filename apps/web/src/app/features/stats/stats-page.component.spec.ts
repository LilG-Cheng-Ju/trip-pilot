import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { StatsScope, TravelStats } from '../../core/models/tripilot.models';
import { StatsStore } from '../../state/stats.store';
import { StatsPageComponent } from './stats-page.component';

function makeStats(year: number | null = null, scope: StatsScope = 'all'): TravelStats {
  if (scope === 'domestic') {
    return {
      year,
      scope: 'domestic',
      home_country_code: 'TW',
      home_currency: 'TWD',
      available_years: [2026, 2025],
      total_trips: 2,
      domestic_trips: 2,
      international_trips: 0,
      countries_visited: ['TW'],
      country_visit_counts: { TW: 2 },
      total_travel_days: 6,
      flight_count: 2,
      total_flight_distance_km: 290,
      total_ground_distance_km: 420,
      total_spend_home: '18500',
      avg_spend_per_day: '3083',
      spend_by_category: { TRANSIT: '6500', FOOD: '12000' },
      trips: [
        {
          id: 'trip-dom-1',
          title: 'Green Island Dive',
          start_date: '2026-05-10',
          end_date: '2026-05-13',
          days: 4,
          country_codes: ['TW'],
          is_international: false,
          spend_home: '12500',
        },
        {
          id: 'trip-dom-2',
          title: 'Tainan Weekend',
          start_date: '2026-10-03',
          end_date: '2026-10-04',
          days: 2,
          country_codes: ['TW'],
          is_international: false,
          spend_home: '6000',
        },
      ],
    };
  }

  return {
    year,
    scope,
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
    flight_routes: [
      {
        origin_iata: 'TPE',
        dest_iata: 'KIX',
        origin_country_code: 'TW',
        dest_country_code: 'JP',
        origin_lat: 25.0777,
        origin_lng: 121.233,
        dest_lat: 34.4273,
        dest_lng: 135.244,
        count: 2,
      },
    ],
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
  let getStatsSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.clear();
    window.matchMedia = (() => ({
      matches: true,
    })) as unknown as typeof window.matchMedia;

    getStatsSpy = vi.fn(async (year: number | null, scope: StatsScope) => makeStats(year, scope));

    await TestBed.configureTestingModule({
      imports: [StatsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: TripilotApiService,
          useValue: {
            getStats: getStatsSpy,
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

  it('defaults to All Time via MatSelect year dropdown and renders unified logbook ledger', async () => {
    const fixture = TestBed.createComponent(StatsPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getStatsSpy).toHaveBeenCalledWith(null, 'all');

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.year-select-field mat-select')).not.toBeNull();
    expect(host.querySelectorAll('.segmented').length).toBe(1);
    expect(host.querySelector('.logbook-hero')).not.toBeNull();
    expect(host.querySelectorAll('.logbook-metric-row').length).toBe(4);
    expect(host.querySelectorAll('.kpi-card').length).toBe(0);
    expect(host.querySelector('.countries-panel')).not.toBeNull();
    expect(host.querySelector('.footprint-panel')).toBeNull();

    const modeLabels = Array.from(host.querySelectorAll('.mode-label')).map((el) =>
      el.textContent?.trim(),
    );
    expect(modeLabels).toEqual(['Air', 'Ground']);

    const kpiValues = Array.from(host.querySelectorAll('.kpi-value')).map((el) =>
      el.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(kpiValues).toEqual(['4,860 km', '4', '18', '2', 'TWD 68,500']);

    const firstTrip = host.querySelector('.trip-row');
    expect(firstTrip?.querySelector('.scope-tag')?.textContent?.trim()).toBe('International');
    expect(firstTrip?.querySelector('.trip-loc')?.textContent?.trim()).toBe('Japan');
    expect(firstTrip?.querySelector('.trip-dates')?.textContent?.trim()).toBe('2026.03.20 – 03.26');
    expect(firstTrip?.querySelector('.trip-spend')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'TWD 42,000',
    );
    expect(firstTrip?.querySelector('.chevron')).toBeNull();

    expect(host.querySelectorAll('.hero-geo-arc').length).toBe(1);
    expect(host.querySelector('.hero-ruler')).toBeNull();
    const geoLabels = Array.from(host.querySelectorAll('.hero-geo-label')).map((el) =>
      el.textContent?.trim(),
    );
    expect(geoLabels).toContain('TPE');
    expect(geoLabels).toContain('KIX');
  });

  it('draws only real flight routes without fabricating arcs for overland countries', async () => {
    getStatsSpy.mockResolvedValueOnce({
      ...makeStats(2026, 'international'),
      countries_visited: ['AT', 'CZ', 'TW'],
      country_visit_counts: { CZ: 1, AT: 1, TW: 1 },
      flight_routes: [
        {
          origin_iata: 'TPE',
          dest_iata: 'PRG',
          origin_country_code: 'TW',
          dest_country_code: 'CZ',
          origin_lat: 25.0777,
          origin_lng: 121.233,
          dest_lat: 50.1008,
          dest_lng: 14.26,
          count: 2,
        },
        {
          origin_iata: 'TPE',
          dest_iata: 'KIX',
          origin_country_code: 'TW',
          dest_country_code: 'JP',
          origin_lat: 25.0777,
          origin_lng: 121.233,
          dest_lat: 34.4273,
          dest_lng: 135.244,
          count: 1,
        },
      ],
    });

    const fixture = TestBed.createComponent(StatsPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.hero-geo-land path').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('.hero-geo-arc').length).toBe(2);

    const labels = Array.from(host.querySelectorAll<SVGTextElement>('.hero-geo-label')).map(
      (el) => ({
        code: el.textContent?.trim(),
        y: Number(el.getAttribute('y')),
      }),
    );
    expect(labels.map((l) => l.code)).toEqual(expect.arrayContaining(['TPE', 'PRG', 'KIX']));
    expect(labels.map((l) => l.code)).not.toContain('AT');

    // TPE home label must sit below the home dot (away from northern arcs).
    const homeCircle = host.querySelector<SVGCircleElement>('.hero-geo-home');
    const homeCy = Number(homeCircle?.getAttribute('cy'));
    const tpeLabel = labels.find((l) => l.code === 'TPE');
    expect(tpeLabel!.y).toBeGreaterThan(homeCy);

    // Eurasia routes must fill over half of the 420-unit panoramic viewBox instead of squeezing center.
    const xs = Array.from(
      host.querySelectorAll<SVGCircleElement>('.hero-geo-home, .hero-geo-node'),
    ).map((el) => Number(el.getAttribute('cx')));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(210);
  });

  it('adapts Domestic scope to ground-first total distance, longest trip, and 12-month cadence', async () => {
    const fixture = TestBed.createComponent(StatsPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const store = TestBed.inject(StatsStore);
    await store.loadStats(2026, 'domestic');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const modeLabels = Array.from(host.querySelectorAll('.mode-label')).map((el) =>
      el.textContent?.trim(),
    );
    expect(modeLabels).toEqual(['Ground', 'Air']);

    const kpiValues = Array.from(host.querySelectorAll('.kpi-value')).map((el) =>
      el.textContent?.replace(/\s+/g, ' ').trim(),
    );
    // 420 km ground + 290 km island flight = 710 km; longest trip = 4 days (Green Island Dive)
    expect(kpiValues).toEqual(['710 km', '2', '6', '4 days', 'TWD 18,500']);

    expect(host.querySelector('.countries-panel')).toBeNull();
    expect(host.querySelector('.footprint-panel')).not.toBeNull();
    expect(host.querySelectorAll('.month-col.active').length).toBe(2);

    const domTrip = host.querySelector('.trip-row');
    expect(domTrip?.querySelector('.scope-tag')).toBeNull();
    expect(domTrip?.querySelector('.trip-loc')?.textContent?.trim()).toBe('Taiwan');

    expect(host.querySelectorAll('.hero-geo-arc').length).toBe(0);
    expect(host.querySelector('.hero-ruler')).not.toBeNull();
  });
});
