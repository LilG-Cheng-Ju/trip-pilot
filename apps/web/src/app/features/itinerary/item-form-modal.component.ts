import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  CreateItemPayload,
  TripilotApiService,
} from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  ItemType,
  ItineraryItem,
  PlaceCandidate,
} from '../../core/models/tripilot.models';
import { AppModalComponent } from '../../shared/modal.component';
import { AppTimeInputComponent } from '../../shared/time-input.component';

export interface ItemFormSubmitEvent {
  editingItemId: string | null;
  payload: CreateItemPayload;
}

/** Unified modal for adding, editing, or adding a slot-level alternative item. */
@Component({
  selector: 'app-item-form-modal',
  imports: [FormsModule, TranslatePipe, AppModalComponent, AppTimeInputComponent],
  template: `
    <app-modal [open]="open()" [title]="modalTitle() | t" (closed)="closed.emit()">
      <form class="modal-form" (ngSubmit)="submit()" novalidate>
        <div class="two-col">
          <label class="field">
            <span>{{ 'itinerary.form.type' | t }}</span>
            <select [(ngModel)]="itemType" name="itemType">
              <option value="SPOT">{{ 'item.type.spot' | t }}</option>
              <option value="FOOD">{{ 'item.type.food' | t }}</option>
              <option value="STAY">{{ 'item.type.stay' | t }}</option>
              <option value="FLIGHT">{{ 'item.type.flight' | t }}</option>
              <option value="RESERVED_TRANSIT">{{ 'item.type.reservedTransit' | t }}</option>
              <option value="LOCAL_TRANSIT">{{ 'item.type.localTransit' | t }}</option>
            </select>
          </label>
          <label class="field" [class.has-error]="titleError()">
            <span>{{ 'itinerary.form.title' | t }} <em class="req">*</em></span>
            <input
              type="text"
              [(ngModel)]="itemTitle"
              name="itemTitle"
              (ngModelChange)="titleError.set(false)"
            />
            @if (titleError()) {
              <small class="err-msg">{{ 'itinerary.form.errTitle' | t }}</small>
            }
          </label>
        </div>

        <div class="two-col">
          <div class="field">
            <span>{{ 'itinerary.form.startTime' | t }}</span>
            <app-time-input [value]="startTime" (valueChange)="startTime = $event" />
          </div>
          <div class="field">
            <span>{{ 'itinerary.form.endTime' | t }}</span>
            <app-time-input [value]="endTime" (valueChange)="endTime = $event" />
          </div>
        </div>

        @if (itemType === 'FLIGHT') {
          <div class="two-col">
            <label class="field">
              <span>{{ 'itinerary.form.flightNo' | t }}</span>
              <input type="text" [(ngModel)]="flightNo" name="flightNo" placeholder="NH852" />
            </label>
            <label class="field">
              <span>{{ 'itinerary.form.bookingRef' | t }}</span>
              <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
            </label>
            <label class="field">
              <span>{{ 'itinerary.form.originIata' | t }}</span>
              <input type="text" [(ngModel)]="originIata" name="originIata" maxlength="3" placeholder="TSA" />
            </label>
            <label class="field">
              <span>{{ 'itinerary.form.destIata' | t }}</span>
              <input type="text" [(ngModel)]="destIata" name="destIata" maxlength="3" placeholder="HND" />
            </label>
          </div>
        } @else if (itemType === 'RESERVED_TRANSIT') {
          <div class="two-col">
            <label class="field">
              <span>{{ 'itinerary.form.trainLine' | t }}</span>
              <input type="text" [(ngModel)]="trainLine" name="trainLine" />
            </label>
            <label class="field">
              <span>{{ 'itinerary.form.seat' | t }}</span>
              <input type="text" [(ngModel)]="seat" name="seat" />
            </label>
          </div>
          <label class="field">
            <span>{{ 'itinerary.form.bookingRef' | t }}</span>
            <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
          </label>
        } @else if (itemType === 'LOCAL_TRANSIT') {
          <label class="field">
            <span>{{ 'itinerary.form.transitMin' | t }}</span>
            <input type="number" [(ngModel)]="transitMin" name="transitMin" min="1" />
          </label>
        } @else {
          <div class="place-picker">
            <label class="field">
              <span>{{ 'itinerary.place.label' | t }}</span>
              <div class="place-input-row">
                <input
                  type="text"
                  [(ngModel)]="placeQuery"
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
                  <span>{{ isUrlInput() ? ('itinerary.place.resolve' | t) : ('itinerary.place.search' | t) }}</span>
                </button>
              </div>
            </label>

            @if (pinnedPlace(); as pinned) {
              <div class="pinned-badge">
                <div class="pinned-info">
                  <span class="ms-icon sm pin-ico">location_on</span>
                  <div>
                    <strong>{{ 'itinerary.place.selected' | t }}: {{ pinned.name }}</strong>
                    @if (pinned.address) {
                      <p>{{ pinned.address }}</p>
                    }
                  </div>
                </div>
                <button type="button" class="pill-btn" (click)="pinnedPlace.set(null)">
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

          @if (itemType === 'STAY') {
            <div class="two-col">
              <label class="field">
                <span>{{ 'itinerary.form.bookingRef' | t }}</span>
                <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
              </label>
              <label class="field">
                <span>{{ 'itinerary.form.freeCancel' | t }}</span>
                <input type="text" [(ngModel)]="freeCancel" name="freeCancel" placeholder="Nov 20" />
              </label>
            </div>
          }
        }

        <label class="field">
          <span>{{ 'itinerary.form.notes' | t }}</span>
          <input type="text" [(ngModel)]="notes" name="notes" />
        </label>

        <div class="actions">
          <button type="button" class="pill-btn" (click)="closed.emit()">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="btn-primary">{{ 'common.save' | t }}</button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .modal-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .field input,
    .field select {
      padding: 9px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
    }
    .field.has-error input {
      border-color: var(--color-alert);
      background: var(--color-alert-soft);
    }
    .req {
      color: var(--color-alert);
      font-style: normal;
      font-weight: 700;
    }
    .err-msg {
      color: var(--color-alert);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .place-picker {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .place-input-row {
      display: flex;
      gap: 6px;
    }
    .place-input-row input {
      flex: 1;
      background: var(--color-surface);
    }
    .place-hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
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
      cursor: pointer;
    }
    .btn-primary {
      padding: 8px 18px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `,
})
export class ItemFormModalComponent {
  private readonly api = inject(TripilotApiService);
  private readonly i18n = inject(I18nService);

  readonly open = input(false);
  readonly editingItem = input<ItineraryItem | null>(null);
  readonly alternativeFor = input<ItineraryItem | null>(null);

  readonly closed = output<void>();
  readonly saved = output<ItemFormSubmitEvent>();

  protected readonly titleError = signal(false);
  protected readonly searchingPlaces = signal(false);
  protected readonly placeSearchError = signal(false);
  protected readonly placeCandidates = signal<PlaceCandidate[]>([]);
  protected readonly pinnedPlace = signal<PlaceCandidate | null>(null);

  protected itemType: ItemType = 'SPOT';
  protected itemTitle = '';
  protected startTime = '';
  protected endTime = '';
  protected placeQuery = '';
  protected notes = '';
  protected flightNo = '';
  protected originIata = '';
  protected destIata = '';
  protected bookingRef = '';
  protected trainLine = '';
  protected seat = '';
  protected transitMin: number | null = 15;
  protected freeCancel = '';

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const edit = this.editingItem();
      const alt = this.alternativeFor();

      this.titleError.set(false);
      this.placeSearchError.set(false);
      this.placeCandidates.set([]);
      this.placeQuery = '';

      if (edit) {
        this.itemType = edit.type;
        this.itemTitle = edit.title;
        this.startTime = edit.start_time ?? '';
        this.endTime = edit.end_time ?? '';
        this.notes = edit.notes ?? '';
        const d = edit.details ?? {};
        this.flightNo = String(d['flight_number'] ?? '');
        this.originIata = String(d['origin_iata'] ?? '');
        this.destIata = String(d['dest_iata'] ?? '');
        this.bookingRef = String(d['booking_ref'] ?? d['confirmation_code'] ?? '');
        this.trainLine = String(d['line_or_train_no'] ?? '');
        this.seat = String(d['seat'] ?? '');
        this.transitMin = d['duration_minutes'] ? Number(d['duration_minutes']) : 15;
        this.freeCancel = String(d['free_cancellation_deadline'] ?? '');

        if (edit.latitude !== null && edit.longitude !== null) {
          this.pinnedPlace.set({
            name: edit.title,
            address: edit.address,
            latitude: edit.latitude,
            longitude: edit.longitude,
            google_maps_url: edit.google_maps_url,
            provider: 'existing',
          });
        } else {
          this.pinnedPlace.set(null);
        }
      } else {
        this.itemType = alt ? alt.type : 'SPOT';
        this.itemTitle = '';
        this.startTime = alt?.start_time ?? '';
        this.endTime = alt?.end_time ?? '';
        this.notes = '';
        this.flightNo = '';
        this.originIata = '';
        this.destIata = '';
        this.bookingRef = '';
        this.trainLine = '';
        this.seat = '';
        this.transitMin = 15;
        this.freeCancel = '';
        this.pinnedPlace.set(null);
      }
    });
  }

  protected modalTitle():
    | 'itinerary.editItem'
    | 'itinerary.choice.modalTitle'
    | 'itinerary.addItem' {
    if (this.editingItem()) return 'itinerary.editItem';
    if (this.alternativeFor()) return 'itinerary.choice.modalTitle';
    return 'itinerary.addItem';
  }

  protected isUrlInput(): boolean {
    const q = this.placeQuery.trim().toLowerCase();
    return q.startsWith('http://') || q.startsWith('https://');
  }

  protected async searchOrResolvePlace(): Promise<void> {
    const q = this.placeQuery.trim();
    if (!q) return;

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
    this.pinnedPlace.set(cand);
    this.placeCandidates.set([]);
    if (!this.itemTitle.trim()) {
      this.itemTitle = cand.name;
    }
  }

  protected submit(): void {
    if (!this.itemTitle.trim()) {
      this.titleError.set(true);
      return;
    }
    const details: Record<string, unknown> = {};
    if (this.itemType === 'FLIGHT') {
      if (this.flightNo) details['flight_number'] = this.flightNo.trim();
      if (this.originIata) details['origin_iata'] = this.originIata.trim().toUpperCase();
      if (this.destIata) details['dest_iata'] = this.destIata.trim().toUpperCase();
      if (this.bookingRef) details['booking_ref'] = this.bookingRef.trim();
    } else if (this.itemType === 'RESERVED_TRANSIT') {
      if (this.trainLine) details['line_or_train_no'] = this.trainLine.trim();
      if (this.seat) details['seat'] = this.seat.trim();
      if (this.bookingRef) details['booking_ref'] = this.bookingRef.trim();
    } else if (this.itemType === 'LOCAL_TRANSIT') {
      if (this.transitMin) details['duration_minutes'] = this.transitMin;
    } else if (this.itemType === 'STAY') {
      if (this.bookingRef) details['confirmation_code'] = this.bookingRef.trim();
      if (this.freeCancel) details['free_cancellation_deadline'] = this.freeCancel.trim();
    }

    const pinned = this.pinnedPlace();
    this.saved.emit({
      editingItemId: this.editingItem()?.id ?? null,
      payload: {
        type: this.itemType,
        title: this.itemTitle.trim(),
        start_time: this.startTime || null,
        end_time: this.endTime || null,
        address: pinned?.address ?? null,
        latitude: pinned?.latitude ?? null,
        longitude: pinned?.longitude ?? null,
        google_maps_url: pinned?.google_maps_url ?? null,
        notes: this.notes.trim() || null,
        details,
        alternative_for_item_id: this.editingItem()
          ? undefined
          : (this.alternativeFor()?.id ?? null),
      },
    });
  }
}
