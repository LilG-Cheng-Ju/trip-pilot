import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  findCountry,
  SUPPORTED_COUNTRIES,
  SUPPORTED_CURRENCIES,
} from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TripSummary } from '../../core/models/tripilot.models';
import { AppModalComponent } from '../../shared/modal.component';
import { AuthStore } from '../../state/auth.store';
import { TripListTab, TripStore } from '../../state/trip.store';

type DateEndMode = 'end' | 'duration' | 'open';

/** Multi-trip overview with Upcoming, Completed, soft-Archived tabs, and Modal creation. */
@Component({
  selector: 'app-trips-page',
  imports: [FormsModule, RouterLink, TranslatePipe, AppModalComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <h2 class="page-title">{{ 'trips.title' | t }}</h2>
        <button type="button" class="btn-primary" (click)="openCreateModal()">
          + {{ 'trips.new' | t }}
        </button>
      </header>

      <div class="tab-bar" role="tablist">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            role="tab"
            class="tab-pill"
            [class.active]="tripStore.activeTab() === tab.id"
            (click)="tripStore.setTab(tab.id)"
          >
            {{ tab.labelKey | t }}
          </button>
        }
      </div>

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
                  @if (daysUntil(trip) > 0) {
                    <span class="countdown-badge tabular-nums">
                      {{ 'trips.startsIn' | t: { count: daysUntil(trip) } }}
                    </span>
                  } @else if (daysUntil(trip) === 0) {
                    <span class="countdown-badge">{{ 'trips.startsToday' | t }}</span>
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
                  {{ 'nav.itinerary' | t }}
                </a>
                <a class="action-pill" [routerLink]="['/trips', trip.id, 'expenses']">
                  {{ 'common.expenses' | t }}
                </a>
                @if (trip.status === 'PLANNING' || trip.status === 'ACTIVE') {
                  <button
                    type="button"
                    class="action-pill"
                    (click)="tripStore.updateTripStatus(trip.id, 'COMPLETED')"
                  >
                    {{ 'trips.action.complete' | t }}
                  </button>
                  <button
                    type="button"
                    class="action-pill muted"
                    (click)="tripStore.updateTripStatus(trip.id, 'ARCHIVED')"
                  >
                    {{ 'trips.action.archive' | t }}
                  </button>
                } @else if (trip.status === 'COMPLETED') {
                  <button
                    type="button"
                    class="action-pill muted"
                    (click)="tripStore.updateTripStatus(trip.id, 'ARCHIVED')"
                  >
                    {{ 'trips.action.archive' | t }}
                  </button>
                } @else {
                  <button
                    type="button"
                    class="action-pill"
                    (click)="tripStore.updateTripStatus(trip.id, 'PLANNING')"
                  >
                    {{ 'trips.action.restore' | t }}
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
        <form class="modal-form" (ngSubmit)="submitTrip()" novalidate>
          <!-- Domestic vs. International segmented switch -->
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
              [(ngModel)]="title"
              name="title"
              (ngModelChange)="titleError.set(null)"
              [placeholder]="scope() === 'domestic' ? '台南週末小旅行' : 'Tokyo & Izu'"
            />
            @if (titleError()) {
              <small class="err-msg">{{ titleError()! | t }}</small>
            }
          </label>

          <label class="field">
            <span>{{ 'trips.form.destination' | t }}</span>
            <input
              type="text"
              [(ngModel)]="destination"
              name="destination"
              [placeholder]="scope() === 'domestic' ? '台南安平、中西區' : 'Tokyo, Atami'"
            />
          </label>

          @if (scope() === 'international') {
            <div class="two-col">
              <label class="field">
                <span>{{ 'trips.form.country' | t }} <em class="req">*</em></span>
                <select
                  [(ngModel)]="selectedCountry"
                  name="country"
                  (ngModelChange)="onCountryChange($event)"
                >
                  @for (c of countries; track c.code) {
                    <option [value]="c.code">
                      {{ i18n.locale() === 'zh-TW' ? c.nameZh : c.nameEn }} ({{ c.code }})
                    </option>
                  }
                </select>
              </label>

              <label class="field">
                <span>{{ 'trips.form.currency' | t }}</span>
                <select [(ngModel)]="defaultCurrency" name="currency">
                  @for (cur of currencies; track cur.code) {
                    <option [value]="cur.code">
                      {{ i18n.locale() === 'zh-TW' ? cur.labelZh : cur.labelEn }}
                    </option>
                  }
                </select>
              </label>
            </div>
          }

          <label class="field" [class.has-error]="dateError()">
            <span>{{ 'trips.form.startDate' | t }} <em class="req">*</em></span>
            <input
              type="date"
              [(ngModel)]="startDate"
              name="startDate"
              (ngModelChange)="dateError.set(null)"
            />
          </label>

          <!-- End Date / Duration / Open-Ended switch -->
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
                [(ngModel)]="endDate"
                name="endDate"
                (ngModelChange)="dateError.set(null)"
              />
            </label>
          } @else if (dateEndMode() === 'duration') {
            <label class="field">
              <span>{{ 'trips.form.durationDays' | t }}</span>
              <div class="stepper-row">
                <button
                  type="button"
                  class="step-btn"
                  (click)="durationDays = Math.max(1, durationDays - 1)"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  max="60"
                  class="tabular-nums step-input"
                  [(ngModel)]="durationDays"
                  name="durationDays"
                />
                <button
                  type="button"
                  class="step-btn"
                  (click)="durationDays = Math.min(60, durationDays + 1)"
                >
                  +
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
    .page {
      max-width: 1120px;
      margin: 0 auto;
      padding: var(--space-5) var(--space-4) calc(var(--nav-bottom-height) + var(--space-6));
    }
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .page-title {
      margin: 0;
      font-size: 1.375rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .btn-primary {
      padding: 10px 16px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-ghost {
      padding: 10px 16px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .tab-bar {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      margin-bottom: var(--space-5);
      background: var(--color-surface-muted);
      border-radius: var(--radius-pill);
    }
    .tab-pill {
      padding: 8px 16px;
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
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .days-badge {
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .countdown-badge {
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: #8b652d;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .card-link {
      text-decoration: none;
      color: inherit;
    }
    .trip-title {
      margin: 0 0 4px;
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .trip-dest {
      margin: 0 0 6px;
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }
    .trip-dates {
      margin: 0;
      font-size: 0.8125rem;
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
      padding: 6px 12px;
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
    .action-pill.muted {
      color: var(--color-text-muted);
    }
    .empty-card {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
    }
    .modal-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .seg-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
      padding: 4px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
    }
    .seg-row.compact {
      grid-template-columns: repeat(3, 1fr);
    }
    .seg-btn {
      padding: 8px 10px;
      border: none;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .seg-btn.active {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: var(--shadow-card);
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .field input,
    .field select {
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
    }
    .field.has-error input {
      border-color: var(--color-alert);
      background: var(--color-alert-soft);
    }
    .req {
      color: var(--color-alert);
      font-style: normal;
      font-weight: 700;
    }
    .err-msg {
      color: var(--color-alert);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .stepper-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step-btn {
      width: 36px;
      height: 36px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-primary);
      font-size: 1.1rem;
      font-weight: 700;
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
  protected readonly countries = SUPPORTED_COUNTRIES;
  protected readonly currencies = SUPPORTED_CURRENCIES;

  protected readonly showCreateModal = signal(false);
  protected readonly submitting = signal(false);
  protected readonly scope = signal<'domestic' | 'international'>('international');
  protected readonly dateEndMode = signal<DateEndMode>('duration');

  protected readonly titleError = signal<'trips.err.titleRequired' | null>(null);
  protected readonly dateError = signal<
    'trips.err.startRequired' | 'trips.err.endBeforeStart' | null
  >(null);

  protected readonly tabs: {
    id: TripListTab;
    labelKey: 'trips.tab.upcoming' | 'trips.tab.completed' | 'trips.tab.archived';
  }[] = [
    { id: 'upcoming', labelKey: 'trips.tab.upcoming' },
    { id: 'completed', labelKey: 'trips.tab.completed' },
    { id: 'archived', labelKey: 'trips.tab.archived' },
  ];

  protected title = '';
  protected destination = '';
  protected selectedCountry = 'JP';
  protected defaultCurrency = 'JPY';
  protected startDate = new Date().toISOString().slice(0, 10);
  protected endDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  protected durationDays = 4;

  protected readonly computedEndDate = computed(() => {
    if (!this.startDate) return '';
    const d = new Date(`${this.startDate}T00:00:00`);
    d.setDate(d.getDate() + Math.max(0, this.durationDays - 1));
    return d.toISOString().slice(0, 10);
  });

  ngOnInit(): void {
    void this.tripStore.loadTrips();
    if (!this.authStore.profile()) {
      void this.authStore.loadProfile();
    }
  }

  protected openCreateModal(): void {
    this.titleError.set(null);
    this.dateError.set(null);
    this.showCreateModal.set(true);
  }

  protected setScope(next: 'domestic' | 'international'): void {
    this.scope.set(next);
    if (next === 'domestic') {
      const home = this.authStore.profile();
      this.selectedCountry = home?.home_country_code || 'TW';
      this.defaultCurrency = home?.home_currency || 'TWD';
    } else if (this.selectedCountry === (this.authStore.profile()?.home_country_code || 'TW')) {
      this.selectedCountry = 'JP';
      this.defaultCurrency = 'JPY';
    }
  }

  protected onCountryChange(code: string): void {
    const match = findCountry(code);
    if (match) {
      this.defaultCurrency = match.defaultCurrency;
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
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  }

  protected daysUntil(trip: TripSummary): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(`${trip.start_date}T00:00:00`);
    return Math.round((start.getTime() - today.getTime()) / 86400000);
  }

  protected async submitTrip(): Promise<void> {
    this.titleError.set(null);
    this.dateError.set(null);

    let hasError = false;
    if (!this.title.trim()) {
      this.titleError.set('trips.err.titleRequired');
      hasError = true;
    }
    if (!this.startDate) {
      this.dateError.set('trips.err.startRequired');
      hasError = true;
    }

    let resolvedEndDate = this.startDate;
    if (this.dateEndMode() === 'end') {
      resolvedEndDate = this.endDate || this.startDate;
      if (this.startDate && resolvedEndDate < this.startDate) {
        this.dateError.set('trips.err.endBeforeStart');
        hasError = true;
      }
    } else if (this.dateEndMode() === 'duration') {
      const startObj = new Date(`${this.startDate}T00:00:00`);
      startObj.setDate(startObj.getDate() + Math.max(0, this.durationDays - 1));
      resolvedEndDate = startObj.toISOString().slice(0, 10);
    }

    if (hasError) {
      return;
    }

    const homeCountry = this.authStore.profile()?.home_country_code || 'TW';
    const homeCurrency = this.authStore.profile()?.home_currency || 'TWD';
    const countryCode =
      this.scope() === 'domestic' ? homeCountry : this.selectedCountry;
    const currencyCode =
      this.scope() === 'domestic' ? homeCurrency : this.defaultCurrency;

    this.submitting.set(true);
    try {
      const id = await this.tripStore.createTrip({
        title: this.title.trim(),
        destination_summary: this.destination.trim() || null,
        country_codes: [countryCode],
        start_date: this.startDate,
        end_date: resolvedEndDate,
        default_currency: currencyCode,
      });
      this.showCreateModal.set(false);
      this.title = '';
      this.destination = '';
      await this.router.navigate(['/trips', id]);
    } finally {
      this.submitting.set(false);
    }
  }
}
