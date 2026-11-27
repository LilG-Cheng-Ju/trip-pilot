import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';

export type CardMenuVariant = 'standard' | 'dark' | 'connector';

/** Shared overflow action menu trigger and dropdown for itinerary cards. */
@Component({
  selector: 'app-itinerary-card-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <div class="overflow-anchor">
      <button
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
      @if (menuOpen()) {
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
      }
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
    .icon-btn--dark:focus-visible:not(:disabled) {
      background: rgba(255, 255, 255, 0.14);
      color: var(--color-text-on-primary);
    }
    .action-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 158px;
      max-width: calc(100vw - 24px);
      padding: 6px;
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-float);
      z-index: 40;
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
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  readonly variant = input<CardMenuVariant>('standard');
  readonly showOrderActions = input(false);
  readonly canMoveUp = input(true);
  readonly canMoveDown = input(true);
  readonly showAddAlternative = input(false);

  readonly moveUp = output<void>();
  readonly moveDown = output<void>();
  readonly edited = output<void>();
  readonly addAlternative = output<void>();
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

  protected onDelete(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.deleted.emit();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const anchor = this.hostRef.nativeElement.querySelector('.overflow-anchor');
    if (anchor && target && !anchor.contains(target)) {
      this.menuOpen.set(false);
    }
  }

  protected onEscape(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
    }
  }
}
