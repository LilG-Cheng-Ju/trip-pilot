import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PublicTrip } from '../../core/models/tripilot.models';
import { ItineraryCardComponent } from '../itinerary/itinerary-card.component';
import { ItineraryMapComponent, MapPin } from '../itinerary/itinerary-map.component';

/** Standalone read-only public itinerary view (/s/:shareToken). */
@Component({
  selector: 'app-public-share-page',
  imports: [TranslatePipe, ItineraryCardComponent, ItineraryMapComponent],
  template: `
    @if (trip(); as publicTrip) {
      <div class="public-wrap">
        <header class="public-header">
          <span class="badge">{{ 'share.publicBadge' | t }}</span>
          <h1>{{ publicTrip.title }}</h1>
          <p class="dates tabular-nums">{{ publicTrip.start_date }} — {{ publicTrip.end_date }}</p>
        </header>

        <div class="day-strip">
          @for (day of publicTrip.days; track day.id) {
            <button
              type="button"
              class="day-pill tabular-nums"
              [class.active]="selectedDayIndex() === day.day_index"
              (click)="selectedDayIndex.set(day.day_index)"
            >
              Day {{ day.day_index }} · {{ day.date.slice(5) }}
            </button>
          }
        </div>

        <div class="public-grid">
          <div class="timeline">
            @for (item of activeItems(); track item.id) {
              <app-itinerary-card [item]="item" [readOnly]="true" />
            }
          </div>
          @if (mapPins().length > 0) {
            <div class="map-box">
              <app-itinerary-map [pins]="mapPins()" />
            </div>
          }
        </div>
      </div>
    } @else if (error()) {
      <div class="public-wrap">
        <p>{{ error() }}</p>
      </div>
    } @else {
      <div class="public-wrap">
        <p>{{ 'common.loading' | t }}</p>
      </div>
    }
  `,
  styles: `
    .public-wrap {
      max-width: 1080px;
      margin: 0 auto;
      padding: var(--space-5) var(--space-4);
    }
    .public-header {
      padding: var(--space-5);
      margin-bottom: var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--color-primary);
      color: #ffffff;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      margin-bottom: 8px;
      border-radius: var(--radius-pill);
      background: rgba(200, 155, 91, 0.22);
      color: var(--color-accent);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .public-header h1 {
      margin: 0 0 4px;
      font-size: 1.5rem;
    }
    .dates {
      margin: 0;
      opacity: 0.8;
      font-size: 0.875rem;
    }
    .day-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      margin-bottom: var(--space-4);
    }
    .day-pill {
      padding: 8px 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .day-pill.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
    }
    .public-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }
    .timeline {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .map-box {
      height: 440px;
    }
    @media (min-width: 1024px) {
      .public-grid {
        grid-template-columns: 1fr 1fr;
      }
      .map-box {
        position: sticky;
        top: var(--space-4);
        height: 70dvh;
      }
    }
  `,
})
export class PublicSharePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(TripilotApiService);

  protected readonly trip = signal<PublicTrip | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedDayIndex = signal(1);

  protected readonly activeItems = computed(() => {
    const t = this.trip();
    if (!t) return [];
    const day = t.days.find((d) => d.day_index === this.selectedDayIndex()) ?? t.days[0];
    const opt = day?.options.find((o) => o.id === day.active_option_id) ?? day?.options[0];
    return (opt?.items ?? []).filter((i) => i.is_selected !== false);
  });

  protected readonly mapPins = computed<MapPin[]>(() => {
    let idx = 1;
    return this.activeItems()
      .filter((i) => i.latitude !== null && i.longitude !== null)
      .map((i) => ({
        id: i.id,
        order: idx++,
        title: i.title,
        lat: i.latitude!,
        lng: i.longitude!,
        type: i.type,
      }));
  });

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('shareToken');
    if (!token) {
      this.error.set('Invalid share link.');
      return;
    }
    try {
      const data = await this.api.getPublicTrip(token);
      this.trip.set(data);
    } catch {
      this.error.set('Share link not found or revoked.');
    }
  }
}
