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
import {
  MatDatepickerInput,
  MatDatepickerInputEvent,
  MatDatepickerModule,
} from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import {
  formatIsoDateString,
  parseIsoDateString,
} from '../core/config/material-date-formats';

/** Material 3 date input supporting both direct YYYY-MM-DD keyboard entry and calendar selection. */
@Component({
  selector: 'app-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field class="date-field" appearance="outline" subscriptSizing="dynamic">
      <input
        #dateInput
        matInput
        [matDatepicker]="picker"
        [name]="name()"
        [value]="parsedDate()"
        (dateInput)="onDateEvent($event)"
        (dateChange)="onDateEvent($event)"
        [placeholder]="placeholder()"
        autocomplete="off"
        [attr.aria-label]="ariaLabel()"
      />
      @if (allowClear() && value()) {
        <button
          type="button"
          matIconButton
          matIconSuffix
          class="clear-btn"
          (click)="$event.stopPropagation(); clearDate()"
          aria-label="Clear date"
        >
          <span class="ms-icon sm" aria-hidden="true">close</span>
        </button>
      }
      <mat-datepicker-toggle matIconSuffix [for]="picker">
        <span matDatepickerToggleIcon class="ms-icon sm" aria-hidden="true">calendar_today</span>
      </mat-datepicker-toggle>
      <mat-datepicker #picker />
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .date-field {
      width: 100%;
    }
    .date-field input {
      font-variant-numeric: tabular-nums;
    }
    .clear-btn {
      color: var(--color-text-secondary);
    }
  `,
})
export class AppDateInputComponent {
  readonly value = input('');
  readonly name = input('');
  readonly placeholder = input('YYYY-MM-DD');
  readonly ariaLabel = input('Date');
  readonly allowClear = input(false);
  readonly valueChange = output<string>();

  protected readonly parsedDate = computed<Date | null>(() => parseIsoDateString(this.value()));

  private readonly dateInput = viewChild.required<ElementRef<HTMLInputElement>>('dateInput');
  private readonly pickerInput = viewChild.required<MatDatepickerInput<Date>>(MatDatepickerInput);

  protected onDateEvent(event: MatDatepickerInputEvent<Date>): void {
    const raw = this.dateInput().nativeElement.value.trim();
    if (!raw) {
      if (this.value() !== '') {
        this.valueChange.emit('');
      }
      return;
    }
    const next = event.value;
    if (next instanceof Date && !Number.isNaN(next.getTime())) {
      const formatted = formatIsoDateString(next);
      if (formatted !== this.value()) {
        this.valueChange.emit(formatted);
      }
    }
  }

  protected clearDate(): void {
    this.pickerInput().value = null;
    this.dateInput().nativeElement.value = '';
    if (this.value() !== '') {
      this.valueChange.emit('');
    }
  }
}
