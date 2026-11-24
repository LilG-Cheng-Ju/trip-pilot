import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TripDetail } from '../../core/models/tripilot.models';
import { AuthStore } from '../../state/auth.store';
import { TripStore } from '../../state/trip.store';
import { TripsPageComponent } from './trips-page.component';

function makeTripDetail(overrides?: Partial<TripDetail>): TripDetail {
  return {
    id: 'trip-1',
    title: 'Tokyo Spring',
    destination_summary: 'Tokyo & Hakone',
    country_codes: ['JP'],
    start_date: '2026-04-01',
    end_date: '2026-04-05',
    default_currency: 'JPY',
    cover_image_url: null,
    status: 'PLANNING',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    notes: 'Cherry blossom pass',
    days: [],
    ...overrides,
  };
}

describe('TripsPageComponent', () => {
  let updatePayloads: Array<{ tripId: string; payload: Record<string, unknown> }>;
  let deletedTripIds: string[];

  beforeEach(async () => {
    localStorage.clear();
    updatePayloads = [];
    deletedTripIds = [];

    await TestBed.configureTestingModule({
      imports: [TripsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: TripilotApiService,
          useValue: {
            getMe: async () => ({
              id: 'user-1',
              email: 'dev@tripilot.app',
              display_name: 'Traveler',
              home_country_code: 'TW',
              home_currency: 'TWD',
              created_at: '2026-01-01T00:00:00Z',
            }),
            listTrips: async () => [makeTripDetail()],
            getTrip: async () => makeTripDetail(),
            updateTrip: async (tripId: string, payload: Record<string, unknown>) => {
              updatePayloads.push({ tripId, payload });
              return makeTripDetail(payload as Partial<TripDetail>);
            },
            deleteTrip: async (tripId: string) => {
              deletedTripIds.push(tripId);
            },
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
    TestBed.inject(TripStore).reset();
    TestBed.inject(AuthStore).reset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('uses localized placeholders, exposes all 17 currencies, edits trips, and confirms deletion', async () => {
    const fixture = TestBed.createComponent(TripsPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    // Open Create Trip modal and verify localized EN placeholders + 17 currencies.
    const newTripBtn = host.querySelector('.page-header .btn-primary') as HTMLButtonElement;
    newTripBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const titleInput = host.querySelector('input[name="title"]') as HTMLInputElement;
    expect(titleInput.placeholder).toBe('e.g. 10 Days in Czechia & Austria');
    const currencySelect = host.querySelector('select[name="currency"]') as HTMLSelectElement;
    expect(currencySelect.options.length).toBe(17);

    // Close Create modal and open Edit modal for existing trip.
    const cancelBtn = host.querySelector('app-modal .btn-ghost') as HTMLButtonElement;
    cancelBtn.click();
    fixture.detectChanges();

    const editBtn = host.querySelector('.card-icon-btn[aria-label="Edit Trip"]') as HTMLButtonElement;
    editBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((host.querySelector('input[name="title"]') as HTMLInputElement).value).toBe(
      'Tokyo Spring',
    );
    expect((host.querySelector('textarea[name="notes"]') as HTMLTextAreaElement).value).toBe(
      'Cherry blossom pass',
    );

    const editTitle = host.querySelector('input[name="title"]') as HTMLInputElement;
    editTitle.value = 'Tokyo & Kamakura';
    editTitle.dispatchEvent(new Event('input'));
    const editStart = host.querySelector('input[name="startDate"]') as HTMLInputElement;
    editStart.value = '2026-04-02';
    editStart.dispatchEvent(new Event('input'));
    const editStatus = host.querySelector('select[name="status"]') as HTMLSelectElement;
    editStatus.value = 'ACTIVE';
    editStatus.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const saveBtn = host.querySelector('app-modal button[type="submit"]') as HTMLButtonElement;
    saveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toEqual({
      tripId: 'trip-1',
      payload: expect.objectContaining({
        title: 'Tokyo & Kamakura',
        start_date: '2026-04-02',
        status: 'ACTIVE',
        default_currency: 'JPY',
        notes: 'Cherry blossom pass',
      }),
    });

    // Trigger Delete Trip confirm modal.
    const deleteBtn = host.querySelector('.card-icon-btn[aria-label="Delete"]') as HTMLButtonElement;
    deleteBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const confirmBtn = host.querySelector('app-confirm-modal .btn-danger') as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(deletedTripIds).toEqual(['trip-1']);
  });
});
