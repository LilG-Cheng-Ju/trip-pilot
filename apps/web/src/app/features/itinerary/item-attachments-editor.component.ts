import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItemAttachment } from '../../core/models/tripilot.models';
import { readInputValue } from '../../core/utils/form-events.utils';

function extractUrlFilename(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments.length > 0 ? decodeURIComponent(segments[segments.length - 1]) : '';
    const generic = new Set(['view', 'edit', 'open', 'uc', 'd', 'preview', 'share', 'download']);
    if (last && !generic.has(last.toLowerCase()) && last.includes('.')) {
      return last;
    }
    return null;
  } catch {
    return null;
  }
}

/** Normalize an attachment URL by adding https:// when no protocol scheme is present. */
export function normalizeAttachmentUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/** Derive a concise human-readable label for a cloud attachment URL. */
export function deriveAttachmentName(rawUrl: string): string {
  const directFile = extractUrlFilename(rawUrl);
  if (directFile) {
    return directFile;
  }
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('drive.google.com') || host.includes('docs.google.com')) {
      return 'Google Drive';
    }
    if (host.includes('dropbox.com')) {
      return 'Dropbox';
    }
    if (host.includes('onedrive.live.com') || host.includes('1drv.ms')) {
      return 'OneDrive';
    }
    if (host.includes('icloud.com')) {
      return 'iCloud';
    }
    if (host.includes('notion.so') || host.includes('notion.site')) {
      return 'Notion';
    }
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Attachment';
  }
}

/** Cloud attachment list and link-title resolver editor for itinerary items. */
@Component({
  selector: 'app-item-attachments-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="attachments-box">
      <div class="att-head">
        <span class="att-title">
          <span class="ms-icon sm" aria-hidden="true">attach_file</span>
          {{ 'item.attachmentsTitle' | t }}
        </span>
        <small class="place-hint">{{ 'item.attachmentsHint' | t }}</small>
      </div>

      @if (attachments().length > 0) {
        <div class="att-list">
          @for (att of attachments(); track $index) {
            <div class="att-row">
              <span class="ms-icon sm att-ico" aria-hidden="true">link</span>
              <a
                [href]="att.url"
                target="_blank"
                rel="noopener noreferrer"
                class="att-link"
              >
                {{ att.name }}
              </a>
              <button
                type="button"
                class="att-remove"
                (click)="removeAttachment($index)"
                [attr.aria-label]="'item.attachmentRemove' | t"
              >
                <span class="ms-icon sm">close</span>
              </button>
            </div>
          }
        </div>
      }

      <div class="att-inputs">
        <input
          type="text"
          [value]="attachmentName()"
          (input)="attachmentName.set(readInputValue($event))"
          name="attachmentName"
          [placeholder]="'item.attachmentNamePlaceholder' | t"
        />
        <div class="place-input-row">
          <input
            type="url"
            [value]="attachmentUrl()"
            (input)="attachmentUrl.set(readInputValue($event))"
            name="attachmentUrl"
            [placeholder]="'item.attachmentUrlPlaceholder' | t"
            (keydown.enter)="$event.preventDefault(); addAttachment()"
          />
          <button
            type="button"
            class="pill-btn"
            [disabled]="resolvingAttachment()"
            (click)="addAttachment()"
          >
            {{ resolvingAttachment() ? '...' : '+ ' + ('item.attachmentAdd' | t) }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .attachments-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .att-head {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .att-title {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .place-hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .att-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .att-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      font-size: 0.8rem;
    }
    .att-ico {
      color: var(--color-accent);
      flex-shrink: 0;
    }
    .att-link {
      flex: 1;
      min-width: 0;
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .att-link:hover {
      text-decoration: underline;
    }
    .att-remove {
      display: inline-flex;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 2px;
    }
    .att-inputs {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .att-inputs input {
      padding: 8px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.8125rem;
    }
    .place-input-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .place-input-row input {
      flex: 1 1 160px;
      min-width: 0;
    }
    .pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 7px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
      cursor: pointer;
    }
  `,
})
export class ItemAttachmentsEditorComponent {
  private readonly api = inject(TripilotApiService);

  readonly attachments = model<ItemAttachment[]>([]);
  readonly resetToken = input(0);

  protected readonly attachmentName = signal('');
  protected readonly attachmentUrl = signal('');
  protected readonly resolvingAttachment = signal(false);
  protected readonly readInputValue = readInputValue;

  constructor() {
    effect(() => {
      this.resetToken();
      untracked(() => {
        this.attachmentName.set('');
        this.attachmentUrl.set('');
        this.resolvingAttachment.set(false);
      });
    });
  }

  /** Return saved attachments plus any unsubmitted URL still in the input row. */
  collectFinalAttachments(): ItemAttachment[] {
    const finalAttachments = [...this.attachments()];
    const pendingUrl = this.attachmentUrl().trim();
    if (pendingUrl) {
      const normalized = normalizeAttachmentUrl(pendingUrl);
      finalAttachments.push({
        name: this.attachmentName().trim() || deriveAttachmentName(normalized),
        url: normalized,
      });
    }
    return finalAttachments;
  }

  protected async addAttachment(): Promise<void> {
    const rawInput = this.attachmentUrl().trim();
    if (!rawInput) {
      return;
    }
    const normalized = normalizeAttachmentUrl(rawInput);
    let label = this.attachmentName().trim();
    if (!label) {
      const directFile = extractUrlFilename(normalized);
      if (directFile) {
        label = directFile;
      } else {
        this.resolvingAttachment.set(true);
        try {
          const resolved = await this.api.resolveLinkTitle(normalized);
          label = resolved.title?.trim() || deriveAttachmentName(normalized);
        } catch {
          label = deriveAttachmentName(normalized);
        } finally {
          this.resolvingAttachment.set(false);
        }
      }
    }
    this.attachments.update((list) => [...list, { name: label, url: normalized }]);
    this.attachmentName.set('');
    this.attachmentUrl.set('');
  }

  protected removeAttachment(index: number): void {
    this.attachments.update((list) => list.filter((_, i) => i !== index));
  }
}
