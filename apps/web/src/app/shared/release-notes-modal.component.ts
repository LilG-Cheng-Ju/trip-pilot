import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { RELEASE_NOTES } from '../core/config/release-notes.generated';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { AppModalComponent } from './modal.component';

/** Editorial changelog dialog backed by the generated single-source RELEASE_NOTES. */
@Component({
  selector: 'app-release-notes-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppModalComponent, TranslatePipe],
  template: `
    <app-modal
      [open]="open()"
      [title]="'releaseNotes.title' | t"
      (closed)="closed.emit()"
    >
      <div class="release-list">
        @for (entry of localizedNotes(); track entry.version; let isFirst = $first) {
          <article class="release-entry">
            <header class="release-head">
              <div class="release-version-group">
                <span class="release-version">v{{ entry.version }}</span>
                @if (isFirst) {
                  <span class="latest-tag">{{ 'releaseNotes.latestBadge' | t }}</span>
                }
              </div>
              <time class="release-date">{{ entry.date }}</time>
            </header>
            <h4 class="release-title">{{ entry.title }}</h4>
            <ul class="release-bullets">
              @for (item of entry.changes; track $index) {
                <li>{{ item }}</li>
              }
            </ul>
          </article>
        }
      </div>
    </app-modal>
  `,
  styles: `
    .release-list {
      display: flex;
      flex-direction: column;
      max-height: 64vh;
      overflow-y: auto;
      padding-right: 4px;
    }

    .release-entry {
      padding: 14px 0;
      border-bottom: 1px solid var(--color-border);
    }

    .release-entry:first-child {
      padding-top: 2px;
    }

    .release-entry:last-child {
      border-bottom: 0;
      padding-bottom: 4px;
    }

    .release-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    .release-version-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .release-version {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--color-primary);
      background: var(--color-primary-tint);
      padding: 2px 8px;
      border-radius: var(--radius-pill);
    }

    .latest-tag {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--color-accent-ink);
      background: var(--color-accent-soft);
      padding: 2px 7px;
      border-radius: var(--radius-pill);
    }

    .release-date {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 0.74rem;
      color: var(--color-text-muted);
    }

    .release-title {
      margin: 0 0 6px;
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .release-bullets {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--color-text-secondary);
    }

    @media (min-width: 640px) {
      .release-title {
        font-size: 0.94rem;
      }

      .release-bullets {
        font-size: 0.84rem;
      }
    }
  `,
})
export class AppReleaseNotesModalComponent {
  private readonly i18n = inject(I18nService);

  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly localizedNotes = computed(() => {
    const loc = this.i18n.locale();
    return RELEASE_NOTES.map((entry) => ({
      version: entry.version,
      date: entry.date,
      title: entry.title[loc],
      changes: entry.changes[loc],
    }));
  });
}
