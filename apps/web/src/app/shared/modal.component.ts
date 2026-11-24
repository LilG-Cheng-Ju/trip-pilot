import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';

import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Reusable native <dialog> modal (centered on desktop, bottom sheet on mobile) with scroll lock. */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <dialog
      #dialogEl
      class="modal-dialog"
      [attr.aria-label]="title()"
      (cancel)="onNativeCancel($event)"
      (click)="onBackdropClick($event)"
    >
      @if (open()) {
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
      }
    </dialog>
  `,
  styles: `
    .modal-dialog {
      margin: auto 0 0;
      padding: 0;
      width: 100%;
      max-width: 100%;
      border: none;
      background: transparent;
      overflow: visible;
    }
    .modal-dialog::backdrop {
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
      .modal-dialog {
        margin: auto;
        padding: var(--space-4);
        max-width: 552px;
      }
      .modal-panel {
        border-radius: var(--radius-lg);
      }
    }
  `,
})
export class AppModalComponent implements OnDestroy {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();

  private readonly dialogEl = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
  private lockedScroll = false;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const dialog = this.dialogEl()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (isOpen) {
        if (!dialog.open && typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
        this.lockBodyScroll(true);
      } else {
        if (dialog.open && typeof dialog.close === 'function') {
          dialog.close();
        }
        this.lockBodyScroll(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.lockBodyScroll(false);
  }

  protected onNativeCancel(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogEl()?.nativeElement) {
      this.closed.emit();
    }
  }

  private lockBodyScroll(lock: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    if (lock && !this.lockedScroll) {
      document.body.style.overflow = 'hidden';
      this.lockedScroll = true;
    } else if (!lock && this.lockedScroll) {
      document.body.style.overflow = '';
      this.lockedScroll = false;
    }
  }
}
