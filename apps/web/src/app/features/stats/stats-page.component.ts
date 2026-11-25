import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import { MS_PER_DAY } from '../../core/constants/app-limits';
import { findCountry } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory, StatsScope, TripStatSummary } from '../../core/models/tripilot.models';
import { createAnimatedNumber } from '../../core/utils/count-up.utils';
import { expenseCategoryKey, formatMoney } from '../../core/utils/travel-format.utils';
import { StatsStore } from '../../state/stats.store';

type YearSelectValue = 'all' | number;

interface DistanceModeEntry {
  id: 'air' | 'ground';
  labelKey: 'stats.airShort' | 'stats.groundShort';
  km: number;
  percent: number;
  meta: string | null;
}

interface MonthCadenceEntry {
  month: number;
  days: number;
  percent: number;
}

interface YearFootprintEntry {
  year: number;
  trips: number;
  days: number;
  barPercent: number;
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  FLIGHT: 'var(--item-flight)',
  LODGING: 'var(--item-stay)',
  FOOD: 'var(--item-food)',
  TRANSIT: 'var(--item-reserved)',
  ACTIVITY: 'var(--item-spot)',
  SHOPPING: 'var(--category-shopping)',
  OTHER: 'var(--category-other)',
};

function parseUtcDateMs(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Annual and lifetime travel logbook with unified distance spread, scope-aware ledger, and insights. */
@Component({
  selector: 'app-stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, MatFormFieldModule, MatSelectModule],
  template: `
    <div class="page">
      <header class="page-head">
        <h2 class="page-title font-display">{{ 'stats.title' | t }}</h2>

        <div class="segmented scope-tabs" role="tablist" [attr.aria-label]="'stats.scopeAria' | t">
          @for (sc of scopes; track sc) {
            <button
              type="button"
              role="tab"
              class="seg-btn"
              [attr.aria-selected]="store.selectedScope() === sc"
              [class.active]="store.selectedScope() === sc"
              (click)="store.loadStats(store.selectedYear(), sc)"
            >
              {{ scopeKey(sc) | t }}
            </button>
          }
        </div>

        <mat-form-field
          appearance="outline"
          subscriptSizing="dynamic"
          class="year-select-field"
        >
          <mat-select
            class="tabular-nums"
            [value]="selectedYearValue()"
            [panelWidth]="null"
            [aria-label]="'stats.yearAria' | t"
            (selectionChange)="onYearChange($event.value)"
          >
            <mat-option value="all">{{ 'stats.allTime' | t }}</mat-option>
            @for (yr of sortedYears(); track yr) {
              <mat-option class="tabular-nums" [value]="yr">{{ yr }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </header>

      @if (store.loading() && !store.stats()) {
        <p class="empty-box">{{ 'common.loading' | t }}</p>
      } @else if (store.stats(); as s) {
        <div class="dashboard-body" [class.refreshing]="store.loading()">
          <!-- Unified Editorial Logbook Spread -->
          <section class="logbook-ledger">
            <article class="logbook-hero">
              <!-- Subtle cartographic route watermark echoing login & aviation identity -->
              <svg
                class="hero-carto"
                viewBox="0 0 420 220"
                preserveAspectRatio="xMaxYMid slice"
                fill="none"
                aria-hidden="true"
              >
                <g stroke="rgba(196, 146, 76, 0.14)" stroke-width="1">
                  <path d="M 150 185 C 225 145, 295 175, 435 110" />
                  <path d="M 185 215 C 255 178, 325 202, 445 145" />
                  <circle cx="348" cy="78" r="56" stroke-opacity="0.55" />
                  <circle cx="348" cy="78" r="92" stroke-opacity="0.3" />
                </g>
                <path
                  d="M 212 152 C 258 106, 304 88, 348 78"
                  stroke="#C4924C"
                  stroke-width="1.6"
                  stroke-dasharray="4 5"
                  stroke-opacity="0.42"
                  stroke-linecap="round"
                />
                <circle cx="212" cy="152" r="3.5" fill="#C4924C" fill-opacity="0.55" />
                <circle
                  cx="348"
                  cy="78"
                  r="4.5"
                  fill="#162136"
                  stroke="#C4924C"
                  stroke-width="1.8"
                  stroke-opacity="0.7"
                />
              </svg>

              <div class="hero-top">
                <span class="hero-title">{{ 'stats.totalDistance' | t }}</span>
                <span class="hero-stamp font-mono tabular-nums">{{ periodStamp() }}</span>
              </div>

              <strong class="kpi-value hero-value tabular-nums">
                {{ formatMoney(animatedTotalDistanceKm()) }} <span class="hero-unit">km</span>
              </strong>

              <div class="hero-modes">
                <div class="distance-bar" aria-hidden="true">
                  @for (mode of distanceModes(); track mode.id) {
                    @if (mode.km > 0) {
                      <div
                        class="distance-seg"
                        [class.air]="mode.id === 'air'"
                        [class.ground]="mode.id === 'ground'"
                        [style.width.%]="mode.percent"
                      ></div>
                    }
                  }
                </div>

                <div class="mode-split tabular-nums">
                  @for (mode of distanceModes(); track mode.id) {
                    <div class="mode-col">
                      <span class="mode-label">
                        <span
                          class="mode-dot"
                          [class.air]="mode.id === 'air'"
                          [class.ground]="mode.id === 'ground'"
                          aria-hidden="true"
                        ></span>
                        <span>{{ mode.labelKey | t }}</span>
                      </span>
                      <div class="mode-val-line">
                        <strong class="mode-val">{{ formatMoney(mode.km) }} km</strong>
                        @if (mode.meta) {
                          <span class="mode-meta">· {{ mode.meta }}</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            </article>

            <div class="logbook-metrics">
              <!-- Cell 1: Trips (All / International / Domestic) -->
              <div class="logbook-metric-row">
                <span class="kpi-label">{{ tripsLabelKey() | t }}</span>
                <strong class="kpi-value tabular-nums">{{ animatedTrips() }}</strong>
                <span class="kpi-sub tabular-nums">{{ tripsSubtext() }}</span>
              </div>

              <!-- Cell 2: Travel Days -->
              <div class="logbook-metric-row">
                <span class="kpi-label">{{ 'stats.travelDays' | t }}</span>
                <strong class="kpi-value tabular-nums">{{ animatedTravelDays() }}</strong>
                <span class="kpi-sub tabular-nums">
                  {{ 'stats.avgTripDays' | t: { days: avgTripDays() } }}
                </span>
              </div>

              <!-- Cell 3: Countries (All / Intl) OR Longest Trip (Domestic) -->
              <div class="logbook-metric-row">
                @if (s.scope === 'domestic') {
                  <span class="kpi-label">{{ 'stats.longestTrip' | t }}</span>
                  <strong class="kpi-value tabular-nums">
                    @if (longestTrip(); as longest) {
                      {{ 'trips.daysCount' | t: { count: longest.days } }}
                    } @else {
                      —
                    }
                  </strong>
                  <span class="kpi-sub" [title]="longestTrip()?.title ?? ''">
                    {{ longestTrip()?.title ?? ('stats.noTripsShort' | t) }}
                  </span>
                } @else {
                  <span class="kpi-label">{{ 'stats.countries' | t }}</span>
                  <strong class="kpi-value tabular-nums">{{ animatedCountries() }}</strong>
                  <span class="kpi-sub" [title]="countriesPreview()">
                    {{ countriesPreview() }}
                  </span>
                }
              </div>

              <!-- Cell 4: Total Spend -->
              <div class="logbook-metric-row">
                <span class="kpi-label">{{ 'stats.totalSpend' | t }}</span>
                <strong class="kpi-value spend-value tabular-nums">
                  {{ s.home_currency }} {{ formatMoney(animatedTotalSpend()) }}
                </strong>
                <span class="kpi-sub tabular-nums">
                  {{
                    'stats.avgPerDay'
                      | t: { currency: s.home_currency, amount: formatMoney(s.avg_spend_per_day) }
                  }}
                </span>
              </div>
            </div>
          </section>

          <!-- Insights Grid: Spend Structure + Country Ranking (or Domestic Temporal Footprint) -->
          <div class="insights-grid">
            <section class="panel spend-panel">
              <div class="panel-head">
                <h3 class="font-display">{{ 'stats.spendBreakdown' | t }}</h3>
                <span class="panel-total font-mono tabular-nums">
                  {{ s.home_currency }} {{ formatMoney(s.total_spend_home) }}
                </span>
              </div>

              @if (spendEntries().length === 0) {
                <p class="muted">{{ 'stats.noSpend' | t }}</p>
              } @else {
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

            @if (s.scope === 'domestic') {
              <section class="panel footprint-panel">
                @if (s.year !== null) {
                  <div class="panel-head">
                    <h3 class="font-display">{{ 'stats.monthlyFootprint' | t }}</h3>
                    <span class="panel-count font-mono tabular-nums">
                      {{ activeMonthsCount() }}/12
                    </span>
                  </div>

                  @if (s.trips.length === 0) {
                    <p class="muted">{{ 'stats.emptyPeriod' | t }}</p>
                  } @else {
                    <div class="month-cadence tabular-nums">
                      @for (m of monthlyCadence(); track m.month) {
                        <div class="month-col" [class.active]="m.days > 0">
                          <span class="month-days">{{ m.days > 0 ? m.days : '' }}</span>
                          <div class="month-track" aria-hidden="true">
                            @if (m.days > 0) {
                              <div class="month-fill" [style.height.%]="m.percent"></div>
                            }
                          </div>
                          <span class="month-num font-mono">{{ m.month }}</span>
                        </div>
                      }
                    </div>
                    <p class="cadence-caption tabular-nums">
                      {{
                        'stats.monthlyHint'
                          | t: { months: activeMonthsCount(), days: s.total_travel_days }
                      }}
                    </p>
                  }
                } @else {
                  <div class="panel-head">
                    <h3 class="font-display">{{ 'stats.yearlyFootprint' | t }}</h3>
                    <span class="panel-count font-mono tabular-nums">
                      {{ yearlyFootprint().length }}
                    </span>
                  </div>

                  @if (yearlyFootprint().length === 0) {
                    <p class="muted">{{ 'stats.emptyPeriod' | t }}</p>
                  } @else {
                    <div class="country-rank-list">
                      @for (yr of yearlyFootprint(); track yr.year) {
                        <div class="country-row">
                          <div class="country-row-top tabular-nums">
                            <span class="country-name">{{ yr.year }}</span>
                            <span class="country-count">
                              {{
                                'stats.yearRowMeta' | t: { trips: yr.trips, days: yr.days }
                              }}
                            </span>
                          </div>
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="yr.barPercent"></div>
                          </div>
                        </div>
                      }
                    </div>
                  }
                }
              </section>
            } @else {
              <section class="panel countries-panel">
                <div class="panel-head">
                  <h3 class="font-display">{{ 'stats.countriesVisited' | t }}</h3>
                  <span class="panel-count font-mono tabular-nums">
                    {{ countryRanking().length }}
                  </span>
                </div>

                @if (countryRanking().length === 0) {
                  <p class="muted">{{ 'stats.emptyPeriod' | t }}</p>
                } @else {
                  <div class="country-rank-list">
                    @for (entry of countryRanking(); track entry.code) {
                      <div class="country-row">
                        <div class="country-row-top">
                          <span class="country-label-group">
                            <span class="country-code font-mono">{{ entry.code }}</span>
                            <span class="country-name">{{ countryLabel(entry.code) }}</span>
                          </span>
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
            }
          </div>

          <!-- Clickable Trips List for This Period -->
          <section class="panel trips-panel">
            <div class="panel-head">
              <h3 class="font-display">{{ 'stats.tripsInPeriod' | t }}</h3>
              <span class="panel-count font-mono tabular-nums">{{ s.trips.length }}</span>
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
                        @if (s.scope === 'all') {
                          <span class="scope-tag" [class.intl]="trip.is_international">
                            {{
                              (trip.is_international
                                ? 'stats.scope.international'
                                : 'stats.scope.domestic') | t
                            }}
                          </span>
                        }
                      </div>
                      <div class="trip-row-meta tabular-nums">
                        <span>{{ trip.start_date }} — {{ trip.end_date }}</span>
                        <span>·</span>
                        <span>{{ 'trips.daysCount' | t: { count: trip.days } }}</span>
                        @if (trip.is_international && tripCountriesLabel(trip); as destLabel) {
                          <span>·</span>
                          <span>{{ destLabel }}</span>
                        }
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
      } @else if (store.error(); as err) {
        <div class="error-banner" role="alert">
          <span>{{ err }}</span>
          <button
            type="button"
            class="pill-btn"
            (click)="store.loadStats(store.selectedYear(), store.selectedScope())"
          >
            {{ 'common.retry' | t }}
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .page {
      max-width: 1120px;
      margin: 0 auto;
      padding: var(--space-4) var(--space-4) calc(var(--nav-bottom-height) + var(--space-6));
    }
    .page-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'title year'
        'scope scope';
      align-items: center;
      gap: 10px 12px;
      margin-bottom: var(--space-3);
    }
    .page-title {
      grid-area: title;
      margin: 0;
      font-size: 1.35rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .scope-tabs {
      grid-area: scope;
    }
    .year-select-field {
      grid-area: year;
      width: 132px;
      background: var(--color-surface);
      border-radius: var(--radius-sm);
    }
    .segmented {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: center;
      gap: 3px;
      height: 38px;
      padding: 3px;
      box-sizing: border-box;
      max-width: 100%;
      border-radius: var(--radius-sm);
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
    }
    .seg-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 0 12px;
      border: none;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
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

    /* Unified Logbook Spread */
    .logbook-ledger {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-card);
      margin-bottom: var(--space-4);
    }
    .logbook-hero {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 11px;
      padding: 16px 18px;
      background: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .hero-carto {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .hero-top,
    .hero-value,
    .hero-modes {
      position: relative;
      z-index: 1;
    }
    .hero-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .hero-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: rgba(248, 247, 244, 0.9);
    }
    .hero-stamp {
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      background: rgba(196, 146, 76, 0.16);
      border: 1px solid rgba(196, 146, 76, 0.36);
      color: var(--color-accent-light);
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    .kpi-value {
      font-family: var(--font-display);
      font-size: 1.36rem;
      font-weight: 600;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: var(--color-primary);
      overflow-wrap: anywhere;
    }
    .kpi-value.hero-value {
      margin: 2px 0 2px;
      font-size: 2.05rem;
      line-height: 1.06;
      color: #f8f7f4;
    }
    .hero-unit {
      font-family: var(--font-sans);
      font-size: 0.98rem;
      font-weight: 500;
      letter-spacing: 0;
      color: var(--color-accent-light);
    }
    .hero-modes {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 11px;
    }
    .distance-bar {
      display: flex;
      height: 5px;
      border-radius: var(--radius-pill);
      background: rgba(248, 247, 244, 0.14);
      gap: 2px;
      overflow: hidden;
    }
    .distance-seg {
      height: 100%;
      min-width: 6px;
    }
    .distance-seg.air {
      background: #93b4ec;
    }
    .distance-seg.ground {
      background: var(--color-accent);
    }
    .mode-split {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .mode-col {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .mode-col + .mode-col {
      padding-left: 12px;
      border-left: 1px solid rgba(248, 247, 244, 0.14);
    }
    .mode-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.76rem;
      font-weight: 500;
      color: rgba(248, 247, 244, 0.74);
    }
    .mode-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .mode-dot.air {
      background: #93b4ec;
    }
    .mode-dot.ground {
      background: var(--color-accent);
    }
    .mode-val-line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px;
    }
    .mode-val {
      font-size: 0.9rem;
      font-weight: 600;
      color: #f8f7f4;
    }
    .mode-meta {
      font-size: 0.74rem;
      color: rgba(248, 247, 244, 0.6);
    }

    /* Right 2x2 Architectural Ledger Grid */
    .logbook-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      background: var(--color-surface);
    }
    .logbook-metric-row {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--color-border-soft);
    }
    .logbook-metric-row:nth-child(odd) {
      border-right: 1px solid var(--color-border-soft);
    }
    .logbook-metric-row:nth-last-child(-n + 2) {
      border-bottom: none;
    }
    .kpi-label {
      font-size: 0.84rem;
      font-weight: 600;
      line-height: 1.3;
      color: var(--color-text-primary);
    }
    .kpi-value.spend-value {
      font-size: 1.22rem;
    }
    .kpi-sub {
      font-size: 0.75rem;
      font-weight: 400;
      line-height: 1.35;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Insights Panels */
    .insights-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }
    .panel {
      min-width: 0;
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-card);
    }
    .panel-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 10px;
      margin-bottom: var(--space-3);
      border-bottom: 1px solid var(--color-border);
    }
    .panel-head h3 {
      margin: 0;
      font-size: 1.08rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .panel-total {
      font-size: 0.86rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .panel-count {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-accent-ink);
    }
    .stacked-bar {
      display: flex;
      height: 9px;
      border-radius: var(--radius-xs);
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
      width: 9px;
      height: 9px;
      border-radius: 2px;
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
      font-weight: 600;
      color: var(--color-text-muted);
      min-width: 34px;
      text-align: right;
    }
    .cat-amt {
      font-weight: 600;
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
      gap: 8px;
      font-size: 0.84rem;
      margin-bottom: 5px;
    }
    .country-label-group {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .country-code {
      padding: 1px 5px;
      border-radius: var(--radius-xs);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: 0.7rem;
      font-weight: 600;
    }
    .country-name {
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .country-count {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .bar-track {
      height: 6px;
      border-radius: var(--radius-xs);
      background: var(--color-surface-muted);
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: var(--color-accent);
      border-radius: var(--radius-xs);
    }

    /* 12-Month Domestic Cadence Chart */
    .month-cadence {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 4px;
      padding-top: 4px;
    }
    .month-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    .month-days {
      min-height: 15px;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .month-track {
      width: 100%;
      max-width: 18px;
      height: 82px;
      border-radius: var(--radius-xs);
      background: var(--color-surface-muted);
      display: flex;
      align-items: flex-end;
      overflow: hidden;
    }
    .month-fill {
      width: 100%;
      min-height: 6px;
      background: var(--color-accent);
      border-radius: var(--radius-xs);
    }
    .month-num {
      font-size: 0.7rem;
      font-weight: 500;
      color: var(--color-text-muted);
    }
    .month-col.active .month-num {
      font-weight: 600;
      color: var(--color-primary);
    }
    .cadence-caption {
      margin: 14px 0 0;
      font-size: 0.76rem;
      color: var(--color-text-muted);
    }

    /* Period Trips List */
    .trip-rows {
      display: flex;
      flex-direction: column;
    }
    .trip-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 6px;
      border-bottom: 1px solid var(--color-border-soft);
      color: inherit;
      text-decoration: none;
      transition: background-color 140ms ease;
    }
    .trip-row:last-child {
      border-bottom: none;
    }
    .trip-row:hover {
      background: var(--color-surface-alt);
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
      font-weight: 600;
      color: var(--color-primary);
    }
    .scope-tag {
      padding: 2px 7px;
      border-radius: var(--radius-xs);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: 0.7rem;
      font-weight: 600;
    }
    .scope-tag.intl {
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
    }
    .trip-row-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
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
      font-weight: 600;
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

    @media (min-width: 640px) {
      .page {
        padding-top: var(--space-5);
      }
      .page-head {
        grid-template-columns: minmax(0, 1fr) auto auto;
        grid-template-areas: 'title scope year';
        gap: 10px;
        margin-bottom: var(--space-5);
      }
      .page-title {
        font-size: 1.375rem;
      }
      .segmented {
        display: inline-flex;
        height: 40px;
      }
      .year-select-field {
        width: 138px;
      }
      .logbook-hero {
        padding: 20px 22px;
        gap: 14px;
      }
      .kpi-value {
        font-size: 1.5rem;
      }
      .kpi-value.spend-value {
        font-size: 1.38rem;
      }
      .kpi-value.hero-value {
        font-size: 2.35rem;
      }
      .logbook-metric-row {
        padding: 18px 20px;
        gap: 5px;
      }
      .kpi-label {
        font-size: 0.86rem;
      }
      .kpi-sub {
        font-size: 0.76rem;
      }
      .panel {
        padding: var(--space-4) var(--space-5);
      }
      .month-cadence {
        gap: 6px;
      }
    }
    @media (min-width: 820px) {
      .logbook-ledger {
        grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.28fr);
      }
      .logbook-hero {
        padding: 24px 26px;
      }
      .logbook-metric-row {
        padding: 20px 24px;
      }
    }
    @media (min-width: 900px) {
      .kpi-value {
        font-size: 1.62rem;
      }
      .kpi-value.spend-value {
        font-size: 1.5rem;
      }
      .kpi-value.hero-value {
        font-size: 2.5rem;
      }
      .insights-grid {
        grid-template-columns: 1.12fr 0.88fr;
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

  protected readonly animatedTotalDistanceKm = createAnimatedNumber(
    computed(() => {
      const s = this.store.stats();
      if (!s) return null;
      return Math.round((s.total_flight_distance_km + s.total_ground_distance_km) * 100) / 100;
    }),
  );
  protected readonly animatedTrips = createAnimatedNumber(
    computed(() => this.store.stats()?.total_trips ?? null),
  );
  protected readonly animatedTravelDays = createAnimatedNumber(
    computed(() => this.store.stats()?.total_travel_days ?? null),
  );
  protected readonly animatedCountries = createAnimatedNumber(
    computed(() => this.store.stats()?.countries_visited.length ?? null),
  );
  protected readonly animatedTotalSpend = createAnimatedNumber(
    computed(() => {
      const s = this.store.stats();
      return s ? Number(s.total_spend_home) : null;
    }),
  );

  protected readonly sortedYears = computed<number[]>(() => {
    const years = new Set<number>([this.currentYear]);
    for (const yr of this.store.stats()?.available_years ?? []) {
      years.add(yr);
    }
    return Array.from(years).sort((a, b) => b - a);
  });

  protected readonly selectedYearValue = computed<YearSelectValue>(
    () => this.store.selectedYear() ?? 'all',
  );

  protected readonly periodStamp = computed(() => {
    const s = this.store.stats();
    if (!s) return '';
    const yr = s.year !== null ? String(s.year) : this.i18n.t('stats.allTime');
    const sc = this.i18n.t(this.scopeKey(s.scope));
    if (s.scope === 'domestic') {
      return `${yr} · ${sc} · ${this.countryLabel(s.home_country_code)}`;
    }
    return `${yr} · ${sc}`;
  });

  protected readonly distanceModes = computed<DistanceModeEntry[]>(() => {
    const s = this.store.stats();
    if (!s) return [];
    const airKm = s.total_flight_distance_km;
    const groundKm = s.total_ground_distance_km;
    const total = airKm + groundKm;
    const airPct = total > 0 ? Math.round((airKm / total) * 100) : 0;
    const groundPct = total > 0 ? Math.max(0, 100 - airPct) : 0;

    const airEntry: DistanceModeEntry = {
      id: 'air',
      labelKey: 'stats.airShort',
      km: airKm,
      percent: airPct,
      // Show flight segments in All/Intl, and also in Domestic when island flights exist.
      meta:
        s.flight_count > 0 || s.scope !== 'domestic'
          ? this.i18n.t('stats.flightsCount', { count: s.flight_count })
          : null,
    };
    const groundEntry: DistanceModeEntry = {
      id: 'ground',
      labelKey: 'stats.groundShort',
      km: groundKm,
      percent: groundPct,
      meta: null,
    };

    return s.scope === 'domestic' ? [groundEntry, airEntry] : [airEntry, groundEntry];
  });

  protected readonly tripsLabelKey = computed<
    'stats.trips' | 'stats.international' | 'stats.domesticTrips'
  >(() => {
    const sc = this.store.stats()?.scope;
    if (sc === 'international') return 'stats.international';
    if (sc === 'domestic') return 'stats.domesticTrips';
    return 'stats.trips';
  });

  protected readonly tripsSubtext = computed(() => {
    const s = this.store.stats();
    if (!s) return '';
    if (s.scope === 'all') {
      return `${this.i18n.t('stats.scope.international')} ${s.international_trips} · ${this.i18n.t('stats.scope.domestic')} ${s.domestic_trips}`;
    }
    if (s.scope === 'international') {
      return this.i18n.t('stats.flightsCount', { count: s.flight_count });
    }
    const base = this.i18n.t('stats.domesticSub', {
      country: this.countryLabel(s.home_country_code),
    });
    return s.flight_count > 0
      ? `${base} · ${this.i18n.t('stats.flightsCount', { count: s.flight_count })}`
      : base;
  });

  protected readonly avgTripDays = computed(() => {
    const s = this.store.stats();
    if (!s || s.total_trips === 0) {
      return '0';
    }
    return (s.total_travel_days / s.total_trips).toFixed(1).replace(/\.0$/, '');
  });

  protected readonly longestTrip = computed<TripStatSummary | null>(() => {
    const trips = this.store.stats()?.trips ?? [];
    if (trips.length === 0) return null;
    return trips.reduce((best, cur) => (cur.days > best.days ? cur : best), trips[0]);
  });

  protected readonly countriesPreview = computed(() => {
    const ranked = this.countryRanking();
    if (ranked.length === 0) {
      return this.i18n.t('stats.noTripsShort');
    }
    const topNames = ranked.slice(0, 3).map((entry) => this.countryLabel(entry.code));
    const extra = ranked.length - topNames.length;
    return extra > 0 ? `${topNames.join(' · ')} +${extra}` : topNames.join(' · ');
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
          color: CATEGORY_COLORS[category] ?? 'var(--category-other)',
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

  protected readonly monthlyCadence = computed<MonthCadenceEntry[]>(() => {
    const s = this.store.stats();
    const counts = Array.from({ length: 12 }, () => 0);
    if (!s || s.year === null) {
      return counts.map((_, idx) => ({ month: idx + 1, days: 0, percent: 0 }));
    }

    const yearStart = Date.UTC(s.year, 0, 1);
    const yearEnd = Date.UTC(s.year, 11, 31);
    for (const trip of s.trips) {
      const from = Math.max(yearStart, parseUtcDateMs(trip.start_date));
      const to = Math.min(yearEnd, parseUtcDateMs(trip.end_date));
      for (let ts = from; ts <= to; ts += MS_PER_DAY) {
        const monthIdx = new Date(ts).getUTCMonth();
        counts[monthIdx] += 1;
      }
    }

    const maxDays = Math.max(1, ...counts);
    return counts.map((days, idx) => ({
      month: idx + 1,
      days,
      percent: days > 0 ? Math.max(10, Math.round((days / maxDays) * 100)) : 0,
    }));
  });

  protected readonly activeMonthsCount = computed(
    () => this.monthlyCadence().filter((m) => m.days > 0).length,
  );

  protected readonly yearlyFootprint = computed<YearFootprintEntry[]>(() => {
    const s = this.store.stats();
    if (!s || s.trips.length === 0) return [];
    const byYear = new Map<number, { trips: number; days: number }>();
    for (const trip of s.trips) {
      const yr = Number(trip.start_date.slice(0, 4));
      const prev = byYear.get(yr) ?? { trips: 0, days: 0 };
      prev.trips += 1;
      prev.days += trip.days;
      byYear.set(yr, prev);
    }
    const maxDays = Math.max(1, ...Array.from(byYear.values()).map((v) => v.days));
    return Array.from(byYear.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, val]) => ({
        year,
        trips: val.trips,
        days: val.days,
        barPercent: Math.round((val.days / maxDays) * 100),
      }));
  });

  ngOnInit(): void {
    void this.store.loadStats(this.store.selectedYear(), this.store.selectedScope());
  }

  protected onYearChange(value: YearSelectValue): void {
    void this.store.loadStats(value === 'all' ? null : value, this.store.selectedScope());
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

  protected tripCountriesLabel(trip: TripStatSummary): string {
    const home = this.store.stats()?.home_country_code;
    const codes = trip.country_codes.filter((c) => c !== home);
    const displayCodes = codes.length > 0 ? codes : trip.country_codes;
    return displayCodes.map((c) => this.countryLabel(c)).join(' · ');
  }
}
