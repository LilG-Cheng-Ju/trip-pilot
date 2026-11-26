import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import {
  CountryOption,
  findCountry,
  SUPPORTED_COUNTRIES,
} from '../core/constants/travel-options';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { readInputValue } from '../core/utils/form-events.utils';

/** Reusable searchable country picker supporting single and multi-select modes with full keyboard navigation. */
@Component({
  selector: 'app-country-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <div class="picker">
      <div
        #triggerEl
        class="selected-row"
        tabindex="0"
        role="combobox"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="placeholder()"
        (click)="toggleOpen()"
        (keydown)="onTriggerKeydown($event)"
      >
        @if (selectedCodes().length === 0) {
          <span class="placeholder">{{ placeholder() }}</span>
        } @else {
          <div class="chips">
            @for (code of selectedCodes(); track code) {
              <span class="chip">
                <span>{{ labelFor(code) }}</span>
                @if (multiple()) {
                  <button
                    type="button"
                    class="chip-x"
                    (click)="$event.stopPropagation(); removeCode(code)"
                    (keydown.enter)="$event.stopPropagation()"
                    (keydown.space)="$event.stopPropagation()"
                    aria-label="Remove"
                  >
                    <span class="ms-icon sm" aria-hidden="true">close</span>
                  </button>
                }
              </span>
            }
          </div>
        }
        <span class="ms-icon chevron" aria-hidden="true">
          {{ open() ? 'expand_less' : 'expand_more' }}
        </span>
      </div>

      @if (open()) {
        <div class="dropdown">
          <div class="search-box">
            <span class="ms-icon sm search-icon" aria-hidden="true">search</span>
            <input
              #searchInput
              type="text"
              [value]="query()"
              (input)="onQueryInput($event)"
              (keydown)="onSearchKeydown($event)"
              [placeholder]="'countryPicker.searchPlaceholder' | t"
            />
          </div>
          <div class="options-list" role="listbox">
            @for (country of filteredCountries(); track country.code; let idx = $index) {
              <button
                type="button"
                role="option"
                class="option-item"
                [attr.aria-selected]="isSelected(country.code)"
                [class.selected]="isSelected(country.code)"
                [class.focused]="idx === activeIndex()"
                (mouseenter)="activeIndex.set(idx)"
                (click)="toggleCountry(country)"
              >
                <span>
                  {{ i18n.locale() === 'zh-TW' ? country.nameZh : country.nameEn }}
                  <small class="code">{{ country.code }}</small>
                </span>
                @if (isSelected(country.code)) {
                  <span class="ms-icon sm check" aria-hidden="true">check</span>
                }
              </button>
            } @empty {
              <p class="empty-opt">
                {{ 'countryPicker.empty' | t }}
              </p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .picker {
      position: relative;
    }
    .selected-row {
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      cursor: pointer;
      transition: border-color 140ms ease, box-shadow 140ms ease;
    }
    .selected-row:hover {
      border-color: var(--color-border-strong);
    }
    .selected-row:focus-visible {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px var(--color-primary-tint);
    }
    .placeholder {
      color: var(--color-text-muted);
      font-size: 0.875rem;
      font-weight: 400;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font-size: 0.78rem;
      font-weight: 600;
    }
    .chip-x {
      display: inline-flex;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.8);
      padding: 0;
      cursor: pointer;
    }
    .chevron {
      color: var(--color-text-muted);
      flex-shrink: 0;
    }
    .dropdown {
      margin-top: 6px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      box-shadow: var(--shadow-float);
      overflow: hidden;
    }
    .search-box {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg);
    }
    .search-icon {
      color: var(--color-text-muted);
    }
    .search-box input {
      width: 100%;
      height: auto;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.875rem;
      outline: none;
      box-shadow: none;
    }
    .options-list {
      max-height: 210px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .option-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      border: none;
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.875rem;
      text-align: left;
      cursor: pointer;
    }
    .option-item:hover,
    .option-item.focused {
      background: var(--color-bg);
    }
    .option-item.selected {
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-weight: 600;
    }
    .code {
      margin-left: 4px;
      color: var(--color-text-muted);
      font-family: var(--font-mono);
      font-size: 0.75rem;
    }
    .check {
      color: var(--color-primary);
    }
    .empty-opt {
      margin: 0;
      padding: 12px;
      text-align: center;
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }
  `,
})
export class AppCountryPickerComponent {
  protected readonly i18n = inject(I18nService);
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly triggerEl = viewChild<ElementRef<HTMLElement>>('triggerEl');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly selectedCodes = input<string[]>([]);
  readonly multiple = input(false);
  readonly placeholder = input('Select country');

  readonly selectionChange = output<string[]>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.hostRef.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  onEscape(): void {
    if (this.open()) {
      this.open.set(false);
    }
  }

  protected toggleOpen(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.activeIndex.set(0);
      queueMicrotask(() => this.searchInput()?.nativeElement.focus());
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.open()) {
        this.open.set(true);
        this.activeIndex.set(0);
      }
      queueMicrotask(() => this.searchInput()?.nativeElement.focus());
    } else if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      event.stopPropagation();
      this.open.set(false);
    }
  }

  protected onQueryInput(event: Event): void {
    this.query.set(readInputValue(event));
    this.activeIndex.set(0);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    const list = this.filteredCountries();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.length > 0) {
        this.activeIndex.update((idx) => (idx + 1) % list.length);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.length > 0) {
        this.activeIndex.update((idx) => (idx - 1 + list.length) % list.length);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = list[this.activeIndex()];
      if (target) {
        this.toggleCountry(target);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.open.set(false);
      this.triggerEl()?.nativeElement.focus();
    }
  }

  protected readonly filteredCountries = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return SUPPORTED_COUNTRIES;
    return SUPPORTED_COUNTRIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.nameZh.toLowerCase().includes(q),
    );
  });

  protected isSelected(code: string): boolean {
    return this.selectedCodes().includes(code);
  }

  protected labelFor(code: string): string {
    const match = findCountry(code);
    if (!match) return code;
    return this.i18n.locale() === 'zh-TW'
      ? `${match.nameZh} (${match.code})`
      : `${match.nameEn} (${match.code})`;
  }

  protected toggleCountry(country: CountryOption): void {
    if (!this.multiple()) {
      this.selectionChange.emit([country.code]);
      this.open.set(false);
      this.query.set('');
      this.triggerEl()?.nativeElement.focus();
      return;
    }
    const current = this.selectedCodes();
    const next = current.includes(country.code)
      ? current.filter((c) => c !== country.code)
      : [...current, country.code];
    this.selectionChange.emit(next);
  }

  protected removeCode(code: string): void {
    this.selectionChange.emit(this.selectedCodes().filter((c) => c !== code));
  }
}
