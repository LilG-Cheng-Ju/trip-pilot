import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PlaceCandidate } from '../../core/models/tripilot.models';
import { readInputValue } from '../../core/utils/form-events.utils';

const GOOGLE_MAPS_URL_RE =
  /^https?:\/\/(maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?\/maps\S*)$/i;

/** Return true when input looks like a shareable Google Maps URL or short link. */
export function isGoogleMapsUrl(raw: string): boolean {
  return GOOGLE_MAPS_URL_RE.test(raw.trim());
}

/** Place search and auto-resolving Google Maps URL picker for itinerary items. */
@Component({
  selector: 'app-item-place-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="place-picker">
      <label class="field">
        <span>{{ 'itinerary.place.label' | t }}</span>
        <div class="place-input-row">
          <input
            type="text"
            [value]="placeQuery()"
            (input)="onPlaceInput($event)"
            (paste)="onPlacePaste($event)"
            name="placeQuery"
            [placeholder]="'itinerary.place.placeholder' | t"
            (keydown.enter)="$event.preventDefault(); searchOrResolvePlace()"
          />
          <button
            type="button"
            class="pill-btn"
            [disabled]="searchingPlaces()"
            (click)="searchOrResolvePlace()"
          >
            <span class="ms-icon sm" aria-hidden="true">
              {{ isUrlInput() ? 'link' : 'search' }}
            </span>
            <span>{{ actionLabelKey() | t }}</span>
          </button>
        </div>
      </label>

      @if (pinnedPlace(); as pinned) {
        <div class="pinned-badge">
          <div class="pinned-info">
            <span class="ms-icon sm pin-ico" aria-hidden="true">location_on</span>
            <div>
              <strong>{{ 'itinerary.place.selected' | t }}: {{ pinned.name }}</strong>
              @if (pinnedAddress().trim()) {
                <p>{{ pinnedAddress().trim() }}</p>
              }
            </div>
          </div>
          <button type="button" class="pill-btn" (click)="clearPin()">
            {{ 'itinerary.place.clear' | t }}
          </button>
        </div>
      } @else {
        <small class="place-hint">{{ 'itinerary.place.optionalHint' | t }}</small>
      }

      @if (placeSearchError()) {
        <small class="err-msg">{{ 'itinerary.place.notFound' | t }}</small>
      }

      @if (placeCandidates().length > 0) {
        <div class="candidate-list">
          @for (cand of placeCandidates(); track cand.latitude + ',' + cand.longitude) {
            <button type="button" class="candidate-row" (click)="selectPlaceCandidate(cand)">
              <strong>{{ cand.name }}</strong>
              @if (cand.address) {
                <span>{{ cand.address }}</span>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .place-picker {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .place-input-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .place-input-row input {
      flex: 1 1 160px;
      min-width: 0;
      background: var(--color-surface);
    }
    .place-hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .err-msg {
      color: var(--color-alert);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .pinned-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.8125rem;
    }
    .pinned-info {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      min-width: 0;
    }
    .pin-ico {
      color: var(--color-accent);
      margin-top: 2px;
    }
    .pinned-badge p {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }
    .candidate-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 180px;
      overflow-y: auto;
    }
    .candidate-row {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 8px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.8125rem;
      text-align: left;
      cursor: pointer;
    }
    .candidate-row:hover {
      border-color: var(--color-primary);
    }
    .candidate-row span {
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }
    .pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 7px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
      cursor: pointer;
    }
  `,
})
export class ItemPlacePickerComponent {
  private readonly api = inject(TripilotApiService);
  private readonly i18n = inject(I18nService);

  readonly pinnedPlace = input<PlaceCandidate | null>(null);
  readonly pinnedAddress = input('');
  readonly resetToken = input(0);

  readonly placeSelected = output<PlaceCandidate>();
  readonly pinCleared = output<void>();

  protected readonly placeQuery = signal('');
  protected readonly searchingPlaces = signal(false);
  protected readonly placeSearchError = signal(false);
  protected readonly placeCandidates = signal<PlaceCandidate[]>([]);
  private lastAutoResolvedUrl = '';

  protected readonly isUrlInput = computed(() => {
    const q = this.placeQuery().trim().toLowerCase();
    return q.startsWith('http://') || q.startsWith('https://');
  });

  protected readonly actionLabelKey = computed(() => {
    if (this.searchingPlaces() && this.isUrlInput()) {
      return 'itinerary.place.resolving';
    }
    return this.isUrlInput() ? 'itinerary.place.resolve' : 'itinerary.place.search';
  });

  constructor() {
    effect(() => {
      this.resetToken();
      untracked(() => {
        this.placeQuery.set('');
        this.placeCandidates.set([]);
        this.placeSearchError.set(false);
        this.searchingPlaces.set(false);
        this.lastAutoResolvedUrl = '';
      });
    });
  }

  protected onPlacePaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text')?.trim() ?? '';
    if (!pasted || !isGoogleMapsUrl(pasted)) {
      return;
    }
    event.preventDefault();
    this.placeQuery.set(pasted);
    this.placeSearchError.set(false);
    if (pasted !== this.lastAutoResolvedUrl) {
      this.lastAutoResolvedUrl = pasted;
      void this.searchOrResolvePlace();
    }
  }

  protected onPlaceInput(event: Event): void {
    const next = readInputValue(event);
    this.placeQuery.set(next);
    this.placeSearchError.set(false);
    const trimmed = next.trim();
    if (!trimmed) {
      this.lastAutoResolvedUrl = '';
      return;
    }
    // Mobile/autofill fallback when ClipboardEvent data is unavailable on paste.
    if (isGoogleMapsUrl(trimmed) && trimmed !== this.lastAutoResolvedUrl && !this.searchingPlaces()) {
      this.lastAutoResolvedUrl = trimmed;
      void this.searchOrResolvePlace();
    }
  }

  protected async searchOrResolvePlace(): Promise<void> {
    const q = this.placeQuery().trim();
    if (!q) {
      return;
    }

    this.searchingPlaces.set(true);
    this.placeSearchError.set(false);
    this.placeCandidates.set([]);

    try {
      if (this.isUrlInput()) {
        const resolved = await this.api.resolvePlaceUrl(q);
        this.selectPlaceCandidate(resolved);
      } else {
        const results = await this.api.searchPlaces(q, this.i18n.locale());
        if (results.length === 0) {
          this.placeSearchError.set(true);
        } else {
          this.placeCandidates.set(results);
        }
      }
    } catch {
      this.placeSearchError.set(true);
    } finally {
      this.searchingPlaces.set(false);
    }
  }

  protected selectPlaceCandidate(cand: PlaceCandidate): void {
    this.placeCandidates.set([]);
    this.placeSearchError.set(false);
    this.placeSelected.emit(cand);
  }

  protected clearPin(): void {
    this.pinCleared.emit();
  }
}
