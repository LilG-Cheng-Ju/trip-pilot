import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MS_PER_DAY } from '../../core/constants/app-limits';
import { findCountry } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ExpenseCategory, StatsScope, TripStatSummary } from '../../core/models/tripilot.models';
import { createAnimatedNumber } from '../../core/utils/count-up.utils';
import {
  EXPENSE_CATEGORY_COLORS,
  expenseCategoryKey,
  formatMoney,
} from '../../core/utils/travel-format.utils';
import { AppSelectComponent, SelectOption } from '../../shared/select-input.component';
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

interface HeroWaypoint {
  x: number;
  y: number;
  isEnd: boolean;
}

function sampleHeroCurvePoint(t: number): { x: number; y: number } {
  const u = 1 - t;
  const x =
    u * u * u * 175 + 3 * u * u * t * 235 + 3 * u * t * t * 305 + t * t * t * 378;
  const y =
    u * u * u * 162 + 3 * u * u * t * 112 + 3 * u * t * t * 88 + t * t * t * 66;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

function parseUtcDateMs(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Annual and lifetime travel logbook with unified distance spread, scope-aware ledger, and insights. */
@Component({
  selector: 'app-stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, AppSelectComponent],
  templateUrl: './stats-page.component.html',
  styleUrl: './stats-page.component.css',
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

  protected readonly yearOptions = computed<readonly SelectOption<YearSelectValue>[]>(() => [
    { value: 'all', label: this.i18n.t('stats.allTime') },
    ...this.sortedYears().map((yr) => ({
      value: yr,
      label: String(yr),
      optionClass: 'tabular-nums',
    })),
  ]);

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

  protected readonly heroRoute = computed<{
    hasRoute: boolean;
    waypoints: HeroWaypoint[];
  }>(() => {
    const s = this.store.stats();
    if (!s || s.total_trips === 0) {
      return { hasRoute: false, waypoints: [{ x: 175, y: 162, isEnd: false }] };
    }
    const count = Math.min(5, Math.max(2, s.flight_count > 0 ? s.flight_count + 1 : s.total_trips + 1));
    const waypoints: HeroWaypoint[] = [];
    for (let i = 0; i < count; i++) {
      const pt = sampleHeroCurvePoint(i / (count - 1));
      waypoints.push({ x: pt.x, y: pt.y, isEnd: i === count - 1 });
    }
    return { hasRoute: true, waypoints };
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
          color: EXPENSE_CATEGORY_COLORS[category] ?? 'var(--category-other)',
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

  protected tripLocationLabel(trip: TripStatSummary): string {
    const home = this.store.stats()?.home_country_code;
    const intlCodes = trip.country_codes.filter((c) => c !== home);
    const codes = trip.is_international && intlCodes.length > 0 ? intlCodes : trip.country_codes;
    if (codes.length === 0) {
      return '';
    }
    const labels = codes.map((c) => this.countryLabel(c));
    const sep = this.i18n.locale() === 'zh-TW' ? '、' : ', ';
    if (labels.length <= 3) {
      return labels.join(sep);
    }
    return `${labels.slice(0, 3).join(sep)} +${labels.length - 3}`;
  }

  protected formatTripDateRange(start: string, end: string): string {
    const startDot = start.replace(/-/g, '.');
    if (!end || start === end) {
      return startDot;
    }
    const endDot = end.replace(/-/g, '.');
    if (start.slice(0, 4) === end.slice(0, 4)) {
      return `${startDot} – ${endDot.slice(5)}`;
    }
    return `${startDot} – ${endDot}`;
  }
}
