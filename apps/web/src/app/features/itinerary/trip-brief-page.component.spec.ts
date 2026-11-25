import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TripDetail } from '../../core/models/tripilot.models';
import { ItineraryStore } from '../../state/itinerary.store';
import { TripBriefPageComponent } from './trip-brief-page.component';

function makeBriefTrip(): TripDetail {
  return {
    id: 'trip-brief-1',
    title: 'Tokyo Solo',
    destination_summary: 'Tokyo & Kawazu',
    country_codes: ['JP'],
    start_date: '2026-03-01',
    end_date: '2026-03-03',
    default_currency: 'JPY',
    cover_image_url: null,
    status: 'PLANNING',
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    notes: null,
    days: [
      {
        id: 'day-1',
        trip_id: 'trip-brief-1',
        day_index: 1,
        date: '2026-03-01',
        title: 'Arrival',
        notes: null,
        active_option_id: 'opt-1',
        options: [
          {
            id: 'opt-1',
            trip_day_id: 'day-1',
            label: 'Plan A',
            sort_order: 0,
            summary_notes: null,
            cached_ground_distance_km: 0,
            cached_distance_is_approx: false,
            route_segments: [],
            items: [
              {
                id: 'flt-1',
                day_option_id: 'opt-1',
                sort_order: 0,
                choice_group_id: null,
                is_selected: true,
                type: 'FLIGHT',
                title: 'JX802',
                address: null,
                latitude: null,
                longitude: null,
                google_maps_url: null,
                start_time: '08:30',
                end_time: '12:45',
                timezone: null,
                notes: null,
                details: {
                  origin_iata: 'TPE',
                  dest_iata: 'NRT',
                  flight_number: 'JX802',
                  booking_ref: 'BR9912',
                },
              },
              {
                id: 'stay-1',
                day_option_id: 'opt-1',
                sort_order: 1,
                choice_group_id: null,
                is_selected: true,
                type: 'STAY',
                title: 'Asakusa View Hotel',
                address: 'Tokyo',
                latitude: null,
                longitude: null,
                google_maps_url: null,
                start_time: '15:00',
                end_time: null,
                timezone: null,
                notes: null,
                details: { confirmation_code: 'CONF778' },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('TripBriefPageComponent', () => {
  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [TripBriefPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ tripId: 'trip-brief-1' }) },
          },
        },
        {
          provide: TripilotApiService,
          useValue: {
            getTrip: async () => makeBriefTrip(),
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
    TestBed.inject(ItineraryStore).reset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders editorial hairline dossier sections without icon boxes or nested brief cards', async () => {
    const fixture = TestBed.createComponent(TripBriefPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.brief-section').length).toBe(4);
    expect(host.querySelector('.section-ico')).toBeNull();
    expect(host.querySelector('.count-badge')).toBeNull();
    expect(host.querySelector('.brief-card')).toBeNull();
    expect(host.querySelector('.dossier-row')).not.toBeNull();
    expect(host.textContent).toContain('Asakusa View Hotel');
    expect(host.textContent).toContain('CONF778');
    expect(host.textContent).toContain('BR9912');
  });
});
