import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Unified header and 3-tab workspace switcher shared across Itinerary, Brief, and Expenses. */
@Component({
  selector: 'app-trip-subnav',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <header class="trip-header">
      <div class="header-top">
        <div class="header-left">
          <a routerLink="/trips" class="back-btn" [attr.aria-label]="'common.back' | t">
            <span class="ms-icon sm" aria-hidden="true">arrow_back</span>
          </a>
          <div class="title-block">
            <h2 class="trip-name">{{ title() }}</h2>
            @if (dateRange()) {
              <p class="trip-range tabular-nums">{{ dateRange() }}</p>
            }
          </div>
        </div>

        <div class="header-utilities">
          <ng-content />
        </div>
      </div>

      <nav class="workspace-tabs" aria-label="Trip sections">
        <a
          class="ws-tab"
          [routerLink]="['/trips', tripId()]"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
        >
          <span class="ms-icon sm" aria-hidden="true">event_note</span>
          <span>{{ 'trip.tab.itinerary' | t }}</span>
        </a>
        <a
          class="ws-tab"
          [routerLink]="['/trips', tripId(), 'brief']"
          routerLinkActive="active"
        >
          <span class="ms-icon sm" aria-hidden="true">summarize</span>
          <span>{{ 'trip.tab.brief' | t }}</span>
        </a>
        <a
          class="ws-tab"
          [routerLink]="['/trips', tripId(), 'expenses']"
          routerLinkActive="active"
        >
          <span class="ms-icon sm" aria-hidden="true">payments</span>
          <span>{{ 'trip.tab.expenses' | t }}</span>
        </a>
      </nav>
    </header>
  `,
  styles: `
    .trip-header {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 7px;
    }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .back-btn {
      position: relative;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-primary);
      text-decoration: none;
      flex-shrink: 0;
    }
    .back-btn::after {
      content: '';
      position: absolute;
      inset: -5px;
    }
    .back-btn:hover {
      border-color: var(--color-primary);
    }
    .title-block {
      min-width: 0;
    }
    .trip-name {
      margin: 0;
      font-size: 1.02rem;
      line-height: 1.22;
      font-weight: 600;
      color: var(--color-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .trip-range {
      margin: 1px 0 0;
      font-size: 0.72rem;
      line-height: 1.2;
      color: var(--color-text-muted);
    }
    .header-utilities {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .workspace-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3px;
      padding: 3px;
      border-radius: 9px;
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
    }
    .ws-tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 28px;
      padding: 0 8px;
      border-radius: 7px;
      color: var(--color-text-secondary);
      text-decoration: none;
      font-size: 0.77rem;
      font-weight: 600;
      transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
    }
    .ws-tab:hover {
      color: var(--color-primary);
    }
    .ws-tab.active {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    @media (min-width: 768px) {
      .trip-header {
        gap: 10px;
        margin-bottom: var(--space-3);
      }
      .header-top {
        gap: var(--space-3);
      }
      .header-left {
        gap: var(--space-3);
      }
      .back-btn {
        width: 34px;
        height: 34px;
      }
      .trip-name {
        font-size: 1.1875rem;
      }
      .trip-range {
        margin: 2px 0 0;
        font-size: 0.78rem;
      }
      .workspace-tabs {
        gap: 4px;
        padding: 4px;
        border-radius: 11px;
      }
      .ws-tab {
        gap: 6px;
        height: 34px;
        padding: 0 10px;
        border-radius: 8px;
        font-size: 0.82rem;
      }
    }
  `,
})
export class TripSubnavComponent {
  readonly tripId = input.required<string>();
  readonly title = input<string>('');
  readonly dateRange = input<string>('');
}
