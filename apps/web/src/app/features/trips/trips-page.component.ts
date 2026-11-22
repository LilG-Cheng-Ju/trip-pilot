import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TripSummary } from '../../core/models/tripilot.models';
import { TripListTab, TripStore } from '../../state/trip.store';

/** Multi-trip overview with Upcoming, Completed, and soft-Archived tabs. */
@Component({
  selector: 'app-trips-page',
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h2 class="page-title">{{ 'trips.title' | t }}</h2>
        </div>
        <button type="button" class="btn-primary" (click)="showCreateForm.set(!showCreateForm())">
          {{ showCreateForm() ? ('common.close' | t) : ('+ ' + ('trips.new' | t)) }}
        </button>
      </header>

      @if (showCreateForm()) {
        <form class="create-card" (ngSubmit)="submitTrip()">
          <div class="form-grid">
            <label class="field">
              <span>{{ 'trips.form.title' | t }}</span>
              <input type="text" [(ngModel)]="title" name="title" placeholder="Tokyo & Izu" required />
            </label>
            <label class="field">
              <span>{{ 'trips.form.destination' | t }}</span>
              <input type="text" [(ngModel)]="destination" name="destination" placeholder="Tokyo, Atami" />
            </label>
            <label class="field">
              <span>{{ 'trips.form.countries' | t }}</span>
              <input type="text" [(ngModel)]="countriesInput" name="countries" placeholder="JP" />
            </label>
            <label class="field">
              <span>{{ 'trips.form.currency' | t }}</span>
              <input type="text" [(ngModel)]="defaultCurrency" name="currency" maxlength="3" placeholder="JPY" />
            </label>
            <label class="field">
              <span>{{ 'trips.form.startDate' | t }}</span>
              <input type="date" [(ngModel)]="startDate" name="startDate" required />
            </label>
            <label class="field">
              <span>{{ 'trips.form.endDate' | t }}</span>
              <input type="date" [(ngModel)]="endDate" name="endDate" required />
            </label>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="showCreateForm.set(false)">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="btn-primary" [disabled]="submitting()">
              {{ 'trips.form.create' | t }}
            </button>
          </div>
        </form>
      }

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
        <p class="empty-state">{{ 'common.loading' | t }}</p>
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
                    <span class="country-badge">{{ code }}</span>
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
    .create-card {
      margin-bottom: var(--space-5);
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
    .field input {
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-4);
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
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
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
    .empty-card,
    .empty-state {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
    }
  `,
})
export class TripsPageComponent implements OnInit {
  protected readonly tripStore = inject(TripStore);
  private readonly router = inject(Router);

  protected readonly showCreateForm = signal(false);
  protected readonly submitting = signal(false);

  protected readonly tabs: { id: TripListTab; labelKey: 'trips.tab.upcoming' | 'trips.tab.completed' | 'trips.tab.archived' }[] = [
    { id: 'upcoming', labelKey: 'trips.tab.upcoming' },
    { id: 'completed', labelKey: 'trips.tab.completed' },
    { id: 'archived', labelKey: 'trips.tab.archived' },
  ];

  protected title = '';
  protected destination = '';
  protected countriesInput = 'JP';
  protected defaultCurrency = 'JPY';
  protected startDate = new Date().toISOString().slice(0, 10);
  protected endDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  ngOnInit(): void {
    void this.tripStore.loadTrips();
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
    if (!this.title.trim() || !this.startDate || !this.endDate) {
      return;
    }
    this.submitting.set(true);
    try {
      const countryCodes = this.countriesInput
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2);
      const id = await this.tripStore.createTrip({
        title: this.title.trim(),
        destination_summary: this.destination.trim() || null,
        country_codes: countryCodes,
        start_date: this.startDate,
        end_date: this.endDate,
        default_currency: (this.defaultCurrency.trim() || 'JPY').toUpperCase(),
      });
      this.showCreateForm.set(false);
      this.title = '';
      this.destination = '';
      await this.router.navigate(['/trips', id]);
    } finally {
      this.submitting.set(false);
    }
  }
}
