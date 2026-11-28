import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { SHARE_COPY_FEEDBACK_DURATION_MS } from '../../core/constants/app-limits';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { readCheckedValue } from '../../core/utils/form-events.utils';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { AppModalComponent } from '../../shared/modal.component';
import { ItineraryStore } from '../../state/itinerary.store';

/** Modal managing read-only share links, visibility policies, and revocation. */
@Component({
  selector: 'app-trip-share-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppConfirmModalComponent, AppModalComponent],
  template: `
    <app-modal [open]="open()" [title]="'share.title' | t" (closed)="closed.emit()">
      <div class="share-options">
        <label class="check-row">
          <input
            type="checkbox"
            [checked]="hideSecrets()"
            (change)="hideSecrets.set(readCheckedValue($event))"
            name="hideSecrets"
          />
          <span>{{ 'share.hideSecrets' | t }}</span>
        </label>
        <label class="check-row">
          <input
            type="checkbox"
            [checked]="includeNotes()"
            (change)="includeNotes.set(readCheckedValue($event))"
            name="includeNotes"
          />
          <span>{{ 'share.includeNotes' | t }}</span>
        </label>
        <label class="check-row">
          <input
            type="checkbox"
            [checked]="includeBackups()"
            (change)="includeBackups.set(readCheckedValue($event))"
            name="includeBackups"
          />
          <span>{{ 'share.includeBackups' | t }}</span>
        </label>
        <button type="button" class="add-item-btn" (click)="createShareLink()">
          {{ 'share.create' | t }}
        </button>
      </div>

      @for (share of store.shares(); track share.id) {
        @if (!share.revoked_at) {
          <div class="share-row">
            <code class="share-url">{{ shareUrl(share.token) }}</code>
            <div class="share-row-actions">
              <button type="button" class="pill-btn" (click)="copyShareUrl(share.token)">
                {{ copiedToken() === share.token ? ('common.copied' | t) : ('common.copy' | t) }}
              </button>
              <button type="button" class="pill-btn danger" (click)="requestRevokeShare(share.id)">
                {{ 'share.revoke' | t }}
              </button>
            </div>
          </div>
        }
      }
    </app-modal>

    <app-confirm-modal
      [open]="pendingRevokeShareId() !== null"
      [title]="'confirm.revokeShareTitle' | t"
      [message]="'confirm.revokeShareBody' | t"
      [confirmLabel]="'share.revoke' | t"
      [busy]="revokingShare()"
      (confirmed)="executeRevokeShare()"
      (cancelled)="pendingRevokeShareId.set(null)"
    />
  `,
  styles: `
    .share-options {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
    .check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
      color: var(--color-text-primary);
    }
    .add-item-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 7px 14px;
      border: none;
      border-radius: var(--radius-sm);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .share-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px;
      margin-top: 8px;
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .share-url {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      word-break: break-all;
      color: var(--color-primary);
    }
    .share-row-actions {
      display: flex;
      gap: 6px;
    }
  `,
})
export class TripShareModalComponent {
  readonly open = input(false);
  readonly tripId = input.required<string>();
  readonly closed = output<void>();

  protected readonly store = inject(ItineraryStore);
  protected readonly readCheckedValue = readCheckedValue;

  protected readonly hideSecrets = signal(true);
  protected readonly includeNotes = signal(false);
  protected readonly includeBackups = signal(false);
  protected readonly copiedToken = signal<string | null>(null);
  protected readonly pendingRevokeShareId = signal<string | null>(null);
  protected readonly revokingShare = signal(false);

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      const id = this.tripId();
      if (id) {
        untracked(() => void this.store.loadShares(id));
      }
    });
  }

  protected async createShareLink(): Promise<void> {
    await this.store.createShare(this.tripId(), 'Shared Link', {
      include_booking_refs: !this.hideSecrets(),
      include_notes: this.includeNotes(),
      include_expenses: false,
      include_backup_options: this.includeBackups(),
    });
  }

  protected shareUrl(token: string): string {
    return `${window.location.origin}/s/${token}`;
  }

  protected async copyShareUrl(token: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl(token));
      this.copiedToken.set(token);
      setTimeout(() => this.copiedToken.set(null), SHARE_COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts.
    }
  }

  protected requestRevokeShare(shareId: string): void {
    this.pendingRevokeShareId.set(shareId);
  }

  protected async executeRevokeShare(): Promise<void> {
    const shareId = this.pendingRevokeShareId();
    if (!shareId) {
      return;
    }
    this.revokingShare.set(true);
    try {
      await this.store.revokeShare(this.tripId(), shareId);
      this.pendingRevokeShareId.set(null);
    } finally {
      this.revokingShare.set(false);
    }
  }
}
