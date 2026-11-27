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

import { TripUpdatePayload } from '../../core/api/tripilot-api.service';
import {
  DEFAULT_TRIP_DURATION_DAYS,
  MAX_TRIP_DURATION_DAYS,
  MIN_TRIP_DURATION_DAYS,
} from '../../core/constants/app-limits';
import {
  findCountry,
  SUPPORTED_CURRENCIES,
} from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TripStatus, TripSummary } from '../../core/models/tripilot.models';
import { isIncompleteNumberInput, readInputValue } from '../../core/utils/form-events.utils';
import {
  addDaysToIsoDate,
  formatLocalIsoDate,
} from '../../core/utils/travel-format.utils';
import { AppCountryPickerComponent } from '../../shared/country-picker.component';
import { AppDateInputComponent } from '../../shared/date-input.component';
import { AppModalComponent } from '../../shared/modal.component';
import { AppSelectComponent, SelectOption } from '../../shared/select-input.component';

type DateEndMode = 'end' | 'duration' | 'open';

export type TripFormSubmitEvent =
  | {
      mode: 'create';
      payload: {
        title: string;
        destination_summary: string | null;
        country_codes: string[];
        start_date: string;
        end_date: string;
        default_currency: string;
        notes: string | null;
      };
    }
  | {
      mode: 'edit';
      tripId: string;
      payload: TripUpdatePayload;
    };

/** Pure presentational modal for creating or editing a trip's metadata and date span. */
@Component({
  selector: 'app-trip-form-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    AppModalComponent,
    AppCountryPickerComponent,
    AppDateInputComponent,
    AppSelectComponent,
  ],
  template: `
    <app-modal
      [open]="open()"
      [title]="(editingTrip() ? 'trips.edit' : 'trips.new') | t"
      (closed)="closed.emit()"
    >
      <form class="modal-form" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="seg-row">
          <button
            type="button"
            class="seg-btn"
            [class.active]="scope() === 'domestic'"
            (click)="setScope('domestic')"
          >
            {{ 'trips.form.scopeDomestic' | t }}
          </button>
          <button
            type="button"
            class="seg-btn"
            [class.active]="scope() === 'international'"
            (click)="setScope('international')"
          >
            {{ 'trips.form.scopeInternational' | t }}
          </button>
        </div>

        <label class="field" [class.has-error]="titleError()">
          <span>{{ 'trips.form.title' | t }} <em class="req">*</em></span>
          <input
            type="text"
            [value]="title()"
            name="title"
            (input)="title.set(readInputValue($event)); titleError.set(null)"
            [placeholder]="
              (scope() === 'domestic'
                ? 'trips.form.titlePlaceholderDomestic'
                : 'trips.form.titlePlaceholderIntl'
              ) | t
            "
          />
          @if (titleError()) {
            <small class="err-msg">{{ titleError()! | t }}</small>
          }
        </label>

        <label class="field">
          <span>{{ 'trips.form.destination' | t }}</span>
          <input
            type="text"
            [value]="destination()"
            (input)="destination.set(readInputValue($event))"
            name="destination"
            [placeholder]="
              (scope() === 'domestic'
                ? 'trips.form.destPlaceholderDomestic'
                : 'trips.form.destPlaceholderIntl'
              ) | t
            "
          />
        </label>

        @if (scope() === 'international') {
          <div class="field" [class.has-error]="countryError()">
            <span>{{ 'trips.form.country' | t }} <em class="req">*</em></span>
            <app-country-picker
              [selectedCodes]="selectedCountries()"
              [multiple]="true"
              [placeholder]="'trips.form.countryPlaceholder' | t"
              (selectionChange)="onCountriesChange($event)"
            />
            <small class="field-hint">{{ 'trips.form.countryHint' | t }}</small>
            @if (countryError()) {
              <small class="err-msg">{{ 'trips.err.countryRequired' | t }}</small>
            }
          </div>
        }

        @if (scope() === 'international' || editingTrip() !== null) {
          <div class="field">
            <span>{{ 'trips.form.currency' | t }}</span>
            <app-select
              name="currency"
              [ariaLabel]="'trips.form.currency' | t"
              [options]="currencySelectOptions()"
              [value]="defaultCurrency()"
              (valueChange)="defaultCurrency.set($event)"
            />
          </div>
        }

        <div class="field" [class.has-error]="dateError()">
          <span>{{ 'trips.form.startDate' | t }} <em class="req">*</em></span>
          <app-date-input
            name="startDate"
            [ariaLabel]="'trips.form.startDate' | t"
            [value]="startDate()"
            (valueChange)="startDate.set($event); dateError.set(null)"
          />
        </div>

        @if (editingTrip() === null) {
          <div class="seg-row compact">
            <button
              type="button"
              class="seg-btn"
              [class.active]="dateEndMode() === 'end'"
              (click)="dateEndMode.set('end')"
            >
              {{ 'trips.form.dateModeEnd' | t }}
            </button>
            <button
              type="button"
              class="seg-btn"
              [class.active]="dateEndMode() === 'duration'"
              (click)="dateEndMode.set('duration')"
            >
              {{ 'trips.form.dateModeDuration' | t }}
            </button>
            <button
              type="button"
              class="seg-btn"
              [class.active]="dateEndMode() === 'open'"
              (click)="dateEndMode.set('open')"
            >
              {{ 'trips.form.dateModeOpen' | t }}
            </button>
          </div>

          @if (dateEndMode() === 'end') {
            <div class="field" [class.has-error]="dateError()">
              <span>{{ 'trips.form.endDate' | t }}</span>
              <app-date-input
                name="endDate"
                [ariaLabel]="'trips.form.endDate' | t"
                [value]="endDate()"
                (valueChange)="endDate.set($event); dateError.set(null)"
              />
            </div>
          } @else if (dateEndMode() === 'duration') {
            <label class="field">
              <span>{{ 'trips.form.durationDays' | t }}</span>
              <div class="stepper-row">
                <button
                  type="button"
                  class="step-btn"
                  (click)="durationDays.set(Math.max(minTripDurationDays, durationDays() - 1))"
                >
                  <span class="ms-icon sm">remove</span>
                </button>
                <input
                  type="number"
                  [min]="minTripDurationDays"
                  [max]="maxTripDurationDays"
                  class="tabular-nums step-input"
                  [value]="durationDays()"
                  (input)="onDurationDaysInput($event)"
                  (blur)="normalizeDurationDays($event)"
                  name="durationDays"
                />
                <button
                  type="button"
                  class="step-btn"
                  (click)="durationDays.set(Math.min(maxTripDurationDays, durationDays() + 1))"
                >
                  <span class="ms-icon sm">add</span>
                </button>
                <span class="computed-end tabular-nums">→ {{ computedEndDate() }}</span>
              </div>
            </label>
          } @else {
            <p class="open-hint">{{ 'trips.form.openHint' | t }}</p>
          }
        } @else {
          <div class="field">
            <span>{{ 'trips.form.status' | t }}</span>
            <app-select
              name="status"
              [ariaLabel]="'trips.form.status' | t"
              [options]="statusSelectOptions()"
              [value]="status()"
              (valueChange)="status.set($event)"
            />
          </div>
        }

        @if (dateError()) {
          <small class="err-msg">{{ dateError()! | t }}</small>
        }

        <label class="field">
          <span>{{ 'trips.form.notes' | t }}</span>
          <textarea
            rows="2"
            [value]="notes()"
            (input)="notes.set(readInputValue($event)); notesDirty.set(true)"
            name="notes"
            [placeholder]="'trips.form.notesPlaceholder' | t"
          ></textarea>
        </label>

        <div class="form-actions">
          <button type="button" class="btn-ghost" (click)="closed.emit()">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="btn-primary" [disabled]="submitting()">
            {{ (editingTrip() ? 'trips.form.save' : 'trips.form.create') | t }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .field-hint {
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--color-text-muted);
    }
    .stepper-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step-btn {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-primary);
      cursor: pointer;
    }
    .step-input {
      width: 72px;
      text-align: center;
    }
    .computed-end {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }
    .open-hint {
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.8125rem;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      padding-top: var(--space-2);
    }
  `,
})
export class TripFormModalComponent {
  protected readonly i18n = inject(I18nService);

  readonly open = input.required<boolean>();
  readonly editingTrip = input<TripSummary | null>(null);
  readonly initialNotes = input('');
  readonly notesReady = input(true);
  readonly homeCountryCode = input('TW');
  readonly homeCurrency = input('TWD');
  readonly submitting = input(false);

  readonly closed = output<void>();
  readonly submitted = output<TripFormSubmitEvent>();

  protected readonly Math = Math;
  protected readonly readInputValue = readInputValue;
  protected readonly currencies = SUPPORTED_CURRENCIES;
  protected readonly statuses: readonly TripStatus[] = [
    'PLANNING',
    'ACTIVE',
    'COMPLETED',
    'ARCHIVED',
  ];
  protected readonly currencySelectOptions = computed<readonly SelectOption[]>(() => {
    const isZh = this.i18n.locale() === 'zh-TW';
    return this.currencies.map((cur) => ({
      value: cur.code,
      label: isZh ? cur.labelZh : cur.labelEn,
    }));
  });
  protected readonly statusSelectOptions = computed<readonly SelectOption<TripStatus>[]>(() =>
    this.statuses.map((st) => ({
      value: st,
      label: this.i18n.t(this.statusKey(st)),
    })),
  );
  protected readonly minTripDurationDays = MIN_TRIP_DURATION_DAYS;
  protected readonly maxTripDurationDays = MAX_TRIP_DURATION_DAYS;

  protected readonly scope = signal<'domestic' | 'international'>('international');
  protected readonly dateEndMode = signal<DateEndMode>('duration');
  protected readonly selectedCountries = signal<string[]>(['JP']);
  protected readonly title = signal('');
  protected readonly destination = signal('');
  protected readonly defaultCurrency = signal('JPY');
  protected readonly startDate = signal(formatLocalIsoDate());
  protected readonly endDate = signal(
    addDaysToIsoDate(formatLocalIsoDate(), DEFAULT_TRIP_DURATION_DAYS - 1),
  );
  protected readonly durationDays = signal(DEFAULT_TRIP_DURATION_DAYS);
  protected readonly status = signal<TripStatus>('PLANNING');
  protected readonly notes = signal('');
  protected readonly notesDirty = signal(false);

  protected readonly titleError = signal<'trips.err.titleRequired' | null>(null);
  protected readonly countryError = signal(false);
  protected readonly dateError = signal<
    'trips.err.startRequired' | 'trips.err.endBeforeStart' | null
  >(null);

  protected readonly computedEndDate = computed(() => {
    const start = this.startDate();
    if (!start) return '';
    return addDaysToIsoDate(start, Math.max(0, this.durationDays() - 1));
  });

  private wasOpen = false;
  private lastEditingId: string | null = null;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const editing = this.editingTrip();
      if (!isOpen) {
        this.wasOpen = false;
        this.lastEditingId = null;
        return;
      }

      const editId = editing?.id ?? null;
      if (this.wasOpen && editId === this.lastEditingId) {
        return;
      }
      this.wasOpen = true;
      this.lastEditingId = editId;

      untracked(() => {
        this.resetFormForMode(editing);
      });
    });

    effect(() => {
      const isOpen = this.open();
      const editing = this.editingTrip();
      const ready = this.notesReady();
      const asyncNotes = this.initialNotes();
      if (!isOpen || !editing || !ready) {
        return;
      }
      if (!untracked(() => this.notesDirty())) {
        this.notes.set(asyncNotes);
      }
    });
  }

  private normalizedHomeCountry(): string {
    return (this.homeCountryCode() || 'TW').toUpperCase();
  }

  private defaultInternationalCountryCode(): string {
    return this.normalizedHomeCountry() === 'JP' ? 'TW' : 'JP';
  }

  private resetFormForMode(editing: TripSummary | null): void {
    this.titleError.set(null);
    this.countryError.set(false);
    this.dateError.set(null);
    this.notesDirty.set(false);

    if (!editing) {
      const today = formatLocalIsoDate();
      const defaultCountryCode = this.defaultInternationalCountryCode();
      const defaultCountry = findCountry(defaultCountryCode);
      this.scope.set('international');
      this.selectedCountries.set([defaultCountryCode]);
      this.defaultCurrency.set(defaultCountry?.defaultCurrency ?? 'JPY');
      this.title.set('');
      this.destination.set('');
      this.startDate.set(today);
      this.durationDays.set(DEFAULT_TRIP_DURATION_DAYS);
      this.endDate.set(addDaysToIsoDate(today, DEFAULT_TRIP_DURATION_DAYS - 1));
      this.dateEndMode.set('duration');
      this.status.set('PLANNING');
      this.notes.set('');
      return;
    }

    const homeCountry = this.normalizedHomeCountry();
    const isDomestic =
      editing.country_codes.length === 1 &&
      editing.country_codes[0].toUpperCase() === homeCountry;
    this.scope.set(isDomestic ? 'domestic' : 'international');
    this.selectedCountries.set(
      editing.country_codes.length > 0 ? [...editing.country_codes] : [homeCountry],
    );
    this.defaultCurrency.set(editing.default_currency);
    this.title.set(editing.title);
    this.destination.set(editing.destination_summary ?? '');
    this.startDate.set(editing.start_date);
    this.status.set(editing.status);
    this.notes.set(this.initialNotes());
  }

  protected statusKey(
    st: TripStatus,
  ):
    | 'trips.status.PLANNING'
    | 'trips.status.ACTIVE'
    | 'trips.status.COMPLETED'
    | 'trips.status.ARCHIVED' {
    return `trips.status.${st}`;
  }

  protected setScope(next: 'domestic' | 'international'): void {
    this.scope.set(next);
    this.countryError.set(false);
    if (next === 'domestic') {
      this.defaultCurrency.set(this.homeCurrency() || 'TWD');
      return;
    }
    const homeCode = this.normalizedHomeCountry();
    const current = this.selectedCountries();
    if (
      current.length === 0 ||
      (current.length === 1 && current[0].toUpperCase() === homeCode)
    ) {
      const fallbackCode = this.defaultInternationalCountryCode();
      const fallbackCountry = findCountry(fallbackCode);
      this.selectedCountries.set([fallbackCode]);
      this.defaultCurrency.set(fallbackCountry?.defaultCurrency ?? 'JPY');
    }
  }

  protected onCountriesChange(codes: string[]): void {
    this.selectedCountries.set(codes);
    this.countryError.set(false);
    const first = codes[0] ? findCountry(codes[0]) : undefined;
    if (first) {
      this.defaultCurrency.set(first.defaultCurrency);
    }
  }

  protected onDurationDaysInput(event: Event): void {
    if (isIncompleteNumberInput(event)) {
      return;
    }
    const raw = readInputValue(event);
    if (raw === '') {
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(
        this.minTripDurationDays,
        Math.min(this.maxTripDurationDays, Math.trunc(parsed)),
      );
      this.durationDays.set(clamped);
    }
  }

  protected normalizeDurationDays(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    if (inputEl.value === '') {
      inputEl.value = String(this.durationDays());
    }
  }

  protected submit(): void {
    this.titleError.set(null);
    this.countryError.set(false);
    this.dateError.set(null);

    const editing = this.editingTrip();
    const trimmedTitle = this.title().trim();
    let hasError = false;
    if (!trimmedTitle) {
      this.titleError.set('trips.err.titleRequired');
      hasError = true;
    }
    if (this.scope() === 'international' && this.selectedCountries().length === 0) {
      this.countryError.set(true);
      hasError = true;
    }
    const start = this.startDate();
    if (!start) {
      this.dateError.set('trips.err.startRequired');
      hasError = true;
    }

    let resolvedEndDate = start;
    if (!editing) {
      if (this.dateEndMode() === 'end') {
        resolvedEndDate = this.endDate() || start;
        if (start && resolvedEndDate < start) {
          this.dateError.set('trips.err.endBeforeStart');
          hasError = true;
        }
      } else if (this.dateEndMode() === 'duration') {
        resolvedEndDate = addDaysToIsoDate(start, Math.max(0, this.durationDays() - 1));
      }
    }

    if (hasError) {
      return;
    }

    const homeCountry = this.homeCountryCode() || 'TW';
    const homeCurrency = this.homeCurrency() || 'TWD';
    const countryCodes =
      this.scope() === 'domestic' ? [homeCountry] : this.selectedCountries();
    const currencyCode =
      this.scope() === 'domestic' && !editing ? homeCurrency : this.defaultCurrency();

    if (editing) {
      this.submitted.emit({
        mode: 'edit',
        tripId: editing.id,
        payload: {
          title: trimmedTitle,
          destination_summary: this.destination().trim() || null,
          country_codes: countryCodes,
          start_date: start,
          default_currency: currencyCode,
          status: this.status(),
          ...(this.notesReady() || this.notesDirty()
            ? { notes: this.notes().trim() || null }
            : {}),
        },
      });
      return;
    }

    this.submitted.emit({
      mode: 'create',
      payload: {
        title: trimmedTitle,
        destination_summary: this.destination().trim() || null,
        country_codes: countryCodes,
        start_date: start,
        end_date: resolvedEndDate,
        default_currency: currencyCode,
        notes: this.notes().trim() || null,
      },
    });
  }
}
