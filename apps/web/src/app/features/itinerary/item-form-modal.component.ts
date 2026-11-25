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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import {
  CreateItemPayload,
  TripilotApiService,
} from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  ItemAttachment,
  ItemType,
  ItineraryItem,
  PlaceCandidate,
} from '../../core/models/tripilot.models';
import { readInputValue, readNumberValue } from '../../core/utils/form-events.utils';
import { extractItemAttachments } from '../../core/utils/travel-format.utils';
import { AppAirportPickerComponent } from '../../shared/airport-picker.component';
import { AppModalComponent } from '../../shared/modal.component';
import { AppTimeInputComponent } from '../../shared/time-input.component';

export interface ItemFormSubmitEvent {
  editingItemId: string | null;
  payload: CreateItemPayload;
}

/** Unified modal for adding, editing, or adding a slot-level alternative item. */
@Component({
  selector: 'app-item-form-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    MatFormFieldModule,
    MatSelectModule,
    AppAirportPickerComponent,
    AppModalComponent,
    AppTimeInputComponent,
  ],
  template: `
    <app-modal [open]="open()" [title]="modalTitle() | t" (closed)="closed.emit()">
      <form class="modal-form" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="two-col">
          <div class="field">
            <span>{{ 'itinerary.form.type' | t }}</span>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-select
                [value]="itemType()"
                (selectionChange)="onItemTypeChange($event.value)"
                name="itemType"
                [aria-label]="'itinerary.form.type' | t"
              >
                <mat-option value="SPOT">{{ 'item.type.spot' | t }}</mat-option>
                <mat-option value="FOOD">{{ 'item.type.food' | t }}</mat-option>
                <mat-option value="STAY">{{ 'item.type.stay' | t }}</mat-option>
                <mat-option value="FLIGHT">{{ 'item.type.flight' | t }}</mat-option>
                <mat-option value="RESERVED_TRANSIT">
                  {{ 'item.type.reservedTransit' | t }}
                </mat-option>
                <mat-option value="LOCAL_TRANSIT">
                  {{ 'item.type.localTransit' | t }}
                </mat-option>
              </mat-select>
            </mat-form-field>
          </div>
          <label class="field" [class.has-error]="titleError()">
            <span>{{ 'itinerary.form.title' | t }} <em class="req">*</em></span>
            <input
              type="text"
              [value]="itemTitle()"
              (input)="itemTitle.set(readInputValue($event)); titleError.set(false)"
              name="itemTitle"
            />
            @if (titleError()) {
              <small class="err-msg">{{ 'itinerary.form.errTitle' | t }}</small>
            }
          </label>
        </div>

        <div class="two-col">
          <div class="field">
            <span>{{ 'itinerary.form.startTime' | t }}</span>
            <app-time-input [value]="startTime()" (valueChange)="startTime.set($event)" />
          </div>
          <div class="field">
            <span>{{ 'itinerary.form.endTime' | t }}</span>
            <app-time-input [value]="endTime()" (valueChange)="endTime.set($event)" />
          </div>
        </div>

        @if (itemType() === 'FLIGHT') {
          <label class="field">
            <span>{{ 'itinerary.form.flightNo' | t }}</span>
            <input
              type="text"
              [value]="flightNo()"
              (input)="flightNo.set(readInputValue($event))"
              name="flightNo"
              placeholder="NH852"
            />
          </label>
          <div class="two-col flight-airports">
            <app-airport-picker
              inputId="flight-origin-iata"
              [label]="'itinerary.form.originIata' | t"
              [placeholder]="'airportPicker.placeholder' | t"
              [value]="originIata()"
              (valueChange)="originIata.set($event)"
            />
            <app-airport-picker
              inputId="flight-dest-iata"
              [label]="'itinerary.form.destIata' | t"
              [placeholder]="'airportPicker.placeholder' | t"
              [value]="destIata()"
              (valueChange)="destIata.set($event)"
            />
          </div>
        } @else if (itemType() === 'LOCAL_TRANSIT') {
          <label class="field">
            <span>{{ 'itinerary.form.transitMin' | t }}</span>
            <input
              type="number"
              [value]="transitMin() ?? ''"
              (input)="transitMin.set(readNumberValue($event, transitMin()))"
              name="transitMin"
              min="1"
            />
          </label>
        } @else {
          @if (itemType() === 'RESERVED_TRANSIT') {
            <div class="two-col">
              <label class="field">
                <span>{{ 'itinerary.form.trainLine' | t }}</span>
                <input
                  type="text"
                  [value]="trainLine()"
                  (input)="trainLine.set(readInputValue($event))"
                  name="trainLine"
                />
              </label>
              <label class="field">
                <span>{{ 'itinerary.form.seat' | t }}</span>
                <input
                  type="text"
                  [value]="seat()"
                  (input)="seat.set(readInputValue($event))"
                  name="seat"
                />
              </label>
            </div>
          }

          <div class="place-picker">
            <label class="field">
              <span>{{ 'itinerary.place.label' | t }}</span>
              <div class="place-input-row">
                <input
                  type="text"
                  [value]="placeQuery()"
                  (input)="placeQuery.set(readInputValue($event))"
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
                    @if (address().trim()) {
                      <p>{{ address().trim() }}</p>
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

          @if (showAddress()) {
            <label class="field">
              <span>{{ 'itinerary.form.address' | t }}</span>
              <input
                type="text"
                [value]="address()"
                (input)="address.set(readInputValue($event))"
                name="address"
                [placeholder]="'itinerary.form.addressPlaceholder' | t"
              />
            </label>
          }

          @if (showLocalName()) {
            <label class="field">
              <span>{{ 'itinerary.form.localName' | t }}</span>
              <input
                type="text"
                [value]="localName()"
                (input)="localName.set(readInputValue($event))"
                name="localName"
                [placeholder]="'itinerary.form.localNamePlaceholder' | t"
              />
            </label>
          }
        }

        @if (supportsBookingFields() && (showBookingRef() || showFreeCancel())) {
          <div class="two-col">
            @if (showBookingRef()) {
              <label class="field">
                <span>{{ 'itinerary.form.bookingRef' | t }}</span>
                <input
                  type="text"
                  [value]="bookingRef()"
                  (input)="bookingRef.set(readInputValue($event))"
                  name="bookingRef"
                />
              </label>
            }
            @if (showFreeCancel()) {
              <label class="field">
                <span>{{ 'itinerary.form.freeCancel' | t }}</span>
                <input
                  type="text"
                  [value]="freeCancel()"
                  (input)="freeCancel.set(readInputValue($event))"
                  name="freeCancel"
                  placeholder="2027-01-28 23:59"
                />
              </label>
            }
          </div>
        }

        @if (showNotes()) {
          <label class="field">
            <span>{{ 'itinerary.form.notes' | t }}</span>
            <input
              type="text"
              [value]="notes()"
              (input)="notes.set(readInputValue($event))"
              name="notes"
            />
          </label>
        }

        @if (showAttachments()) {
          <div class="attachments-box">
            <div class="att-head">
              <span class="att-title">
                <span class="ms-icon sm" aria-hidden="true">attach_file</span>
                {{ 'item.attachmentsTitle' | t }}
              </span>
              <small class="place-hint">{{ 'item.attachmentsHint' | t }}</small>
            </div>

            @if (attachments().length > 0) {
              <div class="att-list">
                @for (att of attachments(); track $index) {
                  <div class="att-row">
                    <span class="ms-icon sm att-ico" aria-hidden="true">link</span>
                    <a
                      [href]="att.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="att-link"
                    >
                      {{ att.name }}
                    </a>
                    <button
                      type="button"
                      class="att-remove"
                      (click)="removeAttachment($index)"
                      [attr.aria-label]="'item.attachmentRemove' | t"
                    >
                      <span class="ms-icon sm">close</span>
                    </button>
                  </div>
                }
              </div>
            }

            <div class="att-inputs">
              <input
                type="text"
                [value]="attachmentName()"
                (input)="attachmentName.set(readInputValue($event))"
                name="attachmentName"
                [placeholder]="'item.attachmentNamePlaceholder' | t"
              />
              <div class="place-input-row">
                <input
                  type="url"
                  [value]="attachmentUrl()"
                  (input)="attachmentUrl.set(readInputValue($event))"
                  name="attachmentUrl"
                  [placeholder]="'item.attachmentUrlPlaceholder' | t"
                  (keydown.enter)="$event.preventDefault(); addAttachment()"
                />
                <button
                  type="button"
                  class="pill-btn"
                  [disabled]="resolvingAttachment()"
                  (click)="addAttachment()"
                >
                  {{ resolvingAttachment() ? '...' : '+ ' + ('item.attachmentAdd' | t) }}
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Progressive Disclosure: Optional field toggle chips -->
        <div class="optional-chips">
          @if (itemType() !== 'FLIGHT' && itemType() !== 'LOCAL_TRANSIT' && !showAddress()) {
            <button type="button" class="optional-chip" (click)="showAddress.set(true)">
              {{ 'detail.optionalAdd.address' | t }}
            </button>
          }
          @if (supportsBookingFields() && !showBookingRef()) {
            <button type="button" class="optional-chip" (click)="showBookingRef.set(true)">
              {{ 'detail.optionalAdd.bookingRef' | t }}
            </button>
          }
          @if (supportsBookingFields() && !showFreeCancel()) {
            <button type="button" class="optional-chip" (click)="showFreeCancel.set(true)">
              {{ 'detail.optionalAdd.freeCancel' | t }}
            </button>
          }
          @if (itemType() !== 'FLIGHT' && itemType() !== 'LOCAL_TRANSIT' && !showLocalName()) {
            <button type="button" class="optional-chip" (click)="showLocalName.set(true)">
              {{ 'detail.optionalAdd.localName' | t }}
            </button>
          }
          @if (!showNotes()) {
            <button type="button" class="optional-chip" (click)="showNotes.set(true)">
              {{ 'detail.optionalAdd.notes' | t }}
            </button>
          }
          @if (!showAttachments()) {
            <button type="button" class="optional-chip" (click)="showAttachments.set(true)">
              {{ 'detail.optionalAdd.attachments' | t }}
            </button>
          }
        </div>

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
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--space-3);
    }
    @media (max-width: 480px) {
      .flight-airports {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .field input {
      height: 40px;
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
      font-weight: 600;
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
    .optional-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .optional-chip {
      display: inline-flex;
      align-items: center;
      padding: 5px 11px;
      border: 1px solid var(--color-border-soft);
      border-radius: var(--radius-sm);
      background: var(--color-surface-alt);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.76rem;
      font-weight: 500;
      cursor: pointer;
      transition: border-color 140ms ease, color 140ms ease, background-color 140ms ease;
    }
    .optional-chip:hover,
    .optional-chip:focus-visible {
      border-color: var(--color-border-strong);
      color: var(--color-primary);
      background: var(--color-surface);
    }
    .btn-primary {
      padding: 8px 18px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
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
    .attachments-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .att-head {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .att-title {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .att-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .att-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      font-size: 0.8rem;
    }
    .att-ico {
      color: var(--color-accent);
      flex-shrink: 0;
    }
    .att-link {
      flex: 1;
      min-width: 0;
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .att-link:hover {
      text-decoration: underline;
    }
    .att-remove {
      display: inline-flex;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 2px;
    }
    .att-inputs {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .att-inputs input {
      padding: 8px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.8125rem;
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
  protected readonly attachments = signal<ItemAttachment[]>([]);
  protected readonly resolvingAttachment = signal(false);
  protected readonly showAddress = signal(false);
  protected readonly showBookingRef = signal(false);
  protected readonly showFreeCancel = signal(false);
  protected readonly showLocalName = signal(false);
  protected readonly showNotes = signal(false);
  protected readonly showAttachments = signal(false);
  protected readonly readInputValue = readInputValue;
  protected readonly readNumberValue = readNumberValue;

  protected readonly itemType = signal<ItemType>('SPOT');
  protected readonly itemTitle = signal('');
  protected readonly address = signal('');
  protected readonly startTime = signal('');
  protected readonly endTime = signal('');
  protected readonly placeQuery = signal('');
  protected readonly notes = signal('');
  protected readonly flightNo = signal('');
  protected readonly originIata = signal('');
  protected readonly destIata = signal('');
  protected readonly bookingRef = signal('');
  protected readonly trainLine = signal('');
  protected readonly seat = signal('');
  protected readonly transitMin = signal<number | null>(15);
  protected readonly freeCancel = signal('');
  protected readonly localName = signal('');
  protected readonly attachmentName = signal('');
  protected readonly attachmentUrl = signal('');

  protected readonly modalTitle = computed<
    'itinerary.editItem' | 'itinerary.choice.modalTitle' | 'itinerary.addItem'
  >(() => {
    if (this.editingItem()) return 'itinerary.editItem';
    if (this.alternativeFor()) return 'itinerary.choice.modalTitle';
    return 'itinerary.addItem';
  });

  protected readonly isUrlInput = computed(() => {
    const q = this.placeQuery().trim().toLowerCase();
    return q.startsWith('http://') || q.startsWith('https://');
  });

  protected readonly supportsBookingFields = computed(() => {
    const t = this.itemType();
    return t === 'STAY' || t === 'FLIGHT' || t === 'RESERVED_TRANSIT';
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const edit = this.editingItem();
      const alt = this.alternativeFor();

      untracked(() => {
        this.titleError.set(false);
        this.placeSearchError.set(false);
        this.placeCandidates.set([]);
        this.placeQuery.set('');
        this.attachmentName.set('');
        this.attachmentUrl.set('');

        if (edit) {
          this.itemType.set(edit.type);
          this.itemTitle.set(edit.title);
          const editAddress = edit.address ?? '';
          this.address.set(editAddress);
          this.startTime.set(edit.start_time ?? '');
          this.endTime.set(edit.end_time ?? '');
          const editNotes = edit.notes ?? '';
          this.notes.set(editNotes);
          const d = edit.details ?? {};
          this.flightNo.set(String(d['flight_number'] ?? ''));
          this.originIata.set(String(d['origin_iata'] ?? ''));
          this.destIata.set(String(d['dest_iata'] ?? ''));
          const ref = String(d['booking_ref'] ?? d['confirmation_code'] ?? '');
          this.bookingRef.set(ref);
          this.trainLine.set(String(d['line_or_train_no'] ?? ''));
          this.seat.set(String(d['seat'] ?? ''));
          this.transitMin.set(d['duration_minutes'] ? Number(d['duration_minutes']) : 15);
          const cancel = String(d['free_cancellation_deadline'] ?? '');
          this.freeCancel.set(cancel);
          const local = String(d['local_name'] ?? '');
          this.localName.set(local);
          const parsedAttachments = extractItemAttachments(d, (url) =>
            this.deriveAttachmentName(url),
          );
          this.attachments.set(parsedAttachments);

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
          this.showAddress.set(Boolean(editAddress));
          this.showBookingRef.set(Boolean(ref));
          this.showFreeCancel.set(Boolean(cancel));
          this.showLocalName.set(Boolean(local));
          this.showNotes.set(Boolean(editNotes));
          this.showAttachments.set(parsedAttachments.length > 0);
        } else {
          this.itemType.set(alt ? alt.type : 'SPOT');
          this.itemTitle.set('');
          this.address.set('');
          this.startTime.set(alt?.start_time ?? '');
          this.endTime.set(alt?.end_time ?? '');
          this.notes.set('');
          this.flightNo.set('');
          this.originIata.set('');
          this.destIata.set('');
          this.bookingRef.set('');
          this.trainLine.set('');
          this.seat.set('');
          this.transitMin.set(15);
          this.freeCancel.set('');
          this.localName.set('');
          this.pinnedPlace.set(null);
          this.attachments.set([]);
          this.showAddress.set(false);
          this.showBookingRef.set(false);
          this.showFreeCancel.set(false);
          this.showLocalName.set(false);
          this.showNotes.set(false);
          this.showAttachments.set(false);
        }
      });
    });
  }

  protected onItemTypeChange(next: ItemType): void {
    this.itemType.set(next);
  }

  protected async searchOrResolvePlace(): Promise<void> {
    const q = this.placeQuery().trim();
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
    if (!this.itemTitle().trim()) {
      this.itemTitle.set(cand.name);
    }
    if (cand.address) {
      this.address.set(cand.address);
      this.showAddress.set(true);
    }
  }

  protected async addAttachment(): Promise<void> {
    let rawUrl = this.attachmentUrl().trim();
    if (!rawUrl) {
      return;
    }
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = `https://${rawUrl}`;
    }
    let label = this.attachmentName().trim();
    if (!label) {
      const directFile = this.extractUrlFilename(rawUrl);
      if (directFile) {
        label = directFile;
      } else {
        this.resolvingAttachment.set(true);
        try {
          const resolved = await this.api.resolveLinkTitle(rawUrl);
          label = resolved.title?.trim() || this.deriveAttachmentName(rawUrl);
        } catch {
          label = this.deriveAttachmentName(rawUrl);
        } finally {
          this.resolvingAttachment.set(false);
        }
      }
    }
    this.attachments.update((list) => [...list, { name: label, url: rawUrl }]);
    this.attachmentName.set('');
    this.attachmentUrl.set('');
  }

  protected removeAttachment(index: number): void {
    this.attachments.update((list) => list.filter((_, i) => i !== index));
  }

  private extractUrlFilename(rawUrl: string): string | null {
    try {
      const parsed = new URL(rawUrl);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const last = segments.length > 0 ? decodeURIComponent(segments[segments.length - 1]) : '';
      const generic = new Set(['view', 'edit', 'open', 'uc', 'd', 'preview', 'share', 'download']);
      if (last && !generic.has(last.toLowerCase()) && last.includes('.')) {
        return last;
      }
      return null;
    } catch {
      return null;
    }
  }

  private deriveAttachmentName(rawUrl: string): string {
    const directFile = this.extractUrlFilename(rawUrl);
    if (directFile) {
      return directFile;
    }
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      if (host.includes('drive.google.com') || host.includes('docs.google.com')) {
        return 'Google Drive';
      }
      if (host.includes('dropbox.com')) {
        return 'Dropbox';
      }
      if (host.includes('onedrive.live.com') || host.includes('1drv.ms')) {
        return 'OneDrive';
      }
      if (host.includes('icloud.com')) {
        return 'iCloud';
      }
      if (host.includes('notion.so') || host.includes('notion.site')) {
        return 'Notion';
      }
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'Attachment';
    }
  }

  protected submit(): void {
    const title = this.itemTitle().trim();
    if (!title) {
      this.titleError.set(true);
      return;
    }
    const type = this.itemType();
    const flightNo = this.flightNo().trim();
    const originIata = this.originIata().trim().toUpperCase();
    const destIata = this.destIata().trim().toUpperCase();
    const bookingRef = this.bookingRef().trim();
    const freeCancel = this.freeCancel().trim();
    const trainLine = this.trainLine().trim();
    const seat = this.seat().trim();
    const transitMin = this.transitMin();
    const localName = this.localName().trim();

    const details: Record<string, unknown> = {};
    if (type === 'FLIGHT') {
      if (flightNo) details['flight_number'] = flightNo;
      if (originIata) details['origin_iata'] = originIata;
      if (destIata) details['dest_iata'] = destIata;
      if (bookingRef) details['booking_ref'] = bookingRef;
      if (freeCancel) details['free_cancellation_deadline'] = freeCancel;
    } else if (type === 'RESERVED_TRANSIT') {
      if (trainLine) details['line_or_train_no'] = trainLine;
      if (seat) details['seat'] = seat;
      if (bookingRef) details['booking_ref'] = bookingRef;
      if (freeCancel) details['free_cancellation_deadline'] = freeCancel;
    } else if (type === 'LOCAL_TRANSIT') {
      if (transitMin) details['duration_minutes'] = transitMin;
    } else if (type === 'STAY') {
      if (bookingRef) details['confirmation_code'] = bookingRef;
      if (freeCancel) details['free_cancellation_deadline'] = freeCancel;
    }
    if (localName) {
      details['local_name'] = localName;
    }
    const finalAttachments = [...this.attachments()];
    const pendingUrl = this.attachmentUrl().trim();
    if (pendingUrl) {
      const normalized =
        pendingUrl.startsWith('http://') || pendingUrl.startsWith('https://')
          ? pendingUrl
          : `https://${pendingUrl}`;
      finalAttachments.push({
        name: this.attachmentName().trim() || this.deriveAttachmentName(normalized),
        url: normalized,
      });
    }
    if (finalAttachments.length > 0) {
      details['attachments'] = finalAttachments;
    }

    const pinned = this.pinnedPlace();
    this.saved.emit({
      editingItemId: this.editingItem()?.id ?? null,
      payload: {
        type,
        title,
        start_time: this.startTime() || null,
        end_time: this.endTime() || null,
        address: this.address().trim() || null,
        latitude: pinned?.latitude ?? null,
        longitude: pinned?.longitude ?? null,
        google_maps_url: pinned?.google_maps_url ?? null,
        notes: this.notes().trim() || null,
        details,
        alternative_for_item_id: this.editingItem()
          ? undefined
          : (this.alternativeFor()?.id ?? null),
      },
    });
  }
}
