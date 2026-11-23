import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { findCountry } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory, StatsScope } from '../../core/models/tripilot.models';
import { expenseCategoryKey, formatMoney } from '../../core/utils/travel-format.utils';
import { StatsStore } from '../../state/stats.store';

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  FLIGHT: '#1B2A4A',
  LODGING: '#C89B5B',
  FOOD: '#D96B52',
  TRANSIT: '#3B82F6',
  ACTIVITY: '#10B981',
  SHOPPING: '#8B5CF6',
  OTHER: '#94A3B8',
};

/** Annual and lifetime travel dashboard with scope tabs, spend structure, and country footprint. */
@Component({
  selector: 'app-stats-page',
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-head">
        <h2 class="page-title">{{ 'stats.title' | t }}</h2>

        <div class="controls-bar">
          <div class="segmented" role="tablist" aria-label="Trip scope">
            @for (sc of scopes; track sc) {
              <button
                type="button"
                class="seg-btn"
                [class.active]="store.selectedScope() === sc"
                (click)="store.loadStats(store.selectedYear(), sc)"
              >
                {{ scopeKey(sc) | t }}
              </button>
            }
          </div>

          <div class="segmented" role="tablist" aria-label="Year filter">
            @for (yr of yearOptions(); track yr) {
              <button
                type="button"
                class="seg-btn tabular-nums"
                [class.active]="store.selectedYear() === yr"
                (click)="store.loadStats(yr, store.selectedScope())"
              >
                {{ yr ?? ('stats.allTime' | t) }}
              </button>
            }
          </div>
        </div>
      </header>

      @if (store.loading() && !store.stats()) {
        <p class="empty-box">{{ 'common.loading' | t }}</p>
      } @else if (store.stats(); as s) {
        <div class="dashboard-body" [class.refreshing]="store.loading()">
        <!-- 4 Core KPI Cards -->
        <section class="kpi-grid">
          <div class="kpi-card highlight">
            <span class="kpi-label">{{ 'stats.trips' | t }}</span>
            <strong class="kpi-value tabular-nums">{{ s.total_trips }}</strong>
            <span class="kpi-sub tabular-nums">
              @if (s.scope === 'all') {
                {{ 'stats.scope.international' | t }} {{ s.international_trips }} ·
                {{ 'stats.scope.domestic' | t }} {{ s.domestic_trips }}
              } @else {
                {{ 'stats.countries' | t }}: {{ s.countries_visited.length }}
              }
            </span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">{{ 'stats.travelDays' | t }}</span>
            <strong class="kpi-value tabular-nums">{{ s.total_travel_days }}</strong>
            <span class="kpi-sub tabular-nums">
              {{ 'stats.avgTripDays' | t: { days: avgTripDays() } }}
            </span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">{{ 'stats.flightDistance' | t }}</span>
            <strong class="kpi-value tabular-nums">
              {{ formatMoney(s.total_flight_distance_km) }} km
            </strong>
            <span class="kpi-sub tabular-nums">
              {{ 'stats.flightsCount' | t: { count: s.flight_count } }} ·
              {{ 'stats.groundDistance' | t }} {{ formatMoney(s.total_ground_distance_km) }} km
            </span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">{{ 'stats.totalSpend' | t }}</span>
            <strong class="kpi-value tabular-nums">
              {{ s.home_currency }} {{ formatMoney(s.total_spend_home) }}
            </strong>
            <span class="kpi-sub tabular-nums">
              {{
                'stats.avgPerDay'
                  | t: { currency: s.home_currency, amount: formatMoney(s.avg_spend_per_day) }
              }}
            </span>
          </div>
        </section>

        <!-- Insights Grid: Spend Structure + Country Footprint -->
        <div class="insights-grid">
          <section class="panel spend-panel">
            <div class="panel-head">
              <div class="panel-title-wrap">
                <span class="ms-icon sm panel-ico spend" aria-hidden="true">pie_chart</span>
                <h3>{{ 'stats.spendBreakdown' | t }}</h3>
              </div>
              <span class="panel-total tabular-nums">
                {{ s.home_currency }} {{ formatMoney(s.total_spend_home) }}
              </span>
            </div>

            @if (spendEntries().length === 0) {
              <p class="muted">{{ 'stats.noSpend' | t }}</p>
            } @else {
              <!-- Stacked proportion bar -->
              <div class="stacked-bar" aria-hidden="true">
                @for (item of spendEntries(); track item.category) {
                  <div
                    class="stacked-seg"
                    [style.width.%]="item.percent"
                    [style.background]="item.color"
                    [title]="(categoryKey(item.category) | t) + ' ' + item.percent + '%'"
                  ></div>
                }
              </div>

              <div class="spend-list">
                @for (item of spendEntries(); track item.category) {
                  <div class="spend-row">
                    <div class="spend-left">
                      <span class="cat-dot" [style.background]="item.color"></span>
                      <span class="cat-name">{{ categoryKey(item.category) | t }}</span>
                    </div>
                    <div class="spend-right tabular-nums">
                      <span class="cat-pct">{{ item.percent }}%</span>
                      <span class="cat-amt">
                        {{ s.home_currency }} {{ formatMoney(item.amount) }}
                      </span>
                    </div>
                  </div>
                }
              </div>
            }
          </section>

          <section class="panel">
            <div class="panel-head">
              <div class="panel-title-wrap">
                <span class="ms-icon sm panel-ico" aria-hidden="true">public</span>
                <h3>{{ 'stats.countriesVisited' | t }}</h3>
              </div>
              <span class="count-pill tabular-nums">{{ countryRanking().length }}</span>
            </div>

            @if (countryRanking().length === 0) {
              <p class="muted">{{ 'stats.emptyPeriod' | t }}</p>
            } @else {
              <div class="country-rank-list">
                @for (entry of countryRanking(); track entry.code) {
                  <div class="country-row">
                    <div class="country-row-top">
                      <span class="country-name">{{ countryLabel(entry.code) }}</span>
                      <span class="country-count tabular-nums">
                        {{ 'stats.visitsTimes' | t: { count: entry.count } }}
                      </span>
                    </div>
                    <div class="bar-track">
                      <div class="bar-fill" [style.width.%]="entry.barPercent"></div>
                    </div>
                  </div>
                }
              </div>
            }
          </section>
        </div>

        <!-- Clickable Trips List for This Period -->
        <section class="panel trips-panel">
          <div class="panel-head">
            <div class="panel-title-wrap">
              <span class="ms-icon sm panel-ico" aria-hidden="true">luggage</span>
              <h3>{{ 'stats.tripsInPeriod' | t }}</h3>
            </div>
            <span class="count-pill tabular-nums">{{ s.trips.length }}</span>
          </div>

          @if (s.trips.length === 0) {
            <p class="muted">{{ 'stats.emptyPeriod' | t }}</p>
          } @else {
            <div class="trip-rows">
              @for (trip of s.trips; track trip.id) {
                <a class="trip-row" [routerLink]="['/trips', trip.id]">
                  <div class="trip-row-left">
                    <div class="trip-title-line">
                      <strong class="trip-row-title">{{ trip.title }}</strong>
                      <span
                        class="scope-tag"
                        [class.intl]="trip.is_international"
                      >
                        {{
                          (trip.is_international ? 'stats.scope.international' : 'stats.scope.domestic')
                            | t
                        }}
                      </span>
                    </div>
                    <div class="trip-row-meta tabular-nums">
                      <span>{{ trip.start_date }} — {{ trip.end_date }}</span>
                      <span>·</span>
                      <span>{{ 'trips.daysCount' | t: { count: trip.days } }}</span>
                    </div>
                  </div>

                  <div class="trip-row-right tabular-nums">
                    @if (+trip.spend_home > 0) {
                      <span class="trip-spend">
                        {{ s.home_currency }} {{ formatMoney(trip.spend_home) }}
                      </span>
                    }
                    <span class="ms-icon sm chevron" aria-hidden="true">chevron_right</span>
                  </div>
                </a>
              }
            </div>
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
    .controls-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      max-width: 100%;
    }
    .segmented {
      display: inline-flex;
      gap: 3px;
      padding: 3px;
      max-width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
      border-radius: 10px;
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
    }
    .segmented::-webkit-scrollbar {
      display: none;
    }
    .seg-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 7px;
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
    }
    .seg-btn.active {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    .dashboard-body {
      transition: opacity 160ms ease;
    }
    .dashboard-body.refreshing {
      opacity: 0.55;
      pointer-events: none;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .kpi-card {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: var(--space-3) var(--space-4);
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
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.75;
    }
    .kpi-value {
      font-family: var(--font-display);
      font-size: 1.55rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--color-primary);
      overflow-wrap: anywhere;
    }
    .kpi-card.highlight .kpi-value {
      color: var(--color-accent);
    }
    .kpi-sub {
      font-size: 0.75rem;
      opacity: 0.78;
    }
    .insights-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }
    .panel {
      min-width: 0;
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-card);
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: var(--space-3);
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .panel-head h3 {
      margin: 0;
      font-size: 0.98rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .panel-ico {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .panel-ico.spend {
      background: var(--color-accent-soft);
      color: #8b652d;
    }
    .panel-total {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .count-pill {
      padding: 2px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: 0.74rem;
      font-weight: 700;
    }
    .stacked-bar {
      display: flex;
      height: 10px;
      border-radius: var(--radius-pill);
      overflow: hidden;
      background: var(--color-surface-muted);
      gap: 2px;
      margin-bottom: var(--space-4);
    }
    .stacked-seg {
      height: 100%;
      min-width: 4px;
    }
    .spend-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .spend-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 0.84rem;
    }
    .spend-left {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .cat-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .cat-name {
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .spend-right {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .cat-pct {
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--color-text-muted);
      min-width: 34px;
      text-align: right;
    }
    .cat-amt {
      font-weight: 700;
      color: var(--color-primary);
    }
    .country-rank-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .country-row-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.84rem;
      margin-bottom: 5px;
    }
    .country-name {
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .country-count {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--color-primary);
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
    .trip-rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .trip-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 14px;
      border-radius: 10px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      color: inherit;
      text-decoration: none;
      transition: border-color 140ms ease, background-color 140ms ease;
    }
    .trip-row:hover {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
    }
    .trip-row-left {
      min-width: 0;
    }
    .trip-title-line {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .trip-row-title {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .scope-tag {
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: 0.7rem;
      font-weight: 700;
    }
    .scope-tag.intl {
      background: var(--color-accent-soft);
      color: #8b652d;
    }
    .trip-row-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 3px;
      font-size: 0.76rem;
      color: var(--color-text-muted);
    }
    .trip-row-right {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .trip-spend {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .chevron {
      color: var(--color-text-muted);
    }
    .muted,
    .empty-box {
      margin: 0;
      color: var(--color-text-muted);
      font-size: 0.84rem;
    }
    @media (min-width: 900px) {
      .dashboard-body {
      transition: opacity 160ms ease;
    }
    .dashboard-body.refreshing {
      opacity: 0.55;
      pointer-events: none;
    }
    .kpi-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--space-4);
      }
      .kpi-card {
        padding: var(--space-4) var(--space-5);
      }
      .kpi-value {
        font-size: 1.8rem;
      }
      .insights-grid {
        grid-template-columns: 1.15fr 0.85fr;
        align-items: start;
      }
    }
  `,
})
export class StatsPageComponent implements OnInit {
  protected readonly store = inject(StatsStore);
  private readonly i18n = inject(I18nService);
  private readonly currentYear = new Date().getFullYear();

  protected readonly scopes: readonly StatsScope[] = ['all', 'international', 'domestic'];
  protected readonly categoryKey = expenseCategoryKey;
  protected readonly formatMoney = formatMoney;

  protected readonly yearOptions = computed<(number | null)[]>(() => {
    const years = new Set<number>([this.currentYear]);
    for (const yr of this.store.stats()?.available_years ?? []) {
      years.add(yr);
    }
    return [...Array.from(years).sort((a, b) => b - a), null];
  });

  protected readonly avgTripDays = computed(() => {
    const s = this.store.stats();
    if (!s || s.total_trips === 0) {
      return '0';
    }
    return (s.total_travel_days / s.total_trips).toFixed(1).replace(/\.0$/, '');
  });

  protected readonly spendEntries = computed(() => {
    const s = this.store.stats();
    if (!s) return [];
    const total = Number(s.total_spend_home);
    if (total <= 0) return [];
    return Object.entries(s.spend_by_category)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([cat, amount]) => {
        const category = cat as ExpenseCategory;
        return {
          category,
          amount,
          percent: Math.max(1, Math.round((Number(amount) / total) * 100)),
          color: CATEGORY_COLORS[category] ?? '#94A3B8',
        };
      })
      .sort((a, b) => Number(b.amount) - Number(a.amount));
  });

  protected readonly countryRanking = computed(() => {
    const s = this.store.stats();
    if (!s) return [];
    const entries = Object.entries(s.country_visit_counts ?? {});
    if (entries.length === 0) return [];
    const maxCount = Math.max(1, ...entries.map(([, c]) => c));
    return entries
      .map(([code, count]) => ({
        code,
        count,
        barPercent: Math.round((count / maxCount) * 100),
      }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  });

  ngOnInit(): void {
    void this.store.loadStats(this.currentYear, 'all');
  }

  protected scopeKey(
    sc: StatsScope,
  ): 'stats.scope.all' | 'stats.scope.international' | 'stats.scope.domestic' {
    return `stats.scope.${sc}`;
  }

  protected countryLabel(code: string): string {
    const match = findCountry(code);
    if (!match) return code;
    return this.i18n.locale() === 'zh-TW' ? match.nameZh : match.nameEn;
  }
}
