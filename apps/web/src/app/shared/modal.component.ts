import { Component, input, output } from '@angular/core';

/** Reusable modal dialog (centered card on desktop, bottom sheet on mobile). */
@Component({
  selector: 'app-modal',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (open()) {
      <div class="modal-backdrop" (click)="closed.emit()">
        <div
          class="modal-panel"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          (click)="$event.stopPropagation()"
        >
          <header class="modal-head">
            <h3 class="modal-title">{{ title() }}</h3>
            <button type="button" class="close-btn" (click)="closed.emit()" aria-label="Close">
              ×
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
      z-index: 60;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgba(23, 32, 51, 0.48);
      backdrop-filter: blur(2px);
    }
    .modal-panel {
      width: 100%;
      max-width: 520px;
      max-height: 90dvh;
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
      font-weight: 700;
      color: var(--color-primary);
    }
    .close-btn {
      width: 32px;
      height: 32px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-secondary);
      font-size: 1.125rem;
      line-height: 1;
      cursor: pointer;
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

  onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }
}
