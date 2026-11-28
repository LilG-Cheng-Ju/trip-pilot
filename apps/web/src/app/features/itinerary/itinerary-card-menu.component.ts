import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  injectMenuCloseScrollStrategy,
  isClickInsideElement,
  MENU_OVERLAY_POSITIONS,
} from '../../core/utils/overlay-positions';

export type CardMenuVariant = 'standard' | 'dark' | 'connector';

/** Shared overflow action menu trigger and CDK Overlay dropdown for itinerary cards. */
@Component({
  selector: 'app-itinerary-card-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, TranslatePipe],
  template: `
    <div class="overflow-anchor">
      <button
        #triggerBtn
        cdkOverlayOrigin
        #menuOrigin="cdkOverlayOrigin"
        type="button"
        class="icon-btn"
        [class.connector-icon-btn]="variant() === 'connector'"
        [class.connector-menu-btn]="variant() === 'connector'"
        [class.icon-btn--dark]="variant() === 'dark'"
        [class.head-menu-btn]="variant() === 'standard'"
        [title]="'item.moreActions' | t"
        [attr.aria-label]="'item.moreActions' | t"
        [attr.aria-expanded]="menuOpen()"
        (click)="toggleMenu($event)"
      >
        <span class="ms-icon sm" aria-hidden="true">more_vert</span>
      </button>

      <ng-template
        cdkConnectedOverlay
        [cdkConnectedOverlayOrigin]="menuOrigin"
        [cdkConnectedOverlayOpen]="menuOpen()"
        [cdkConnectedOverlayPositions]="overlayPositions"
        [cdkConnectedOverlayScrollStrategy]="overlayScrollStrategy"
        [cdkConnectedOverlayPush]="true"
        [cdkConnectedOverlayViewportMargin]="12"
        (overlayOutsideClick)="onOutsideClick($event)"
        (overlayKeydown)="onOverlayKeydown($event)"
        (detach)="menuOpen.set(false)"
      >
        <div class="action-menu" role="menu">
          @if (showOrderActions()) {
            <button
              type="button"
              class="action-menu-item"
              role="menuitem"
              [disabled]="!canMoveUp()"
              (click)="onMoveUp($event)"
            >
              <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_up</span>
              <span>{{ 'item.moveUp' | t }}</span>
            </button>
            <button
              type="button"
              class="action-menu-item"
              role="menuitem"
              [disabled]="!canMoveDown()"
              (click)="onMoveDown($event)"
            >
              <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_down</span>
              <span>{{ 'item.moveDown' | t }}</span>
            </button>
            <div class="action-menu-divider"></div>
          }
          <button type="button" class="action-menu-item" role="menuitem" (click)="onEdit($event)">
            <span class="ms-icon sm" aria-hidden="true">edit</span>
            <span>{{ 'common.edit' | t }}</span>
          </button>
          @if (showAddAlternative()) {
            <button
              type="button"
              class="action-menu-item"
              role="menuitem"
              (click)="onAddAlternative($event)"
            >
              <span class="ms-icon sm" aria-hidden="true">alt_route</span>
              <span>{{ 'itinerary.choice.addAlt' | t }}</span>
            </button>
          }
          @if (showMoveToDay()) {
            <button
              type="button"
              class="action-menu-item"
              role="menuitem"
              (click)="onMoveToDay($event)"
            >
              <span class="ms-icon sm" aria-hidden="true">drive_file_move</span>
              <span>{{ 'item.moveToDay' | t }}</span>
            </button>
          }
          <div class="action-menu-divider"></div>
          <button
            type="button"
            class="action-menu-item danger"
            role="menuitem"
            (click)="onDelete($event)"
          >
            <span class="ms-icon sm" aria-hidden="true">delete</span>
            <span>{{ 'common.delete' | t }}</span>
          </button>
        </div>
      </ng-template>
    </div>
  `,
  styles: `
    .overflow-anchor {
      position: relative;
      flex-shrink: 0;
    }
    .connector-icon-btn {
      min-width: 26px;
      min-height: 26px;
      width: 26px;
      height: 26px;
      border-radius: var(--radius-xs);
    }
    .connector-icon-btn::after {
      content: '';
      position: absolute;
      inset: -4px;
    }
    .icon-btn--dark {
      color: rgba(248, 250, 252, 0.82);
    }
    .icon-btn--dark:hover:not(:disabled),
    .icon-btn--dark:active:not(:disabled),
    .icon-btn--dark:focus-visible:not(:disabled) {
      background: rgba(255, 255, 255, 0.14);
      color: var(--color-text-on-primary);
    }
    .action-menu {
      min-width: 158px;
      max-width: calc(100vw - 24px);
      padding: 6px;
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-float);
      display: flex;
      flex-direction: column;
      gap: 2px;
      white-space: nowrap;
    }
    .action-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 10px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }
    .action-menu-item:hover:not(:disabled) {
      background: var(--color-bg);
    }
    .action-menu-item:disabled {
      opacity: 0.38;
      cursor: not-allowed;
    }
    .action-menu-item.danger {
      color: var(--color-alert);
    }
    .action-menu-item.danger:hover:not(:disabled) {
      background: var(--color-alert-soft);
    }
    .action-menu-divider {
      height: 1px;
      background: var(--color-border);
      margin: 4px 2px;
    }
  `,
})
export class ItineraryCardMenuComponent {
  private readonly triggerBtn = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  protected readonly overlayPositions = MENU_OVERLAY_POSITIONS;
  protected readonly overlayScrollStrategy = injectMenuCloseScrollStrategy();

  readonly variant = input<CardMenuVariant>('standard');
  readonly showOrderActions = input(false);
  readonly canMoveUp = input(true);
  readonly canMoveDown = input(true);
  readonly showAddAlternative = input(false);
  readonly showMoveToDay = input(false);

  readonly moveUp = output<void>();
  readonly moveDown = output<void>();
  readonly edited = output<void>();
  readonly addAlternative = output<void>();
  readonly moveToDay = output<void>();
  readonly deleted = output<void>();

  protected readonly menuOpen = signal(false);

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  protected onMoveUp(event: Event): void {
    event.stopPropagation();
    if (!this.canMoveUp()) {
      return;
    }
    this.menuOpen.set(false);
    this.moveUp.emit();
  }

  protected onMoveDown(event: Event): void {
    event.stopPropagation();
    if (!this.canMoveDown()) {
      return;
    }
    this.menuOpen.set(false);
    this.moveDown.emit();
  }

  protected onEdit(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.edited.emit();
  }

  protected onAddAlternative(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.addAlternative.emit();
  }

  protected onMoveToDay(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.moveToDay.emit();
  }

  protected onDelete(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.deleted.emit();
  }

  protected onOutsideClick(event: MouseEvent): void {
    if (!isClickInsideElement(event, this.triggerBtn()?.nativeElement)) {
      this.menuOpen.set(false);
    }
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.menuOpen.set(false);
    }
  }
}
