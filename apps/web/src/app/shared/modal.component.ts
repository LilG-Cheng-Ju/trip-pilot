import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  inject,
  input,
  output,
} from '@angular/core';

import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Reusable modal (centered on desktop, bottom sheet on mobile) with scroll lock. */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (open()) {
      <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="onBackdropClick($event)"
      >
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h3 class="modal-title">{{ title() }}</h3>
            <button
              type="button"
              class="close-btn"
              (click)="closed.emit()"
              [attr.aria-label]="'common.close' | t"
            >
              <span class="ms-icon sm" aria-hidden="true">close</span>
            </button>
          </header>
          <div class="modal-body">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 900;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgba(20, 29, 46, 0.5);
      backdrop-filter: blur(3px);
    }
    .modal-panel {
      width: 100%;
      max-width: 520px;
      max-height: 90dvh;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      background: var(--color-surface);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      box-shadow: var(--shadow-float);
      overflow: hidden;
    }
    .modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--color-border);
    }
    .modal-title {
      margin: 0;
      font-size: 1.0625rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .close-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-secondary);
      cursor: pointer;
    }
    .close-btn::after {
      content: '';
      position: absolute;
      inset: -4px;
    }
    .modal-body {
      padding: var(--space-5);
      overflow-y: auto;
    }
    @media (min-width: 640px) {
      .modal-backdrop {
        align-items: center;
        padding: var(--space-4);
      }
      .modal-panel {
        border-radius: var(--radius-lg);
      }
    }
  `,
})
export class AppModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();

  private readonly document = inject(DOCUMENT);

  protected onEscape(): void {
    if (!this.open()) {
      return;
    }
    // Let open Material overlays (datepickers, selects, timepickers) consume Escape first.
    if (this.document.querySelector('.cdk-overlay-pane')) {
      return;
    }
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}
