import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import {
  DEFAULT_TRIP_DURATION_DAYS,
  MAX_TRIP_DURATION_DAYS,
  MIN_TRIP_DURATION_DAYS,
  MS_PER_DAY,
  TRIP_COUNTDOWN_MAX_DAYS,
} from '../../core/constants/app-limits';
import {
  findCountry,
  SUPPORTED_CURRENCIES,
} from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TripSummary } from '../../core/models/tripilot.models';
import { isIncompleteNumberInput, readInputValue } from '../../core/utils/form-events.utils';
import {
  addDaysToIsoDate,
  formatLocalIsoDate,
} from '../../core/utils/travel-format.utils';
import { AppCountryPickerComponent } from '../../shared/country-picker.component';
import { AppModalComponent } from '../../shared/modal.component';
import { AuthStore } from '../../state/auth.store';
import { TripListTab, TripStore } from '../../state/trip.store';

type DateEndMode = 'end' | 'duration' | 'open';

/** Multi-trip overview with Upcoming & Completed (reversible) tabs and Modal creation. */
@Component({
  selector: 'app-trips-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslatePipe,
    AppModalComponent,
    AppCountryPickerComponent,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <h2 class="page-title">{{ 'trips.title' | t }}</h2>
        <button type="button" class="btn-primary" (click)="openCreateModal()">
          <span class="ms-icon sm" aria-hidden="true">add</span>
          <span>{{ 'trips.new' | t }}</span>
        </button>
      </header>

      <div class="tab-bar" role="tablist">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="tripStore.activeTab() === tab.id"
            class="tab-pill"
            [class.active]="tripStore.activeTab() === tab.id"
            (click)="tripStore.setTab(tab.id)"
          >
            {{ tab.labelKey | t }}
          </button>
        }
      </div>

      @if (tripStore.error(); as err) {
        <div class="error-banner" role="alert">
          <span>{{ err }}</span>
          <button
            type="button"
            class="error-dismiss"
            [attr.aria-label]="'common.close' | t"
            (click)="tripStore.clearError()"
          >
            <span class="ms-icon sm" aria-hidden="true">close</span>
          </button>
        </div>
      }

      @if (tripStore.loading()) {
        <p class="empty-card">{{ 'common.loading' | t }}</p>
      } @else if (tripStore.filteredTrips().length === 0) {
        <div class="empty-card">
          <p>{{ 'trips.empty' | t }}</p>
        </div>
      } @else {
        <div class="trip-grid">
          @for (trip of tripStore.filteredTrips(); track trip.id) {
            <article class="trip-card">
              <div class="card-top">
                <div class="badges">
                  @for (code of trip.country_codes; track code) {
                    <span class="country-badge">{{ countryLabel(code) }}</span>
                  }
                  <span class="days-badge tabular-nums">
                    {{ 'trips.daysCount' | t: { count: dayCount(trip) } }}
                  </span>
                </div>
                @if (trip.status === 'PLANNING' || trip.status === 'ACTIVE') {
                  @if (shouldShowCountdown(trip)) {
                    @if (daysUntil(trip) > 0) {
                      <span class="countdown-badge tabular-nums">
                        {{ 'trips.startsIn' | t: { count: daysUntil(trip) } }}
                      </span>
                    } @else if (daysUntil(trip) === 0) {
                      <span class="countdown-badge">{{ 'trips.startsToday' | t }}</span>
                    }
                  }
                }
              </div>

              <a
                class="card-link"
                [routerLink]="['/trips', trip.id]"
                (click)="tripStore.setLastSelectedTripId(trip.id)"
              >
                <h3 class="trip-title">{{ trip.title }}</h3>
                @if (trip.destination_summary) {
                  <p class="trip-dest">{{ trip.destination_summary }}</p>
                }
                <p class="trip-dates tabular-nums">{{ trip.start_date }} — {{ trip.end_date }}</p>
              </a>

              <div class="card-actions">
                <a class="action-pill primary" [routerLink]="['/trips', trip.id]">
                  <span class="ms-icon sm" aria-hidden="true">map</span>
                  <span>{{ 'nav.itinerary' | t }}</span>
                </a>
                <a class="action-pill" [routerLink]="['/trips', trip.id, 'expenses']">
                  <span class="ms-icon sm" aria-hidden="true">payments</span>
                  <span>{{ 'common.expenses' | t }}</span>
                </a>
                @if (trip.status === 'PLANNING' || trip.status === 'ACTIVE') {
                  <button
                    type="button"
                    class="action-pill"
                    (click)="tripStore.updateTripStatus(trip.id, 'COMPLETED')"
                  >
                    <span class="ms-icon sm" aria-hidden="true">check_circle</span>
                    <span>{{ 'trips.action.complete' | t }}</span>
                  </button>
                } @else {
                  <button
                    type="button"
                    class="action-pill alert"
                    (click)="tripStore.updateTripStatus(trip.id, 'PLANNING')"
                  >
                    <span class="ms-icon sm" aria-hidden="true">undo</span>
                    <span>{{ 'trips.action.undoComplete' | t }}</span>
                  </button>
                }
              </div>
            </article>
          }
        </div>
      }

      <app-modal
        [open]="showCreateModal()"
        [title]="'trips.new' | t"
        (closed)="showCreateModal.set(false)"
      >
        <form class="modal-form" (submit)="$event.preventDefault(); submitTrip()" novalidate>
          <div class="seg-row">
            <button
              type="button"
              class="seg-btn"
              [class.active]="scope() === 'domestic'"
              (click)="setScope('domestic')"
            >
              {{ 'trips.form.scopeDomestic' | t }}
            </button>
            <button
              type="button"
              class="seg-btn"
              [class.active]="scope() === 'international'"
              (click)="setScope('international')"
            >
              {{ 'trips.form.scopeInternational' | t }}
            </button>
          </div>

          <label class="field" [class.has-error]="titleError()">
            <span>{{ 'trips.form.title' | t }} <em class="req">*</em></span>
            <input
              type="text"
              [value]="title()"
              name="title"
              (input)="title.set(readInputValue($event)); titleError.set(null)"
              [placeholder]="scope() === 'domestic' ? '台南週末小旅行' : '捷克・奧地利 10 日'"
            />
            @if (titleError()) {
              <small class="err-msg">{{ titleError()! | t }}</small>
            }
          </label>

          <label class="field">
            <span>{{ 'trips.form.destination' | t }}</span>
            <input
              type="text"
              [value]="destination()"
              (input)="destination.set(readInputValue($event))"
              name="destination"
              [placeholder]="scope() === 'domestic' ? '台南安平、中西區' : '布拉格、CK 小鎮、維也納'"
            />
          </label>

          @if (scope() === 'international') {
            <div class="field" [class.has-error]="countryError()">
              <span>{{ 'trips.form.country' | t }} <em class="req">*</em></span>
              <app-country-picker
                [selectedCodes]="selectedCountries()"
                [multiple]="true"
                [placeholder]="i18n.locale() === 'zh-TW' ? '搜尋並選擇國家（可複選）' : 'Search and select countries'"
                (selectionChange)="onCountriesChange($event)"
              />
              <small class="field-hint">{{ 'trips.form.countryHint' | t }}</small>
              @if (countryError()) {
                <small class="err-msg">{{ 'trips.err.countryRequired' | t }}</small>
              }
            </div>

            <label class="field">
              <span>{{ 'trips.form.currency' | t }}</span>
              <select
                [value]="defaultCurrency()"
                (change)="defaultCurrency.set(readInputValue($event))"
                name="currency"
              >
                @for (cur of currencies; track cur.code) {
                  <option [value]="cur.code" [selected]="cur.code === defaultCurrency()">
                    {{ i18n.locale() === 'zh-TW' ? cur.labelZh : cur.labelEn }}
                  </option>
                }
              </select>
            </label>
          }

          <label class="field" [class.has-error]="dateError()">
            <span>{{ 'trips.form.startDate' | t }} <em class="req">*</em></span>
            <input
              type="date"
              [value]="startDate()"
              name="startDate"
              (input)="startDate.set(readInputValue($event)); dateError.set(null)"
            />
          </label>

          <div class="seg-row compact">
            <button
              type="button"
              class="seg-btn"
              [class.active]="dateEndMode() === 'end'"
              (click)="dateEndMode.set('end')"
            >
              {{ 'trips.form.dateModeEnd' | t }}
            </button>
            <button
              type="button"
              class="seg-btn"
              [class.active]="dateEndMode() === 'duration'"
              (click)="dateEndMode.set('duration')"
            >
              {{ 'trips.form.dateModeDuration' | t }}
            </button>
            <button
              type="button"
              class="seg-btn"
              [class.active]="dateEndMode() === 'open'"
              (click)="dateEndMode.set('open')"
            >
              {{ 'trips.form.dateModeOpen' | t }}
            </button>
          </div>

          @if (dateEndMode() === 'end') {
            <label class="field" [class.has-error]="dateError()">
              <span>{{ 'trips.form.endDate' | t }}</span>
              <input
                type="date"
                [value]="endDate()"
                name="endDate"
                (input)="endDate.set(readInputValue($event)); dateError.set(null)"
              />
            </label>
          } @else if (dateEndMode() === 'duration') {
            <label class="field">
              <span>{{ 'trips.form.durationDays' | t }}</span>
              <div class="stepper-row">
                <button
                  type="button"
                  class="step-btn"
                  (click)="durationDays.set(Math.max(minTripDurationDays, durationDays() - 1))"
                >
                  <span class="ms-icon sm">remove</span>
                </button>
                <input
                  type="number"
                  [min]="minTripDurationDays"
                  [max]="maxTripDurationDays"
                  class="tabular-nums step-input"
                  [value]="durationDays()"
                  (input)="onDurationDaysInput($event)"
                  (blur)="normalizeDurationDays($event)"
                  name="durationDays"
                />
                <button
                  type="button"
                  class="step-btn"
                  (click)="durationDays.set(Math.min(maxTripDurationDays, durationDays() + 1))"
                >
                  <span class="ms-icon sm">add</span>
                </button>
                <span class="computed-end tabular-nums">→ {{ computedEndDate() }}</span>
              </div>
            </label>
          } @else {
            <p class="open-hint">{{ 'trips.form.openHint' | t }}</p>
          }

          @if (dateError()) {
            <small class="err-msg">{{ dateError()! | t }}</small>
          }

          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="showCreateModal.set(false)">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="btn-primary" [disabled]="submitting()">
              {{ 'trips.form.create' | t }}
            </button>
          </div>
        </form>
      </app-modal>
    </div>
  `,
  styles: `
    .tab-bar {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      margin-bottom: var(--space-5);
      background: var(--color-surface-muted);
      border-radius: var(--radius-pill);
    }
    .tab-pill {
      padding: 8px 18px;
      border: none;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .tab-pill.active {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: var(--shadow-card);
    }
    .trip-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: var(--space-4);
    }
    .trip-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }
    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .country-badge {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: var(--text-badge);
      font-weight: 600;
    }
    .days-badge {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: var(--text-badge);
      font-weight: 500;
    }
    .countdown-badge {
      padding: 2px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
      font-size: var(--text-badge);
      font-weight: 600;
    }
    .card-link {
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-decoration: none;
      color: inherit;
    }
    .trip-title {
      margin: 2px 0 4px;
      font-family: var(--font-display);
      font-size: var(--text-card-hero);
      font-weight: 600;
      line-height: 1.28;
      letter-spacing: -0.015em;
      color: var(--color-text-primary);
    }
    .trip-dest {
      margin: 0;
      font-size: var(--text-card-meta);
      line-height: 1.45;
      color: var(--color-text-secondary);
    }
    .trip-dates {
      margin: 0;
      font-size: var(--text-card-meta);
      line-height: 1.45;
      color: var(--color-text-muted);
    }
    .card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border);
    }
    .action-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 7px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-primary);
      text-decoration: none;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .action-pill.primary {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .action-pill.alert {
      border-color: rgba(217, 107, 82, 0.45);
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    .action-pill.alert:hover {
      background: var(--color-alert);
      border-color: var(--color-alert);
      color: var(--color-text-on-primary);
    }
    .empty-card {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
    }
    .field-hint {
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--color-text-muted);
    }
    .stepper-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step-btn {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-primary);
      cursor: pointer;
    }
    .step-input {
      width: 72px;
      text-align: center;
    }
    .computed-end {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }
    .open-hint {
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.8125rem;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      padding-top: var(--space-2);
    }
  `,
})
export class TripsPageComponent implements OnInit {
  protected readonly tripStore = inject(TripStore);
  protected readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  protected readonly Math = Math;
  protected readonly readInputValue = readInputValue;
  protected readonly currencies = SUPPORTED_CURRENCIES;
  protected readonly minTripDurationDays = MIN_TRIP_DURATION_DAYS;
  protected readonly maxTripDurationDays = MAX_TRIP_DURATION_DAYS;

  protected readonly showCreateModal = signal(false);
  protected readonly submitting = signal(false);
  protected readonly scope = signal<'domestic' | 'international'>('international');
  protected readonly dateEndMode = signal<DateEndMode>('duration');
  protected readonly selectedCountries = signal<string[]>(['JP']);

  protected readonly titleError = signal<'trips.err.titleRequired' | null>(null);
  protected readonly countryError = signal(false);
  protected readonly dateError = signal<
    'trips.err.startRequired' | 'trips.err.endBeforeStart' | null
  >(null);

  protected readonly tabs: {
    id: TripListTab;
    labelKey: 'trips.tab.upcoming' | 'trips.tab.completed';
  }[] = [
    { id: 'upcoming', labelKey: 'trips.tab.upcoming' },
    { id: 'completed', labelKey: 'trips.tab.completed' },
  ];

  protected readonly title = signal('');
  protected readonly destination = signal('');
  protected readonly defaultCurrency = signal('JPY');
  protected readonly startDate = signal(formatLocalIsoDate());
  protected readonly endDate = signal(
    addDaysToIsoDate(formatLocalIsoDate(), DEFAULT_TRIP_DURATION_DAYS - 1),
  );
  protected readonly durationDays = signal(DEFAULT_TRIP_DURATION_DAYS);

  protected readonly computedEndDate = computed(() => {
    const start = this.startDate();
    if (!start) return '';
    return addDaysToIsoDate(start, Math.max(0, this.durationDays() - 1));
  });

  ngOnInit(): void {
    void this.tripStore.loadTrips();
    if (!this.authStore.profile()) {
      void this.authStore.loadProfile();
    }
  }

  protected openCreateModal(): void {
    this.titleError.set(null);
    this.countryError.set(false);
    this.dateError.set(null);
    this.showCreateModal.set(true);
  }

  protected setScope(next: 'domestic' | 'international'): void {
    this.scope.set(next);
    this.countryError.set(false);
    if (next === 'domestic') {
      const home = this.authStore.profile();
      this.defaultCurrency.set(home?.home_currency || 'TWD');
    } else if (this.selectedCountries().length === 0) {
      this.selectedCountries.set(['JP']);
      this.defaultCurrency.set('JPY');
    }
  }

  protected onCountriesChange(codes: string[]): void {
    this.selectedCountries.set(codes);
    this.countryError.set(false);
    const first = codes[0] ? findCountry(codes[0]) : undefined;
    if (first) {
      this.defaultCurrency.set(first.defaultCurrency);
    }
  }

  protected onDurationDaysInput(event: Event): void {
    if (isIncompleteNumberInput(event)) {
      return;
    }
    const raw = readInputValue(event);
    if (raw === '') {
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(
        this.minTripDurationDays,
        Math.min(this.maxTripDurationDays, Math.trunc(parsed)),
      );
      this.durationDays.set(clamped);
    }
  }

  protected normalizeDurationDays(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value === '') {
      input.value = String(this.durationDays());
    }
  }

  protected countryLabel(code: string): string {
    const c = findCountry(code);
    if (!c) return code;
    return this.i18n.locale() === 'zh-TW' ? c.nameZh : c.nameEn;
  }

  protected dayCount(trip: TripSummary): number {
    const start = new Date(`${trip.start_date}T00:00:00`);
    const end = new Date(`${trip.end_date}T00:00:00`);
    return Math.max(
      MIN_TRIP_DURATION_DAYS,
      Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1,
    );
  }

  protected daysUntil(trip: TripSummary): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(`${trip.start_date}T00:00:00`);
    return Math.round((start.getTime() - today.getTime()) / MS_PER_DAY);
  }

  protected shouldShowCountdown(trip: TripSummary): boolean {
    const days = this.daysUntil(trip);
    if (days < 0) return false;
    return TRIP_COUNTDOWN_MAX_DAYS === null || days <= TRIP_COUNTDOWN_MAX_DAYS;
  }

  protected async submitTrip(): Promise<void> {
    this.titleError.set(null);
    this.countryError.set(false);
    this.dateError.set(null);

    const title = this.title().trim();
    let hasError = false;
    if (!title) {
      this.titleError.set('trips.err.titleRequired');
      hasError = true;
    }
    if (this.scope() === 'international' && this.selectedCountries().length === 0) {
      this.countryError.set(true);
      hasError = true;
    }
    const start = this.startDate();
    if (!start) {
      this.dateError.set('trips.err.startRequired');
      hasError = true;
    }

    let resolvedEndDate = start;
    if (this.dateEndMode() === 'end') {
      resolvedEndDate = this.endDate() || start;
      if (start && resolvedEndDate < start) {
        this.dateError.set('trips.err.endBeforeStart');
        hasError = true;
      }
    } else if (this.dateEndMode() === 'duration') {
      resolvedEndDate = addDaysToIsoDate(start, Math.max(0, this.durationDays() - 1));
    }

    if (hasError) {
      return;
    }

    const homeCountry = this.authStore.profile()?.home_country_code || 'TW';
    const homeCurrency = this.authStore.profile()?.home_currency || 'TWD';
    const countryCodes =
      this.scope() === 'domestic' ? [homeCountry] : this.selectedCountries();
    const currencyCode =
      this.scope() === 'domestic' ? homeCurrency : this.defaultCurrency();

    this.submitting.set(true);
    try {
      const id = await this.tripStore.createTrip({
        title,
        destination_summary: this.destination().trim() || null,
        country_codes: countryCodes,
        start_date: start,
        end_date: resolvedEndDate,
        default_currency: currencyCode,
      });
      this.showCreateModal.set(false);
      this.title.set('');
      this.destination.set('');
      await this.router.navigate(['/trips', id]);
    } catch {
      // Error state is recorded on TripStore and surfaced in the error banner.
    } finally {
      this.submitting.set(false);
    }
  }
}
