import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTimepickerInput, MatTimepickerModule } from '@angular/material/timepicker';

/** Parse a 24-hour `HH:MM` string into a local Date, or return null when empty or invalid. */
export function parseTimeString(raw: string): Date | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match) {
    return null;
  }
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

/** Format a valid Date into zero-padded 24-hour `HH:MM`. */
export function formatTimeString(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Material 3 time input supporting both direct keyboard entry and preset slot selection. */
@Component({
  selector: 'app-time-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatTimepickerModule],
  template: `
    <mat-form-field class="time-field" appearance="outline" subscriptSizing="dynamic">
      <input
        #timeInput
        matInput
        [matTimepicker]="picker"
        [value]="parsedDate()"
        (valueChange)="onTimeChange($event)"
        placeholder="HH:MM"
        autocomplete="off"
        inputmode="numeric"
        aria-label="Time"
      />
      @if (value()) {
        <button
          type="button"
          matIconButton
          matIconSuffix
          class="clear-btn"
          (click)="$event.stopPropagation(); clearTime()"
          aria-label="Clear time"
        >
          <span class="ms-icon sm" aria-hidden="true">close</span>
        </button>
      }
      <mat-timepicker-toggle matIconSuffix [for]="picker">
        <span matTimepickerToggleIcon class="ms-icon sm" aria-hidden="true">schedule</span>
      </mat-timepicker-toggle>
      <mat-timepicker #picker interval="30m" />
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .time-field {
      width: 100%;
    }
    .time-field input {
      font-variant-numeric: tabular-nums;
    }
    .clear-btn {
      color: var(--color-text-secondary);
    }
  `,
})
export class AppTimeInputComponent {
  readonly value = input('');
  readonly valueChange = output<string>();

  protected readonly parsedDate = computed<Date | null>(() => parseTimeString(this.value()));

  private readonly timeInput = viewChild.required<ElementRef<HTMLInputElement>>('timeInput');
  private readonly pickerInput = viewChild.required<MatTimepickerInput<Date>>(MatTimepickerInput);

  protected onTimeChange(next: Date | null): void {
    if (next === null) {
      if (this.value() !== '') {
        this.valueChange.emit('');
      }
      return;
    }
    if (next instanceof Date && !Number.isNaN(next.getTime())) {
      const formatted = formatTimeString(next);
      if (formatted !== this.value()) {
        this.valueChange.emit(formatted);
      }
    }
    // Keep current committed value while the user is mid-keystroke with an incomplete time string.
  }

  protected clearTime(): void {
    this.pickerInput().value.set(null);
    this.timeInput().nativeElement.value = '';
    if (this.value() !== '') {
      this.valueChange.emit('');
    }
  }
}
