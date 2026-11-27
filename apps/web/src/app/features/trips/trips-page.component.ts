import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { OfflineCacheService } from '../../core/cache/offline-cache.service';
import {
  MIN_TRIP_DURATION_DAYS,
  MS_PER_DAY,
  TRIP_COUNTDOWN_MAX_DAYS,
} from '../../core/constants/app-limits';
import { findCountry } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TripDetail, TripSummary } from '../../core/models/tripilot.models';
import { NetworkStatusService } from '../../core/network/network-status.service';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { AuthStore } from '../../state/auth.store';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';
import { TripListTab, TripStore } from '../../state/trip.store';
import { TripFormModalComponent, TripFormSubmitEvent } from './trip-form-modal.component';

/** Multi-trip overview with Upcoming & Completed (reversible) tabs and full CRUD modals. */
@Component({
  selector: 'app-trips-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslatePipe,
    AppConfirmModalComponent,
    TripFormModalComponent,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <h2 class="page-title font-display">{{ 'trips.title' | t }}</h2>
        <button
          type="button"
          class="btn-primary"
          [disabled]="isOfflineReadOnly()"
          [title]="isOfflineReadOnly() ? ('sync.offlineReadOnly' | t) : ''"
          (click)="openCreateModal()"
        >
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
        <p class="empty-state">{{ 'common.loading' | t }}</p>
      } @else if (tripStore.filteredTrips().length === 0) {
        @if (tripStore.trips().length === 0 && tripStore.activeTab() === 'upcoming') {
          <section class="onboarding-card">
            <h3 class="onboarding-title font-display">{{ 'trips.onboarding.title' | t }}</h3>
            <p class="onboarding-sub">{{ 'trips.onboarding.subtitle' | t }}</p>
            <ol class="onboarding-steps">
              <li>
                <span class="step-idx font-mono tabular-nums">01</span>
                <span>{{ 'trips.onboarding.step1' | t }}</span>
              </li>
              <li>
                <span class="step-idx font-mono tabular-nums">02</span>
                <span>{{ 'trips.onboarding.step2' | t }}</span>
              </li>
              <li>
                <span class="step-idx font-mono tabular-nums">03</span>
                <span>{{ 'trips.onboarding.step3' | t }}</span>
              </li>
            </ol>
            <div class="onboarding-actions">
              <button
                type="button"
                class="btn-primary"
                [disabled]="isOfflineReadOnly()"
                [title]="isOfflineReadOnly() ? ('sync.offlineReadOnly' | t) : ''"
                (click)="openCreateModal()"
              >
                <span class="ms-icon sm" aria-hidden="true">add</span>
                <span>{{ 'trips.new' | t }}</span>
              </button>
              <a routerLink="/profile" class="pill-btn">
                <span class="ms-icon sm" aria-hidden="true">settings</span>
                <span>{{ 'trips.onboarding.settingsLink' | t }}</span>
              </a>
            </div>
          </section>
        } @else {
          <div class="empty-state">
            <p>{{ 'trips.empty' | t }}</p>
          </div>
        }
      } @else {
        <div class="trip-grid">
          @for (trip of tripStore.filteredTrips(); track trip.id) {
            <article
              class="trip-card"
              tabindex="0"
              (click)="openTrip(trip)"
              (keydown.enter)="onCardEnter($event, trip)"
            >
              <div class="card-top">
                <div class="card-meta-line">
                  @if (countrySummary(trip); as countries) {
                    <span>{{ countries }}</span>
                    <span class="meta-sep" aria-hidden="true">·</span>
                  }
                  <span class="tabular-nums">
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
                tabindex="-1"
                (click)="$event.stopPropagation(); tripStore.setLastSelectedTripId(trip.id)"
              >
                <h3 class="trip-title">{{ trip.title }}</h3>
                @if (trip.destination_summary) {
                  <p class="trip-dest">{{ trip.destination_summary }}</p>
                }
                <p class="trip-dates tabular-nums">{{ trip.start_date }} — {{ trip.end_date }}</p>
              </a>

              <div class="card-actions" (click)="$event.stopPropagation()">
                <a
                  class="card-ghost-action"
                  [routerLink]="['/trips', trip.id, 'brief']"
                  (click)="$event.stopPropagation(); tripStore.setLastSelectedTripId(trip.id)"
                >
                  <span class="ms-icon sm" aria-hidden="true">summarize</span>
                  <span>{{ 'trip.tab.brief' | t }}</span>
                </a>
                <a
                  class="card-ghost-action"
                  [routerLink]="['/trips', trip.id, 'expenses']"
                  (click)="$event.stopPropagation(); tripStore.setLastSelectedTripId(trip.id)"
                >
                  <span class="ms-icon sm" aria-hidden="true">payments</span>
                  <span>{{ 'common.expenses' | t }}</span>
                </a>
                @if (trip.status === 'PLANNING' || trip.status === 'ACTIVE') {
                  <button
                    type="button"
                    class="card-ghost-action"
                    [disabled]="isOfflineReadOnly()"
                    [title]="isOfflineReadOnly() ? ('sync.offlineReadOnly' | t) : ''"
                    (click)="$event.stopPropagation(); tripStore.updateTripStatus(trip.id, 'COMPLETED')"
                  >
                    <span class="ms-icon sm" aria-hidden="true">check_circle</span>
                    <span>{{ 'trips.action.complete' | t }}</span>
                  </button>
                } @else {
                  <button
                    type="button"
                    class="card-ghost-action alert"
                    [disabled]="isOfflineReadOnly()"
                    [title]="isOfflineReadOnly() ? ('sync.offlineReadOnly' | t) : ''"
                    (click)="$event.stopPropagation(); tripStore.updateTripStatus(trip.id, 'PLANNING')"
                  >
                    <span class="ms-icon sm" aria-hidden="true">undo</span>
                    <span>{{ 'trips.action.undoComplete' | t }}</span>
                  </button>
                }
                <div class="card-util-actions">
                  <button
                    type="button"
                    class="icon-btn card-icon-btn"
                    [disabled]="isOfflineReadOnly()"
                    [title]="isOfflineReadOnly() ? ('sync.offlineReadOnly' | t) : ('trips.edit' | t)"
                    [attr.aria-label]="'trips.edit' | t"
                    (click)="$event.stopPropagation(); openEditModal(trip)"
                  >
                    <span class="ms-icon sm" aria-hidden="true">edit</span>
                  </button>
                  <button
                    type="button"
                    class="icon-btn icon-btn--danger card-icon-btn"
                    [disabled]="isOfflineReadOnly()"
                    [title]="isOfflineReadOnly() ? ('sync.offlineReadOnly' | t) : ('common.delete' | t)"
                    [attr.aria-label]="'common.delete' | t"
                    (click)="$event.stopPropagation(); pendingDeleteTrip.set(trip)"
                  >
                    <span class="ms-icon sm" aria-hidden="true">delete</span>
                  </button>
                </div>
              </div>
            </article>
          }
        </div>
      }

      <app-trip-form-modal
        [open]="showTripModal()"
        [editingTrip]="editingTrip()"
        [initialNotes]="editingInitialNotes()"
        [notesReady]="editingNotesReady()"
        [homeCountryCode]="authStore.profile()?.home_country_code || 'TW'"
        [homeCurrency]="authStore.profile()?.home_currency || 'TWD'"
        [submitting]="submitting()"
        (closed)="closeTripModal()"
        (submitted)="handleTripSubmitted($event)"
      />

      <app-confirm-modal
        [open]="pendingDeleteTrip() !== null"
        [title]="'confirm.deleteTripTitle' | t"
        [message]="
          pendingDeleteTrip()
            ? ('confirm.deleteTripBody' | t: { name: pendingDeleteTrip()!.title })
            : ''
        "
        [busy]="deletingTrip()"
        (confirmed)="executeDeleteTrip()"
        (cancelled)="pendingDeleteTrip.set(null)"
      />
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
    .onboarding-card {
      max-width: 620px;
      padding: var(--space-5);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }
    .onboarding-title {
      margin: 0 0 6px;
      font-size: 1.25rem;
      color: var(--color-primary);
    }
    .onboarding-sub {
      margin: 0 0 var(--space-4);
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }
    .onboarding-steps {
      list-style: none;
      margin: 0 0 var(--space-5);
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .onboarding-steps li {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-size: 0.86rem;
      line-height: 1.5;
      color: var(--color-text-primary);
    }
    .step-idx {
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--color-accent-ink);
    }
    .onboarding-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
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
      cursor: pointer;
      transition: border-color 140ms ease;
    }
    .trip-card:hover {
      border-color: var(--color-border-strong);
    }
    .trip-card:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .card-meta-line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      min-width: 0;
      font-size: var(--text-badge);
      font-weight: 600;
      color: var(--color-text-secondary);
      letter-spacing: 0.02em;
    }
    .meta-sep {
      color: var(--color-text-muted);
      font-weight: 600;
      user-select: none;
    }
    .countdown-badge {
      padding: 2px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-tint);
      color: var(--color-accent-ink);
      font-size: var(--text-badge);
      font-weight: 600;
      flex-shrink: 0;
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
      font-size: 1.16rem;
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
      align-items: center;
      gap: 4px;
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border-soft);
    }
    .card-util-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin-left: auto;
    }
    .card-ghost-action {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      min-height: 30px;
      padding: 4px 5px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-text-secondary);
      text-decoration: none;
      font: inherit;
      font-size: 0.74rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 140ms ease, color 140ms ease;
    }
    .card-ghost-action:first-child {
      margin-left: -5px;
    }
    .card-ghost-action:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .card-ghost-action:hover:not(:disabled),
    .card-ghost-action:focus-visible:not(:disabled) {
      background: rgba(20, 24, 31, 0.06);
      color: var(--color-primary);
    }
    .card-ghost-action.alert {
      color: var(--color-alert);
    }
    .card-ghost-action.alert:hover,
    .card-ghost-action.alert:focus-visible {
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    @media (min-width: 640px) {
      .trip-title {
        font-size: var(--text-card-hero);
      }
      .card-ghost-action {
        gap: 4px;
        min-height: 32px;
        padding: 4px 7px;
        font-size: 0.78rem;
      }
      .card-ghost-action:first-child {
        margin-left: -7px;
      }
    }
  `,
})
export class TripsPageComponent implements OnInit {
  protected readonly tripStore = inject(TripStore);
  protected readonly authStore = inject(AuthStore);
  private readonly i18n = inject(I18nService);
  private readonly network = inject(NetworkStatusService);
  private readonly api = inject(TripilotApiService);
  private readonly cache = inject(OfflineCacheService);
  private readonly itineraryStore = inject(ItineraryStore);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly router = inject(Router);

  protected readonly isOfflineReadOnly = computed(
    () => !this.network.isOnline() || this.tripStore.usingOfflineCache(),
  );

  protected readonly showTripModal = signal(false);
  protected readonly editingTrip = signal<TripSummary | null>(null);
  protected readonly editingInitialNotes = signal('');
  protected readonly editingNotesReady = signal(true);
  protected readonly pendingDeleteTrip = signal<TripSummary | null>(null);
  protected readonly deletingTrip = signal(false);
  protected readonly submitting = signal(false);

  protected readonly tabs: {
    id: TripListTab;
    labelKey: 'trips.tab.upcoming' | 'trips.tab.completed';
  }[] = [
    { id: 'upcoming', labelKey: 'trips.tab.upcoming' },
    { id: 'completed', labelKey: 'trips.tab.completed' },
  ];

  ngOnInit(): void {
    void this.tripStore.loadTrips();
    if (!this.authStore.profile()) {
      void this.authStore.loadProfile();
    }
  }

  protected openCreateModal(): void {
    if (this.isOfflineReadOnly()) {
      return;
    }
    this.editingTrip.set(null);
    this.editingInitialNotes.set('');
    this.editingNotesReady.set(true);
    this.showTripModal.set(true);
  }

  protected openEditModal(trip: TripSummary): void {
    const activeDetail =
      this.itineraryStore.trip()?.id === trip.id
        ? this.itineraryStore.trip()
        : this.cache.get<TripDetail>(`trip.${trip.id}`);
    this.editingTrip.set(trip);
    this.editingInitialNotes.set(activeDetail?.notes ?? '');
    this.editingNotesReady.set(Boolean(activeDetail));
    this.showTripModal.set(true);

    if (!activeDetail) {
      void this.loadEditingTripNotes(trip.id);
    }
  }

  protected closeTripModal(): void {
    this.showTripModal.set(false);
    this.editingTrip.set(null);
  }

  private async loadEditingTripNotes(tripId: string): Promise<void> {
    try {
      const detail = await this.api.getTrip(tripId);
      this.cache.set(`trip.${tripId}`, detail);
      if (this.showTripModal() && this.editingTrip()?.id === tripId) {
        this.editingInitialNotes.set(detail.notes ?? '');
        this.editingNotesReady.set(true);
      }
    } catch {
      // Keep notesReady false when offline so saving preserves existing server notes.
    }
  }

  protected async handleTripSubmitted(event: TripFormSubmitEvent): Promise<void> {
    this.submitting.set(true);
    try {
      if (event.mode === 'edit') {
        const updated = await this.tripStore.updateTrip(event.tripId, event.payload);
        this.itineraryStore.applyTripUpdate(updated);
        this.closeTripModal();
      } else {
        const id = await this.tripStore.createTrip(event.payload);
        this.closeTripModal();
        await this.router.navigate(['/trips', id]);
      }
    } catch {
      // Error state is recorded on TripStore and surfaced in the error banner.
    } finally {
      this.submitting.set(false);
    }
  }

  protected async executeDeleteTrip(): Promise<void> {
    const target = this.pendingDeleteTrip();
    if (!target) {
      return;
    }
    this.deletingTrip.set(true);
    try {
      await this.tripStore.deleteTrip(target.id);
      if (this.itineraryStore.trip()?.id === target.id) {
        this.itineraryStore.reset();
      }
      if (this.expenseStore.summary()?.trip_id === target.id) {
        this.expenseStore.reset();
      }
      this.pendingDeleteTrip.set(null);
    } catch {
      // Error state is recorded on TripStore and surfaced in the error banner.
      this.pendingDeleteTrip.set(null);
    } finally {
      this.deletingTrip.set(false);
    }
  }

  protected countryLabel(code: string): string {
    const c = findCountry(code);
    if (!c) return code;
    return this.i18n.locale() === 'zh-TW' ? c.nameZh : c.nameEn;
  }

  protected countrySummary(trip: TripSummary): string {
    return trip.country_codes.map((code) => this.countryLabel(code)).join(', ');
  }

  protected openTrip(trip: TripSummary): void {
    this.tripStore.setLastSelectedTripId(trip.id);
    void this.router.navigate(['/trips', trip.id]);
  }

  protected onCardEnter(event: Event, trip: TripSummary): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    this.openTrip(trip);
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
}
