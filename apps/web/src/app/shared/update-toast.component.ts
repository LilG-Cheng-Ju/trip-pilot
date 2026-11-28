import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ReleaseNoteEntry } from '../core/config/release-notes.generated';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Lightweight, non-blocking floating notice showing release highlights on app update. */
@Component({
  selector: 'app-update-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <aside class="update-toast" role="status" aria-live="polite">
      <header class="toast-head">
        <div class="toast-badges">
          <span class="badge-pill">
            <span class="ms-icon sm" aria-hidden="true">auto_awesome</span>
            <span>
              {{
                mode() === 'update-ready'
                  ? ('update.newAvailableBadge' | t)
                  : ('update.updatedBadge' | t)
              }}
            </span>
          </span>
          @if (note(); as entry) {
            <span class="version-chip">v{{ entry.version }}</span>
          }
        </div>
        <button
          type="button"
          class="icon-btn dismiss-btn"
          [attr.aria-label]="'update.dismissAria' | t"
          (click)="dismissed.emit()"
        >
          <span class="ms-icon sm" aria-hidden="true">close</span>
        </button>
      </header>

      @if (localizedEntry(); as entry) {
        <h4 class="toast-title">{{ entry.title }}</h4>
        @if (entry.changes.length > 0) {
          <ul class="toast-bullets">
            @for (line of entry.changes; track $index) {
              <li>{{ line }}</li>
            }
          </ul>
        }
      } @else {
        <h4 class="toast-title">{{ 'update.genericTitle' | t }}</h4>
      }

      <div class="toast-actions">
        @if (mode() === 'whats-new') {
          <button type="button" class="btn-ghost toast-btn" (click)="changelogRequested.emit()">
            {{ 'update.viewChangelog' | t }}
          </button>
          <button type="button" class="btn-primary toast-btn" (click)="dismissed.emit()">
            {{ 'update.acknowledge' | t }}
          </button>
        } @else {
          <button type="button" class="btn-ghost toast-btn" (click)="dismissed.emit()">
            {{ 'update.later' | t }}
          </button>
          <button
            type="button"
            class="btn-primary toast-btn"
            [disabled]="applying()"
            (click)="reloadRequested.emit()"
          >
            {{ applying() ? ('update.updating' | t) : ('update.reloadNow' | t) }}
          </button>
        }
      </div>
    </aside>
  `,
  styles: `
    @keyframes toastSlideUp {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .update-toast {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: calc(var(--nav-bottom-height) + env(safe-area-inset-bottom, 0px) + 12px);
      z-index: 80;
      padding: 13px 14px;
      border-radius: var(--radius-md);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-left: 3px solid var(--color-accent);
      box-shadow: var(--shadow-float);
      animation: toastSlideUp 220ms ease-out;
    }

    .toast-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    .toast-badges {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: wrap;
    }

    .badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .badge-pill .ms-icon.sm {
      font-size: 14px;
    }

    .version-chip {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--color-primary);
      background: var(--color-primary-tint);
      padding: 2px 7px;
      border-radius: var(--radius-pill);
    }

    .dismiss-btn {
      min-width: 28px;
      min-height: 28px;
      color: var(--color-text-muted);
    }

    .toast-title {
      margin: 0 0 5px;
      font-size: 0.875rem;
      font-weight: 700;
      line-height: 1.35;
      color: var(--color-primary);
    }

    .toast-bullets {
      margin: 0 0 11px;
      padding-left: 16px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 0.77rem;
      line-height: 1.45;
      color: var(--color-text-secondary);
    }

    .toast-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .toast-btn {
      padding: 6px 13px;
      font-size: 0.78rem;
    }

    @media (min-width: 640px) {
      .update-toast {
        left: auto;
        right: 20px;
        bottom: 20px;
        width: min(380px, calc(100vw - 40px));
      }
    }
  `,
})
export class AppUpdateToastComponent {
  private readonly i18n = inject(I18nService);

  readonly mode = input.required<'update-ready' | 'whats-new'>();
  readonly note = input<ReleaseNoteEntry | null>(null);
  readonly applying = input(false);

  readonly reloadRequested = output<void>();
  readonly changelogRequested = output<void>();
  readonly dismissed = output<void>();

  protected readonly localizedEntry = computed(() => {
    const entry = this.note();
    if (!entry) {
      return null;
    }
    const loc = this.i18n.locale();
    return {
      title: entry.title[loc],
      changes: entry.changes[loc].slice(0, 3),
    };
  });
}
