import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { readInputValue } from '../../core/utils/form-events.utils';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { AppModalComponent } from '../../shared/modal.component';
import { ItineraryStore } from '../../state/itinerary.store';

/** Modals for creating/cloning, renaming, and deleting Plan A/B day options. */
@Component({
  selector: 'app-day-option-modals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, AppConfirmModalComponent, AppModalComponent],
  template: `
    <app-modal
      [open]="showCloneModal()"
      [title]="'itinerary.plan.modalTitle' | t"
      (closed)="showCloneModal.set(false)"
    >
      <form class="modal-form" (submit)="$event.preventDefault(); submitCreate()" novalidate>
        @if (canCloneCurrentOption()) {
          <div class="plan-mode-seg" role="radiogroup">
            <button
              type="button"
              class="plan-mode-btn"
              [class.active]="newOptionMode() === 'blank'"
              (click)="newOptionMode.set('blank')"
            >
              {{ 'itinerary.plan.modeBlank' | t }}
            </button>
            <button
              type="button"
              class="plan-mode-btn"
              [class.active]="newOptionMode() === 'clone'"
              (click)="newOptionMode.set('clone')"
            >
              {{ 'itinerary.plan.modeClone' | t }}
            </button>
          </div>
        }

        <label class="field" [class.has-error]="cloneLabelError()">
          <span>{{ 'itinerary.plan.clonePrompt' | t }} <em class="req">*</em></span>
          <input
            type="text"
            [value]="cloneLabel()"
            name="cloneLabel"
            (input)="cloneLabel.set(readInputValue($event)); cloneLabelError.set(false)"
            [placeholder]="'itinerary.plan.placeholderClone' | t"
          />
          @if (cloneLabelError()) {
            <small class="err-msg">{{ 'itinerary.plan.errRequired' | t }}</small>
          }
        </label>
        <div class="add-actions">
          <button type="button" class="pill-btn" (click)="showCloneModal.set(false)">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="add-item-btn">{{ 'common.add' | t }}</button>
        </div>
      </form>
    </app-modal>

    <app-modal
      [open]="showRenameModal()"
      [title]="'itinerary.plan.rename' | t"
      (closed)="showRenameModal.set(false)"
    >
      <form class="modal-form" (submit)="$event.preventDefault(); submitRename()" novalidate>
        <label class="field" [class.has-error]="renameLabelError()">
          <span>{{ 'itinerary.plan.clonePrompt' | t }} <em class="req">*</em></span>
          <input
            type="text"
            [value]="renameLabel()"
            name="renameLabel"
            (input)="renameLabel.set(readInputValue($event)); renameLabelError.set(false)"
            [placeholder]="'itinerary.plan.placeholderRename' | t"
          />
          @if (renameLabelError()) {
            <small class="err-msg">{{ 'itinerary.plan.errRequired' | t }}</small>
          }
        </label>
        <div class="add-actions">
          <button type="button" class="pill-btn" (click)="showRenameModal.set(false)">
            {{ 'common.cancel' | t }}
          </button>
          <button type="submit" class="add-item-btn">{{ 'common.save' | t }}</button>
        </div>
      </form>
    </app-modal>

    <app-confirm-modal
      [open]="pendingDeleteOption() !== null"
      [title]="'itinerary.plan.delete' | t"
      [message]="
        pendingDeleteOption()
          ? ('itinerary.plan.deleteConfirm' | t: { name: pendingDeleteOption()!.label })
          : ''
      "
      [confirmLabel]="'itinerary.plan.delete' | t"
      [busy]="deletingOption()"
      (confirmed)="executeDelete()"
      (cancelled)="pendingDeleteOption.set(null)"
    />
  `,
  styles: `
    .plan-mode-seg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 4px;
      border-radius: var(--radius-sm);
      background: var(--color-surface-muted);
    }
    .plan-mode-btn {
      padding: 7px 10px;
      border: none;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .plan-mode-btn.active {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: var(--shadow-card);
    }
    .add-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
    .add-item-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 7px 14px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
  `,
})
export class DayOptionModalsComponent {
  private readonly store = inject(ItineraryStore);
  protected readonly readInputValue = readInputValue;

  protected readonly showCloneModal = signal(false);
  protected readonly newOptionMode = signal<'blank' | 'clone'>('blank');
  protected readonly cloneLabel = signal('Plan B');
  protected readonly cloneLabelError = signal(false);

  protected readonly showRenameModal = signal(false);
  protected readonly renamingOptionId = signal<string | null>(null);
  protected readonly renameLabel = signal('');
  protected readonly renameLabelError = signal(false);

  protected readonly pendingDeleteOption = signal<{
    dayId: string;
    optionId: string;
    label: string;
  } | null>(null);
  protected readonly deletingOption = signal(false);

  protected readonly canCloneCurrentOption = computed(
    () => (this.store.selectedOption()?.items.length ?? 0) > 0,
  );

  openClone(): void {
    const count = this.store.selectedDay()?.options.length ?? 1;
    const nextLetter = String.fromCharCode(65 + Math.min(count, 25));
    this.cloneLabel.set(`Plan ${nextLetter}`);
    this.newOptionMode.set('blank');
    this.cloneLabelError.set(false);
    this.showCloneModal.set(true);
  }

  openRename(optionId: string, currentLabel: string): void {
    this.renamingOptionId.set(optionId);
    this.renameLabel.set(currentLabel);
    this.renameLabelError.set(false);
    this.showRenameModal.set(true);
  }

  confirmDelete(dayId: string, optionId: string, label: string): void {
    const day = this.store.selectedDay();
    if (!day || day.options.length <= 1) {
      return;
    }
    this.pendingDeleteOption.set({ dayId, optionId, label });
  }

  protected async submitCreate(): Promise<void> {
    const label = this.cloneLabel().trim();
    if (!label) {
      this.cloneLabelError.set(true);
      return;
    }
    if (this.canCloneCurrentOption() && this.newOptionMode() === 'clone') {
      await this.store.cloneCurrentOption(label);
    } else {
      await this.store.createBlankOption(label);
    }
    this.showCloneModal.set(false);
  }

  protected async submitRename(): Promise<void> {
    const optionId = this.renamingOptionId();
    const label = this.renameLabel().trim();
    if (!optionId || !label) {
      this.renameLabelError.set(true);
      return;
    }
    await this.store.renameOption(optionId, label);
    this.showRenameModal.set(false);
  }

  protected async executeDelete(): Promise<void> {
    const target = this.pendingDeleteOption();
    if (!target) {
      return;
    }
    this.deletingOption.set(true);
    try {
      await this.store.deleteOption(target.dayId, target.optionId);
      this.pendingDeleteOption.set(null);
    } finally {
      this.deletingOption.set(false);
    }
  }
}
