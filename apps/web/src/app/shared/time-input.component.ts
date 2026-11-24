import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';

/** Click-anywhere time input with an enlarged Material clock button and clear action. */
@Component({
  selector: 'app-time-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="time-wrap" (click)="openPicker()">
      <input
        #nativeInput
        type="time"
        class="native-time tabular-nums"
        [value]="value()"
        (input)="onInput($event)"
        (click)="$event.stopPropagation(); openPicker()"
      />
      @if (value()) {
        <button
          type="button"
          class="clear-btn"
          (click)="$event.stopPropagation(); valueChange.emit('')"
          aria-label="Clear time"
        >
          <span class="ms-icon sm">close</span>
        </button>
      }
      <button
        type="button"
        class="clock-btn"
        (click)="$event.stopPropagation(); openPicker()"
        aria-label="Pick time"
      >
        <span class="ms-icon">schedule</span>
      </button>
    </div>
  `,
  styles: `
    .time-wrap {
      display: flex;
      align-items: center;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      overflow: hidden;
      cursor: pointer;
    }
    .time-wrap:focus-within {
      border-color: var(--color-primary);
    }
    .native-time {
      flex: 1;
      min-width: 0;
      padding: 9px 10px;
      border: none;
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      outline: none;
    }
    /* Hide Chrome's tiny built-in clock indicator so our large Material button takes over. */
    .native-time::-webkit-calendar-picker-indicator {
      display: none;
      -webkit-appearance: none;
    }
    .clear-btn,
    .clock-btn {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border: none;
      background: transparent;
      color: var(--color-text-secondary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .clock-btn {
      border-left: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-primary);
    }
    .clock-btn:hover {
      background: var(--color-primary-tint);
    }
  `,
})
export class AppTimeInputComponent {
  readonly value = input('');
  readonly valueChange = output<string>();

  private readonly nativeInput = viewChild.required<ElementRef<HTMLInputElement>>('nativeInput');

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.valueChange.emit(target.value);
  }

  protected openPicker(): void {
    const el = this.nativeInput().nativeElement;
    el.focus();
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        // Fallback to standard focus when browser restricts programmatic showPicker.
      }
    }
  }
}
