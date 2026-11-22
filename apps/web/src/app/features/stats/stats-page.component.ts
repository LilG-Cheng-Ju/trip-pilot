import { Component, computed, inject, OnInit } from '@angular/core';

import { findCountry } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory } from '../../core/models/tripilot.models';
import { StatsStore } from '../../state/stats.store';

/** Annual and lifetime travel statistics dashboard. */
@Component({
  selector: 'app-stats-page',
  imports: [TranslatePipe],
  template: `
    <div class="page">
      <header class="page-head">
        <h2 class="page-title">{{ 'stats.title' | t }}</h2>
        <div class="year-pills">
          @for (yr of yearOptions; track yr) {
            <button
              type="button"
              class="year-pill tabular-nums"
              [class.active]="store.selectedYear() === yr"
              (click)="store.loadStats(yr)"
            >
              {{ yr ?? ('stats.allTime' | t) }}
            </button>
          }
        </div>
      </header>

      @if (store.loading()) {
        <p class="empty-box">{{ 'common.loading' | t }}</p>
      } @else if (store.stats(); as s) {
        <section class="kpi-grid">
          <div class="kpi-card highlight">
            <span class="kpi-label">{{ 'stats.international' | t }}</span>
            <strong class="kpi-value tabular-nums">{{ s.international_trips }}</strong>
            <span class="kpi-sub tabular-nums">{{ 'stats.trips' | t }}: {{ s.total_trips }}</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">{{ 'stats.countries' | t }}</span>
            <strong class="kpi-value tabular-nums">{{ s.countries_visited.length }}</strong>
            <span class="kpi-sub tabular-nums">{{ 'stats.travelDays' | t }}: {{ s.total_travel_days }}</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">{{ 'stats.flightDistance' | t }}</span>
            <strong class="kpi-value tabular-nums">{{ s.total_flight_distance_km }} km</strong>
            <span class="kpi-sub tabular-nums">{{ 'stats.groundDistance' | t }}: {{ s.total_ground_distance_km }} km</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">{{ 'stats.totalSpend' | t }}</span>
            <strong class="kpi-value tabular-nums">{{ s.home_currency }} {{ s.total_spend_home }}</strong>
            <span class="kpi-sub">{{ s.home_country_code }}</span>
          </div>
        </section>

        <div class="detail-grid">
          <section class="panel">
            <h3>{{ 'stats.countriesVisited' | t }}</h3>
            @if (s.countries_visited.length === 0) {
              <p class="muted">—</p>
            } @else {
              <div class="country-list">
                @for (code of s.countries_visited; track code) {
                  <span class="country-pill">{{ countryLabel(code) }}</span>
                }
              </div>
            }
          </section>

          <section class="panel">
            <h3>{{ 'stats.spendBreakdown' | t }}</h3>
            @if (spendEntries().length === 0) {
              <p class="muted">—</p>
            } @else {
              @for (item of spendEntries(); track item.category) {
                <div class="spend-row">
                  <div class="spend-head">
                    <span>{{ categoryKey(item.category) | t }}</span>
                    <span class="tabular-nums">{{ s.home_currency }} {{ item.amount }}</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" [style.width.%]="item.percent"></div>
                  </div>
                </div>
              }
            }
          </section>
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
    .page-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-5);
    }
    .page-title {
      margin: 0;
      font-size: 1.375rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .year-pills {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
    }
    .year-pill {
      padding: 7px 14px;
      border: none;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .year-pill.active {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: var(--shadow-card);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--space-4);
      margin-bottom: var(--space-5);
    }
    .kpi-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: var(--space-5);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-card);
    }
    .kpi-card.highlight {
      background: var(--color-primary);
      color: #ffffff;
      border-color: var(--color-primary);
    }
    .kpi-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.75;
    }
    .kpi-value {
      font-size: 1.625rem;
      font-weight: 800;
      color: var(--color-primary);
    }
    .kpi-card.highlight .kpi-value {
      color: var(--color-accent);
    }
    .kpi-sub {
      font-size: 0.8125rem;
      opacity: 0.78;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--space-4);
    }
    .panel {
      padding: var(--space-5);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-card);
    }
    .panel h3 {
      margin: 0 0 var(--space-3);
      font-size: 1rem;
      color: var(--color-primary);
    }
    .country-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .country-pill {
      padding: 6px 14px;
      border-radius: var(--radius-pill);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-weight: 700;
      font-size: 0.875rem;
    }
    .spend-row {
      margin-bottom: 12px;
    }
    .spend-head {
      display: flex;
      justify-content: space-between;
      font-size: 0.8125rem;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .bar-track {
      height: 7px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: var(--color-accent);
      border-radius: var(--radius-pill);
    }
    .muted,
    .empty-box {
      color: var(--color-text-muted);
    }
  `,
})
export class StatsPageComponent implements OnInit {
  protected readonly store = inject(StatsStore);
  private readonly i18n = inject(I18nService);
  private readonly currentYear = new Date().getFullYear();

  protected readonly yearOptions: (number | null)[] = [
    this.currentYear,
    this.currentYear - 1,
    null,
  ];

  protected readonly spendEntries = computed(() => {
    const s = this.store.stats();
    if (!s) return [];
    const total = Math.max(0.01, Number(s.total_spend_home));
    return Object.entries(s.spend_by_category)
      .map(([cat, amount]) => ({
        category: cat as ExpenseCategory,
        amount,
        percent: Math.min(100, Math.round((Number(amount) / total) * 100)),
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));
  });

  ngOnInit(): void {
    void this.store.loadStats(this.currentYear);
  }

  protected countryLabel(code: string): string {
    const match = findCountry(code);
    if (!match) return code;
    return this.i18n.locale() === 'zh-TW'
      ? `${match.nameZh} (${match.code})`
      : `${match.nameEn} (${match.code})`;
  }

  protected categoryKey(
    cat: ExpenseCategory,
  ):
    | 'expenses.cat.FLIGHT'
    | 'expenses.cat.LODGING'
    | 'expenses.cat.TRANSIT'
    | 'expenses.cat.FOOD'
    | 'expenses.cat.ACTIVITY'
    | 'expenses.cat.SHOPPING'
    | 'expenses.cat.OTHER' {
    return `expenses.cat.${cat}`;
  }
}
