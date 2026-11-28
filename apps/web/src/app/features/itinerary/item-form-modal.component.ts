import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { CreateItemPayload } from '../../core/api/tripilot-api.service';
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
import { AppSelectComponent, SelectOption } from '../../shared/select-input.component';
import { AppTimeInputComponent } from '../../shared/time-input.component';
import {
  deriveAttachmentName,
  ItemAttachmentsEditorComponent,
} from './item-attachments-editor.component';
import { ItemPlacePickerComponent } from './item-place-picker.component';
import { getItemTypeMeta, ITEM_TYPE_OPTIONS } from './item-type-meta';

export interface ItemFormSubmitEvent {
  editingItemId: string | null;
  payload: CreateItemPayload;
  addAnother: boolean;
}

const ADDED_BANNER_DURATION_MS = 4000;

/** Unified modal for adding, editing, or adding a slot-level alternative item. */
@Component({
  selector: 'app-item-form-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    AppAirportPickerComponent,
    AppModalComponent,
    AppSelectComponent,
    AppTimeInputComponent,
    ItemAttachmentsEditorComponent,
    ItemPlacePickerComponent,
  ],
  template: `
    <app-modal [open]="open()" [title]="modalTitle()" (closed)="closed.emit()">
      <form class="modal-form" (submit)="$event.preventDefault(); submit(false)" novalidate>
        @if (justAddedTitle(); as addedTitle) {
          <div class="added-banner" role="status">
            <span class="ms-icon sm" aria-hidden="true">check_circle</span>
            <span>{{ 'itinerary.form.addedBanner' | t: { title: addedTitle } }}</span>
          </div>
        }

        <div class="type-row">
          @if (changingType()) {
            <div class="field type-select-field">
              <span>{{ 'itinerary.form.type' | t }}</span>
              <app-select
                name="itemType"
                [ariaLabel]="'itinerary.form.type' | t"
                [options]="itemTypeOptions()"
                [value]="itemType()"
                (valueChange)="onItemTypeChange($event)"
              />
            </div>
          } @else {
            <div class="type-bar">
              <span class="type-badge">
                <span
                  class="ms-icon sm"
                  [style.color]="activeTypeMeta().color"
                  aria-hidden="true"
                >
                  {{ activeTypeMeta().icon }}
                </span>
                <span>{{ activeTypeMeta().labelKey | t }}</span>
              </span>
              <button
                type="button"
                class="type-switch-btn"
                (click)="changingType.set(true)"
              >
                {{ 'itinerary.form.changeType' | t }}
              </button>
            </div>
          }
        </div>

        @if (itemType() !== 'FLIGHT' && itemType() !== 'LOCAL_TRANSIT') {
          <app-item-place-picker
            [pinnedPlace]="pinnedPlace()"
            [pinnedAddress]="address()"
            [resetToken]="placeResetToken()"
            (placeSelected)="onPlaceSelected($event)"
            (pinCleared)="pinnedPlace.set(null)"
          />
        }

        <label class="field" [class.has-error]="titleError()">
          <span>{{ 'itinerary.form.title' | t }} <em class="req">*</em></span>
          <input
            type="text"
            [value]="itemTitle()"
            (input)="onTitleInput($event)"
            name="itemTitle"
          />
          @if (titleError()) {
            <small class="err-msg">{{ 'itinerary.form.errTitle' | t }}</small>
          }
        </label>

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
                  placeholder="JR Odoriko 13"
                />
              </label>
              <label class="field">
                <span>{{ 'itinerary.form.seat' | t }}</span>
                <input
                  type="text"
                  [value]="seat()"
                  (input)="seat.set(readInputValue($event))"
                  name="seat"
                  placeholder="4A"
                />
              </label>
            </div>
          }

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
          <app-item-attachments-editor
            [(attachments)]="attachments"
            [resetToken]="attachmentResetToken()"
          />
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
          @if (!editingItem() && !alternativeFor()) {
            <button
              type="button"
              class="btn-ghost add-another-btn"
              [disabled]="saving()"
              (click)="submit(true)"
            >
              {{ 'itinerary.form.saveAndAdd' | t }}
            </button>
          }
          <button type="submit" class="btn-primary" [disabled]="saving()">
            {{ saving() ? ('itinerary.form.saving' | t) : ('common.save' | t) }}
          </button>
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
    .added-banner {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-success-soft, #eaf6ef);
      color: var(--item-spot);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .type-row {
      display: flex;
      flex-direction: column;
    }
    .type-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-surface-alt);
      border: 1px solid var(--color-border-soft);
    }
    .type-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .type-switch-btn {
      padding: 3px 9px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
    }
    .type-switch-btn:hover,
    .type-switch-btn:focus-visible {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .type-select-field {
      width: 100%;
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
    .pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 7px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
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
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `,
})
export class ItemFormModalComponent {
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly attachmentsEditor = viewChild(ItemAttachmentsEditorComponent);

  readonly open = input(false);
  readonly initialType = input<ItemType>('SPOT');
  readonly editingItem = input<ItineraryItem | null>(null);
  readonly alternativeFor = input<ItineraryItem | null>(null);
  readonly saving = input(false);

  readonly closed = output<void>();
  readonly saved = output<ItemFormSubmitEvent>();

  protected readonly changingType = signal(false);
  protected readonly titleError = signal(false);
  protected readonly justAddedTitle = signal('');
  protected readonly pinnedPlace = signal<PlaceCandidate | null>(null);
  protected readonly attachments = signal<ItemAttachment[]>([]);
  protected readonly placeResetToken = signal(0);
  protected readonly attachmentResetToken = signal(0);
  protected readonly showAddress = signal(false);
  protected readonly showBookingRef = signal(false);
  protected readonly showFreeCancel = signal(false);
  protected readonly showLocalName = signal(false);
  protected readonly showNotes = signal(false);
  protected readonly showAttachments = signal(false);
  protected readonly readInputValue = readInputValue;
  protected readonly readNumberValue = readNumberValue;

  protected readonly itemType = signal<ItemType>('SPOT');
  protected readonly itemTypeOptions = computed<readonly SelectOption<ItemType>[]>(() =>
    ITEM_TYPE_OPTIONS.map((opt) => ({
      value: opt.type,
      label: this.i18n.t(opt.labelKey),
    })),
  );
  protected readonly activeTypeMeta = computed(() => getItemTypeMeta(this.itemType()));

  protected readonly itemTitle = signal('');
  protected readonly address = signal('');
  protected readonly startTime = signal('');
  protected readonly endTime = signal('');
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

  protected readonly modalTitle = computed(() => {
    if (this.editingItem()) {
      return this.i18n.t('itinerary.editItem');
    }
    if (this.alternativeFor()) {
      return this.i18n.t('itinerary.choice.modalTitle');
    }
    return this.i18n.t('itinerary.addItemTyped', {
      type: this.i18n.t(this.activeTypeMeta().labelKey),
    });
  });

  protected readonly supportsBookingFields = computed(() => {
    const t = this.itemType();
    return t === 'STAY' || t === 'FLIGHT' || t === 'RESERVED_TRANSIT';
  });

  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearBannerTimer());

    effect(() => {
      if (!this.open()) {
        untracked(() => {
          this.clearBannerTimer();
          this.justAddedTitle.set('');
          this.changingType.set(false);
        });
        return;
      }
      const edit = this.editingItem();
      const alt = this.alternativeFor();
      const requestedType = this.initialType();

      untracked(() => {
        this.clearBannerTimer();
        this.justAddedTitle.set('');
        this.changingType.set(false);
        this.titleError.set(false);
        this.placeResetToken.update((n) => n + 1);
        this.attachmentResetToken.update((n) => n + 1);

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
          const parsedAttachments = extractItemAttachments(d, deriveAttachmentName);
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
          this.resetBlankForm(
            alt ? alt.type : requestedType,
            alt?.start_time ?? '',
            alt?.end_time ?? '',
          );
        }
      });
    });
  }

  /** Clear fields for rapid sequential entry while keeping the current item type. */
  resetForNext(savedTitle: string, carryStartTime: string): void {
    this.resetBlankForm(this.itemType(), carryStartTime, '');
    this.placeResetToken.update((n) => n + 1);
    this.attachmentResetToken.update((n) => n + 1);
    this.justAddedTitle.set(savedTitle);
    this.clearBannerTimer();
    this.bannerTimer = setTimeout(() => {
      this.justAddedTitle.set('');
      this.bannerTimer = null;
    }, ADDED_BANNER_DURATION_MS);
  }

  protected onItemTypeChange(next: ItemType): void {
    this.itemType.set(next);
    this.changingType.set(false);
  }

  protected onTitleInput(event: Event): void {
    this.itemTitle.set(readInputValue(event));
    this.titleError.set(false);
    if (this.justAddedTitle()) {
      this.clearBannerTimer();
      this.justAddedTitle.set('');
    }
  }

  protected onPlaceSelected(cand: PlaceCandidate): void {
    this.pinnedPlace.set(cand);
    if (!this.itemTitle().trim()) {
      this.itemTitle.set(cand.name);
      this.titleError.set(false);
    }
    if (cand.address) {
      this.address.set(cand.address);
    }
  }

  protected submit(addAnother: boolean): void {
    if (this.saving()) {
      return;
    }
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

    const finalAttachments =
      this.attachmentsEditor()?.collectFinalAttachments() ?? [...this.attachments()];
    if (finalAttachments.length > 0) {
      details['attachments'] = finalAttachments;
    }

    const pinned = this.pinnedPlace();
    this.saved.emit({
      editingItemId: this.editingItem()?.id ?? null,
      addAnother,
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

  private resetBlankForm(nextType: ItemType, nextStartTime: string, nextEndTime: string): void {
    this.itemType.set(nextType);
    this.changingType.set(false);
    this.titleError.set(false);
    this.itemTitle.set('');
    this.address.set('');
    this.startTime.set(nextStartTime);
    this.endTime.set(nextEndTime);
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

  private clearBannerTimer(): void {
    if (this.bannerTimer !== null) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
  }
}
