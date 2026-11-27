import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

export interface SelectOption<T = string> {
  readonly value: T;
  readonly label: string;
  readonly optionClass?: string;
}

/** Shared Material 3 outlined dropdown wrapper keeping form-field tokens encapsulated. */
@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  template: `
    <mat-form-field
      class="select-field"
      [class.compact]="compact()"
      appearance="outline"
      subscriptSizing="dynamic"
    >
      <mat-select
        [class]="computedSelectClass()"
        [attr.name]="name() || null"
        [value]="value()"
        [disabled]="disabled()"
        [panelWidth]="panelWidth()"
        [aria-label]="ariaLabel()"
        (selectionChange)="valueChange.emit($event.value)"
      >
        @for (opt of options(); track opt.value) {
          <mat-option [class]="opt.optionClass ?? ''" [value]="opt.value">
            {{ opt.label }}
          </mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .select-field {
      width: 100%;
    }
    .select-field.compact {
      --mat-form-field-container-height: 32px;
      --mat-form-field-container-vertical-padding: 5px;
      --mat-select-trigger-text-size: 0.78rem;
    }
    mat-select.bold-trigger {
      font-weight: 600;
    }
  `,
})
export class AppSelectComponent<T = string> {
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly value = input.required<T>();
  readonly name = input('');
  readonly ariaLabel = input('');
  readonly disabled = input(false);
  readonly panelWidth = input<string | number | null>('auto');
  readonly compact = input(false);
  readonly bold = input(false);
  readonly selectClass = input('');

  readonly valueChange = output<T>();

  protected readonly computedSelectClass = computed(() =>
    [this.selectClass(), this.bold() ? 'bold-trigger' : ''].filter(Boolean).join(' '),
  );
}
