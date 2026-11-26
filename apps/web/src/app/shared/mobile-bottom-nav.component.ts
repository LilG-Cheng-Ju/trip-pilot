import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TranslatePipe } from '../core/i18n/translate.pipe';
import { extractActiveTripIdFromUrl } from '../core/utils/trip-context.utils';

/** Context-aware thumb-zone navigation bar for mobile/tablet viewports (< 1024px). */
@Component({
  selector: 'app-mobile-bottom-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav
      class="mobile-bottom-nav"
      [class.trip-mode]="activeTripId() !== null"
      aria-label="Mobile navigation"
    >
      @if (activeTripId(); as tripId) {
        <a routerLink="/trips" class="bottom-item back-item">
          <span class="ms-icon" aria-hidden="true">arrow_back</span>
          <span>{{ 'nav.allTrips' | t }}</span>
        </a>
        <a
          [routerLink]="['/trips', tripId]"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          class="bottom-item"
        >
          <span class="ms-icon" aria-hidden="true">event_note</span>
          <span>{{ 'trip.tab.itinerary' | t }}</span>
        </a>
        <a
          [routerLink]="['/trips', tripId, 'brief']"
          routerLinkActive="active"
          class="bottom-item"
        >
          <span class="ms-icon" aria-hidden="true">summarize</span>
          <span>{{ 'trip.tab.brief' | t }}</span>
        </a>
        <a
          [routerLink]="['/trips', tripId, 'expenses']"
          routerLinkActive="active"
          class="bottom-item"
        >
          <span class="ms-icon" aria-hidden="true">payments</span>
          <span>{{ 'trip.tab.expenses' | t }}</span>
        </a>
      } @else {
        <a
          routerLink="/trips"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          class="bottom-item"
        >
          <span class="ms-icon" aria-hidden="true">luggage</span>
          <span>{{ 'nav.trips' | t }}</span>
        </a>
        <a routerLink="/stats" routerLinkActive="active" class="bottom-item">
          <span class="ms-icon" aria-hidden="true">bar_chart</span>
          <span>{{ 'nav.stats' | t }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }
    .mobile-bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      height: calc(var(--nav-bottom-height) + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(14px);
      border-top: 1px solid var(--color-border);
    }
    .mobile-bottom-nav.trip-mode {
      grid-template-columns: repeat(4, 1fr);
    }
    .bottom-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      text-decoration: none;
      color: var(--color-text-muted);
      font-size: 0.69rem;
      font-weight: 600;
      transition: color 140ms ease;
    }
    .bottom-item.active {
      color: var(--color-primary);
    }
    .trip-mode .bottom-item.active {
      box-shadow: inset 0 2px 0 var(--color-accent);
    }
    .back-item {
      color: var(--color-text-secondary);
      border-right: 1px solid var(--color-border-soft);
    }
    .back-item:hover {
      color: var(--color-primary);
    }
    @media (min-width: 1024px) {
      :host {
        display: none;
      }
    }
  `,
})
export class MobileBottomNavComponent {
  readonly currentUrl = input.required<string>();

  protected readonly activeTripId = computed(() =>
    extractActiveTripIdFromUrl(this.currentUrl()),
  );
}
