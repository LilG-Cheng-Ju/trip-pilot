import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { AirportEntry } from '../core/models/tripilot.models';
import { readInputValue } from '../core/utils/form-events.utils';
import {
  DROPDOWN_OVERLAY_POSITIONS,
  isClickInsideElement,
} from '../core/utils/overlay-positions';

const AIRPORT_SEARCH_DEBOUNCE_MS = 220;
const AIRPORT_SEARCH_LIMIT = 8;
const IATA_THREE_LETTER_RE = /^[A-Za-z]{3}$/;

let nextPickerInstanceId = 0;

/** Debounced IATA/city airport autocomplete with manual 3-letter uppercase IATA fallback. */
@Component({
  selector: 'app-airport-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, TranslatePipe],
  template: `
    <div class="airport-picker">
      @if (label()) {
        <label class="picker-label" [attr.for]="resolvedId()">{{ label() }}</label>
      }
      <div #inputWrap cdkOverlayOrigin #airportOrigin="cdkOverlayOrigin" class="input-wrap">
        <input
          type="text"
          role="combobox"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          [id]="resolvedId()"
          [value]="query()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="open() ? resolvedId() + '-listbox' : null"
          [attr.aria-activedescendant]="activeDescendantId()"
          aria-autocomplete="list"
          (focus)="onFocus()"
          (input)="onInput($event)"
          (keydown)="onKeyDown($event)"
          (blur)="onBlur($event)"
        />
        @if (loading()) {
          <span
            class="ms-icon sm spin status-ico"
            aria-hidden="true"
            [title]="'airportPicker.searching' | t"
          >
            progress_activity
          </span>
        }
      </div>

      <ng-template
        cdkConnectedOverlay
        [cdkConnectedOverlayOrigin]="airportOrigin"
        [cdkConnectedOverlayOpen]="open()"
        [cdkConnectedOverlayPositions]="overlayPositions"
        [cdkConnectedOverlayWidth]="dropdownWidth()"
        [cdkConnectedOverlayPush]="true"
        [cdkConnectedOverlayViewportMargin]="12"
        (overlayOutsideClick)="onOutsideClick($event)"
        (overlayKeydown)="onOverlayKeydown($event)"
        (detach)="closeDropdown(false)"
      >
        <div
          class="dropdown"
          role="listbox"
          [id]="resolvedId() + '-listbox'"
          (mousedown)="$event.preventDefault()"
        >
          @for (airport of suggestions(); track airport.iata; let idx = $index) {
            <button
              type="button"
              role="option"
              class="option-item"
              [id]="resolvedId() + '-opt-' + idx"
              [class.active]="idx === highlightedIndex()"
              [attr.aria-selected]="idx === highlightedIndex()"
              (click)="selectAirport(airport)"
            >
              <strong class="iata-code">{{ airport.iata }}</strong> — {{ airport.name }} ·
              <span class="airport-city">{{ airport.city }}</span>
            </button>
          } @empty {
            @if (notFound()) {
              <p class="empty-opt">{{ 'airportPicker.empty' | t }}</p>
            }
          }
        </div>
      </ng-template>
    </div>
  `,
  styles: `
    .airport-picker {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .picker-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-wrap input {
      width: 100%;
      min-width: 0;
      padding: 9px 28px 9px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.875rem;
    }
    .input-wrap input:focus {
      outline: none;
      border-color: var(--color-primary);
    }
    .input-wrap input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .status-ico {
      position: absolute;
      right: 8px;
      color: var(--color-text-muted);
      pointer-events: none;
    }
    .dropdown {
      width: 100%;
      max-height: 210px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      box-shadow: var(--shadow-float);
    }
    .option-item {
      padding: 8px 10px;
      border: none;
      border-bottom: 1px solid var(--color-border);
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.8rem;
      line-height: 1.35;
      text-align: left;
      cursor: pointer;
    }
    .option-item:last-child {
      border-bottom: none;
    }
    .option-item:hover,
    .option-item.active {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .iata-code {
      font-family: var(--font-mono);
      font-weight: 700;
    }
    .airport-city {
      color: var(--color-text-secondary);
    }
    .empty-opt {
      margin: 0;
      padding: 10px 12px;
      font-size: 0.78rem;
      line-height: 1.4;
      color: var(--color-text-muted);
    }
  `,
})
export class AppAirportPickerComponent {
  private readonly api = inject(TripilotApiService);
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inputWrap = viewChild<ElementRef<HTMLElement>>('inputWrap');

  protected readonly overlayPositions = DROPDOWN_OVERLAY_POSITIONS;
  protected readonly dropdownWidth = signal<number | string>('auto');

  readonly label = input('');
  readonly placeholder = input('');
  readonly value = input('');
  readonly inputId = input('');
  readonly disabled = input(false);

  readonly valueChange = output<string>();

  private readonly fallbackId = `airport-picker-${++nextPickerInstanceId}`;
  protected readonly resolvedId = computed(() => this.inputId() || this.fallbackId);

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly suggestions = signal<AirportEntry[]>([]);
  protected readonly highlightedIndex = signal(-1);

  protected readonly activeDescendantId = computed(() => {
    const idx = this.highlightedIndex();
    if (!this.open() || idx < 0 || idx >= this.suggestions().length) {
      return null;
    }
    return `${this.resolvedId()}-opt-${idx}`;
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;
  private lastCommittedValue = '';
  // Prevents an in-flight debounced search from reopening the menu after blur or Escape.
  private dismissed = false;

  constructor() {
    effect(() => {
      const incoming = this.value().trim().toUpperCase();
      untracked(() => {
        if (incoming !== this.lastCommittedValue) {
          this.lastCommittedValue = incoming;
          this.query.set(incoming);
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.clearDebounce();
      this.searchSeq += 1;
    });
  }

  protected onFocus(): void {
    this.dismissed = false;
  }

  protected onInput(event: Event): void {
    if (this.disabled()) {
      return;
    }
    this.dismissed = false;
    const raw = readInputValue(event);
    this.query.set(raw);

    const trimmed = raw.trim();
    if (IATA_THREE_LETTER_RE.test(trimmed)) {
      this.commitValue(trimmed.toUpperCase());
    } else if (this.lastCommittedValue !== '') {
      this.commitValue('');
    }

    this.clearDebounce();
    this.searchSeq += 1;

    if (trimmed.length < 2) {
      this.closeDropdown(true);
      this.loading.set(false);
      return;
    }

    const seq = this.searchSeq;
    this.debounceTimer = setTimeout(() => {
      void this.runSearch(trimmed, seq);
    }, AIRPORT_SEARCH_DEBOUNCE_MS);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const list = this.suggestions();
    switch (event.key) {
      case 'ArrowDown':
        if (list.length === 0) return;
        event.preventDefault();
        if (!this.open()) {
          this.openDropdown(0);
          return;
        }
        this.highlightedIndex.update((i) => (i + 1) % list.length);
        break;

      case 'ArrowUp':
        if (list.length === 0) return;
        event.preventDefault();
        if (!this.open()) {
          this.openDropdown(list.length - 1);
          return;
        }
        this.highlightedIndex.update((i) => (i <= 0 ? list.length - 1 : i - 1));
        break;

      case 'Enter': {
        const idx = this.highlightedIndex();
        if (this.open() && idx >= 0 && list[idx]) {
          event.preventDefault();
          this.selectAirport(list[idx]);
        }
        break;
      }

      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.dismissed = true;
          this.closeDropdown(false);
        }
        break;
    }
  }

  protected onBlur(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.hostRef.nativeElement.contains(next)) {
      return;
    }
    this.dismissed = true;
    this.closeDropdown(false);

    const trimmed = this.query().trim();
    if (IATA_THREE_LETTER_RE.test(trimmed)) {
      const upper = trimmed.toUpperCase();
      this.query.set(upper);
      this.commitValue(upper);
    }
  }

  protected onOutsideClick(event: MouseEvent): void {
    if (!isClickInsideElement(event, this.inputWrap()?.nativeElement)) {
      this.dismissed = true;
      this.closeDropdown(false);
    }
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.dismissed = true;
      this.closeDropdown(false);
    }
  }

  protected selectAirport(airport: AirportEntry): void {
    this.clearDebounce();
    this.searchSeq += 1;
    this.dismissed = true;
    const code = airport.iata.trim().toUpperCase();
    this.query.set(code);
    this.commitValue(code);
    this.loading.set(false);
    this.closeDropdown(true);
  }

  private async runSearch(query: string, seq: number): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    try {
      const results = await this.api.searchAirports(query, AIRPORT_SEARCH_LIMIT);
      if (seq !== this.searchSeq || this.dismissed) {
        return;
      }
      this.suggestions.set(results);
      this.notFound.set(results.length === 0);
      this.openDropdown(results.length > 0 ? 0 : -1);
    } catch {
      if (seq !== this.searchSeq) {
        return;
      }
      // Degrade silently offline so manual 3-letter IATA input remains uninterrupted.
      this.closeDropdown(true);
    } finally {
      if (seq === this.searchSeq) {
        this.loading.set(false);
      }
    }
  }

  private commitValue(next: string): void {
    if (next !== this.lastCommittedValue) {
      this.lastCommittedValue = next;
      this.valueChange.emit(next);
    }
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private openDropdown(initialHighlight: number): void {
    const width = this.inputWrap()?.nativeElement.getBoundingClientRect().width ?? 0;
    this.dropdownWidth.set(width > 0 ? width : 'auto');
    this.highlightedIndex.set(initialHighlight);
    this.open.set(true);
  }

  private closeDropdown(clearResults: boolean): void {
    this.open.set(false);
    this.highlightedIndex.set(-1);
    if (clearResults) {
      this.suggestions.set([]);
      this.notFound.set(false);
    }
  }
}
