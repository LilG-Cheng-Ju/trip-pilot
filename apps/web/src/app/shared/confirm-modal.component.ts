import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TranslatePipe } from '../core/i18n/translate.pipe';
import { AppModalComponent } from './modal.component';

/** Reusable confirmation dialog backed by AppModalComponent with danger/primary tones. */
@Component({
  selector: 'app-confirm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppModalComponent, TranslatePipe],
  template: `
    <app-modal [open]="open()" [title]="title()" (closed)="handleCancel()">
      <div class="modal-form">
        <p class="confirm-copy">{{ message() }}</p>
        <div class="modal-actions">
          <button
            type="button"
            class="btn-ghost"
            [disabled]="busy()"
            (click)="handleCancel()"
          >
            {{ cancelLabel() || ('common.cancel' | t) }}
          </button>
          <button
            type="button"
            [class]="tone() === 'danger' ? 'btn-danger' : 'btn-primary'"
            [disabled]="busy()"
            (click)="handleConfirm()"
          >
            {{
              confirmLabel() ||
                (tone() === 'danger' ? ('common.delete' | t) : ('common.confirm' | t))
            }}
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class AppConfirmModalComponent {
  readonly open = input.required<boolean>();
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input<string>('');
  readonly cancelLabel = input<string>('');
  readonly tone = input<'danger' | 'primary'>('danger');
  readonly busy = input<boolean>(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected handleConfirm(): void {
    if (!this.busy()) {
      this.confirmed.emit();
    }
  }

  protected handleCancel(): void {
    if (!this.busy()) {
      this.cancelled.emit();
    }
  }
}
