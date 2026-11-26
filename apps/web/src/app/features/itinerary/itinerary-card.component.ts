import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { COPY_FEEDBACK_DURATION_MS } from '../../core/constants/app-limits';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItemAttachment, ItineraryItem } from '../../core/models/tripilot.models';
import {
  buildGoogleMapsUrl,
  extractItemAttachments,
  getItemDetailString,
} from '../../core/utils/travel-format.utils';
import { ItemExpenseSummary } from '../../state/expense.store';

/** Renders split-transit and venue itinerary cards with synced map pins, attachments, and 1-tap expense logging. */
@Component({
  selector: 'app-itinerary-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (item().type === 'LOCAL_TRANSIT') {
      <div class="connector-wrap">
        <div class="connector-line" aria-hidden="true"></div>
        <div class="connector-pill">
          <span class="ms-icon sm" aria-hidden="true">subway</span>
          <span class="connector-title" [title]="item().title">{{ item().title }}</span>
          @if (detail('duration_minutes')) {
            <span class="tabular-nums connector-dur">· {{ detail('duration_minutes') }} min</span>
          }
          @if (mapsUrl()) {
            <a
              [href]="mapsUrl()"
              target="_blank"
              rel="noopener noreferrer"
              class="icon-btn connector-icon-btn connector-link"
              [title]="'common.navigate' | t"
              [attr.aria-label]="'common.navigate' | t"
            >
              <span class="ms-icon sm" aria-hidden="true">open_in_new</span>
            </a>
          }
          @if (!readOnly()) {
            <button
              type="button"
              class="icon-btn connector-icon-btn connector-spend-btn"
              (click)="logExpense.emit(item())"
              [title]="'item.logExpense' | t"
              [attr.aria-label]="'item.logExpense' | t"
            >
              <span class="ms-icon sm" aria-hidden="true">payments</span>
            </button>
            <div class="overflow-anchor">
              <button
                type="button"
                class="icon-btn connector-icon-btn connector-menu-btn"
                [title]="'item.moreActions' | t"
                [attr.aria-label]="'item.moreActions' | t"
                [attr.aria-expanded]="menuOpen()"
                (click)="toggleMenu($event)"
              >
                <span class="ms-icon sm" aria-hidden="true">more_vert</span>
              </button>
              @if (menuOpen()) {
                <div class="action-menu" role="menu">
                  <button
                    type="button"
                    class="action-menu-item"
                    role="menuitem"
                    [disabled]="!canMoveUp()"
                    (click)="onMoveUp()"
                  >
                    <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_up</span>
                    <span>{{ 'item.moveUp' | t }}</span>
                  </button>
                  <button
                    type="button"
                    class="action-menu-item"
                    role="menuitem"
                    [disabled]="!canMoveDown()"
                    (click)="onMoveDown()"
                  >
                    <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_down</span>
                    <span>{{ 'item.moveDown' | t }}</span>
                  </button>
                  <div class="action-menu-divider"></div>
                  <button type="button" class="action-menu-item" role="menuitem" (click)="onEdit()">
                    <span class="ms-icon sm" aria-hidden="true">edit</span>
                    <span>{{ 'common.edit' | t }}</span>
                  </button>
                  <div class="action-menu-divider"></div>
                  <button
                    type="button"
                    class="action-menu-item danger"
                    role="menuitem"
                    (click)="onDelete()"
                  >
                    <span class="ms-icon sm" aria-hidden="true">delete</span>
                    <span>{{ 'common.delete' | t }}</span>
                  </button>
                </div>
              }
            </div>
          }
        </div>
        <div class="connector-line" aria-hidden="true"></div>
      </div>
    } @else if (item().type === 'FLIGHT') {
      <article
        class="card flight-card"
        tabindex="0"
        [class.selected]="selected()"
        (click)="cardClicked.emit(item().id)"
        (keydown)="onCardKeydown($event)"
      >
        <div class="flight-top">
          <div class="flight-head-left">
            <span class="flight-tag">
              <span class="ms-icon sm" aria-hidden="true">flight</span>
              <span>{{ detail('flight_number') || item().title }}</span>
            </span>
          </div>

          @if (!readOnly()) {
            <div class="head-actions" (click)="$event.stopPropagation()">
              <button
                type="button"
                class="icon-btn icon-btn--dark accent-dark"
                [title]="'item.logExpense' | t"
                [attr.aria-label]="'item.logExpense' | t"
                (click)="logExpense.emit(item())"
              >
                <span class="ms-icon sm" aria-hidden="true">payments</span>
              </button>
              <div class="overflow-anchor">
                <button
                  type="button"
                  class="icon-btn icon-btn--dark"
                  [title]="'item.moreActions' | t"
                  [attr.aria-label]="'item.moreActions' | t"
                  [attr.aria-expanded]="menuOpen()"
                  (click)="toggleMenu($event)"
                >
                  <span class="ms-icon sm" aria-hidden="true">more_vert</span>
                </button>
                @if (menuOpen()) {
                  <div class="action-menu" role="menu">
                    <button type="button" class="action-menu-item" role="menuitem" (click)="onEdit()">
                      <span class="ms-icon sm" aria-hidden="true">edit</span>
                      <span>{{ 'common.edit' | t }}</span>
                    </button>
                    <div class="action-menu-divider"></div>
                    <button
                      type="button"
                      class="action-menu-item danger"
                      role="menuitem"
                      (click)="onDelete()"
                    >
                      <span class="ms-icon sm" aria-hidden="true">delete</span>
                      <span>{{ 'common.delete' | t }}</span>
                    </button>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <div class="flight-route tabular-nums">
          <div class="airport-col">
            <span class="iata">{{ detail('origin_iata') || '---' }}</span>
            <span class="time">{{ item().start_time || '--:--' }}</span>
          </div>
          <div class="flight-arc">
            <span class="arc-line"></span>
            @if (detail('distance_km')) {
              <span class="flight-km">{{ detail('distance_km') }} km</span>
            }
          </div>
          <div class="airport-col right">
            <span class="iata">{{ detail('dest_iata') || '---' }}</span>
            <span class="time">{{ item().end_time || '--:--' }}</span>
          </div>
        </div>

        @if (!readOnly() || hasFooterPills()) {
          <div class="card-footer dark" (click)="$event.stopPropagation()">
            <div class="footer-pills dark" (wheel)="onFooterWheel($event)">
              @if (detail('booking_ref'); as ref) {
                <span class="meta-chip dark tabular-nums">
                  {{ 'detail.bookingRef' | t }} {{ ref }}
                </span>
              }
              @if (detail('confirmation_code'); as conf) {
                <span class="meta-chip dark tabular-nums">
                  {{ 'detail.confirmation' | t }} {{ conf }}
                </span>
              }
              @if (detail('free_cancellation_deadline'); as cancel) {
                <span class="meta-chip dark alert tabular-nums">
                  <span class="ms-icon sm" aria-hidden="true">warning</span>
                  <span>{{ 'detail.freeCancelBy' | t }} {{ cancel }}</span>
                </span>
              }
              @for (att of attachments(); track $index) {
                <a
                  class="attachment-chip dark"
                  [href]="att.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  [title]="att.name"
                >
                  <span class="ms-icon sm" aria-hidden="true">attach_file</span>
                  <span class="chip-truncate">{{ att.name }}</span>
                </a>
              }
              @if (expenseSummary(); as exp) {
                @if (tripId()) {
                  <a
                    class="head-expense-pill dark tabular-nums"
                    [routerLink]="['/trips', tripId(), 'expenses']"
                    [queryParams]="{ itemId: item().id }"
                    [title]="
                      'expenses.itemSummary'
                        | t: { count: exp.count, currency: exp.currencyHome, total: formatAmount(exp.totalHome) }
                    "
                  >
                    <span class="ms-icon sm" aria-hidden="true">payments</span>
                    <span>{{ exp.currencyHome }} {{ formatAmount(exp.totalHome) }}</span>
                  </a>
                }
              }
            </div>

            @if (!readOnly()) {
              <div class="order-controls">
                <button
                  type="button"
                  class="icon-btn icon-btn--dark order-btn"
                  [disabled]="!canMoveUp()"
                  (click)="moveUp.emit(item())"
                  [attr.aria-label]="'item.moveUp' | t"
                >
                  <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_up</span>
                </button>
                <button
                  type="button"
                  class="icon-btn icon-btn--dark order-btn"
                  [disabled]="!canMoveDown()"
                  (click)="moveDown.emit(item())"
                  [attr.aria-label]="'item.moveDown' | t"
                >
                  <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_down</span>
                </button>
              </div>
            }
          </div>
        }
      </article>
    } @else {
      <article
        class="card standard-card"
        tabindex="0"
        [class.selected]="selected()"
        [attr.data-type]="item().type"
        (click)="cardClicked.emit(item().id)"
        (keydown)="onCardKeydown($event)"
      >
        <div class="card-head">
          <div class="card-meta">
            @if (pinOrder() !== null) {
              <span
                class="pin-badge tabular-nums"
                [attr.data-type]="item().type"
                [class.selected]="selected()"
              >
                {{ pinOrder() }}
              </span>
            }
            <span class="type-label">
              @if (pinOrder() === null) {
                <span class="type-dot" [attr.data-type]="item().type" aria-hidden="true"></span>
              }
              <span>{{ typeLabel() | t }}</span>
            </span>
            @if (item().start_time) {
              <span class="meta-sep" aria-hidden="true">·</span>
              <span class="time-text tabular-nums">
                {{ item().start_time }}@if (item().end_time) { – {{ item().end_time }} }
              </span>
            }
          </div>

          <div class="head-actions" (click)="$event.stopPropagation()">
            @if (mapsUrl()) {
              <a
                class="icon-btn head-nav-btn"
                [href]="mapsUrl()"
                target="_blank"
                rel="noopener noreferrer"
                [title]="'common.navigate' | t"
                [attr.aria-label]="'common.navigate' | t"
              >
                <span class="ms-icon sm" aria-hidden="true">near_me</span>
              </a>
            }

            @if (!readOnly()) {
              <button
                type="button"
                class="icon-btn expense-trigger"
                [title]="'item.logExpense' | t"
                [attr.aria-label]="'item.logExpense' | t"
                (click)="logExpense.emit(item())"
              >
                <span class="ms-icon sm" aria-hidden="true">payments</span>
              </button>

              <div class="overflow-anchor">
                <button
                  type="button"
                  class="icon-btn head-menu-btn"
                  [title]="'item.moreActions' | t"
                  [attr.aria-label]="'item.moreActions' | t"
                  [attr.aria-expanded]="menuOpen()"
                  (click)="toggleMenu($event)"
                >
                  <span class="ms-icon sm" aria-hidden="true">more_vert</span>
                </button>
                @if (menuOpen()) {
                  <div class="action-menu" role="menu">
                    <button type="button" class="action-menu-item" role="menuitem" (click)="onEdit()">
                      <span class="ms-icon sm" aria-hidden="true">edit</span>
                      <span>{{ 'common.edit' | t }}</span>
                    </button>
                    <button
                      type="button"
                      class="action-menu-item"
                      role="menuitem"
                      (click)="onAddAlternative()"
                    >
                      <span class="ms-icon sm" aria-hidden="true">alt_route</span>
                      <span>{{ 'itinerary.choice.addAlt' | t }}</span>
                    </button>
                    <div class="action-menu-divider"></div>
                    <button
                      type="button"
                      class="action-menu-item danger"
                      role="menuitem"
                      (click)="onDelete()"
                    >
                      <span class="ms-icon sm" aria-hidden="true">delete</span>
                      <span>{{ 'common.delete' | t }}</span>
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <h4 class="card-title">{{ item().title }}</h4>

        @if (item().address) {
          <p class="card-sub">{{ item().address }}</p>
        }

        @if (detail('local_name'); as localName) {
          <button
            type="button"
            class="local-copy-chip"
            (click)="$event.stopPropagation(); copyLocalName(localName)"
            [title]="localName"
          >
            <span class="ms-icon sm" aria-hidden="true">
              {{ copiedLocal() ? 'check' : 'content_copy' }}
            </span>
            <span class="chip-truncate">
              {{ copiedLocal() ? ('common.copied' | t) : localName }}
            </span>
          </button>
        }

        @if (item().notes) {
          <p class="card-notes">{{ item().notes }}</p>
        }

        @if (!readOnly() || hasFooterPills()) {
          <div class="card-footer" (click)="$event.stopPropagation()">
            <div class="footer-pills" (wheel)="onFooterWheel($event)">
              @if (detail('line_or_train_no'); as trainNo) {
                <span class="meta-chip">
                  <span class="ms-icon sm" aria-hidden="true">train</span>
                  <span>{{ trainNo }}</span>
                </span>
              }
              @if (detail('seat'); as seat) {
                <span class="meta-chip">{{ seat }}</span>
              }
              @if (detail('confirmation_code'); as conf) {
                <span class="meta-chip tabular-nums">
                  {{ 'detail.confirmation' | t }} {{ conf }}
                </span>
              }
              @if (detail('booking_ref'); as ref) {
                <span class="meta-chip tabular-nums">
                  {{ 'detail.bookingRef' | t }} {{ ref }}
                </span>
              }
              @if (detail('free_cancellation_deadline'); as cancel) {
                <span class="meta-chip alert tabular-nums">
                  <span class="ms-icon sm" aria-hidden="true">warning</span>
                  <span>{{ 'detail.freeCancelBy' | t }} {{ cancel }}</span>
                </span>
              }
              @for (att of attachments(); track $index) {
                <a
                  class="attachment-chip"
                  [href]="att.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  [title]="att.name"
                >
                  <span class="ms-icon sm" aria-hidden="true">attach_file</span>
                  <span class="chip-truncate">{{ att.name }}</span>
                </a>
              }
              @if (expenseSummary(); as exp) {
                @if (tripId()) {
                  <a
                    class="head-expense-pill tabular-nums"
                    [routerLink]="['/trips', tripId(), 'expenses']"
                    [queryParams]="{ itemId: item().id }"
                    [title]="
                      'expenses.itemSummary'
                        | t: { count: exp.count, currency: exp.currencyHome, total: formatAmount(exp.totalHome) }
                    "
                  >
                    <span class="ms-icon sm" aria-hidden="true">payments</span>
                    <span>{{ exp.currencyHome }} {{ formatAmount(exp.totalHome) }}</span>
                  </a>
                }
              }
            </div>

            @if (!readOnly()) {
              <div class="order-controls">
                <button
                  type="button"
                  class="icon-btn order-btn"
                  [disabled]="!canMoveUp()"
                  (click)="moveUp.emit(item())"
                  [attr.aria-label]="'item.moveUp' | t"
                >
                  <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_up</span>
                </button>
                <button
                  type="button"
                  class="icon-btn order-btn"
                  [disabled]="!canMoveDown()"
                  (click)="moveDown.emit(item())"
                  [attr.aria-label]="'item.moveDown' | t"
                >
                  <span class="ms-icon sm" aria-hidden="true">keyboard_arrow_down</span>
                </button>
              </div>
            }
          </div>
        }
      </article>
    }
  `,
  styles: `
    .connector-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      min-width: 0;
      margin: 2px 0;
    }
    .connector-line {
      width: 2px;
      height: 10px;
      background: var(--color-border);
    }
    .connector-pill {
      display: inline-flex;
      align-items: center;
      flex-wrap: nowrap;
      max-width: 100%;
      min-width: 0;
      gap: 4px;
      padding: 3px 6px 3px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border-soft);
      color: var(--color-text-secondary);
      font-size: 0.76rem;
      font-weight: 600;
    }
    .connector-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .connector-dur {
      flex-shrink: 0;
      white-space: nowrap;
      color: var(--color-text-muted);
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
    .connector-link {
      color: var(--color-primary);
    }
    .connector-link:hover:not(:disabled),
    .connector-link:focus-visible:not(:disabled) {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .connector-spend-btn {
      color: var(--color-accent-ink);
    }
    .connector-spend-btn:hover:not(:disabled),
    .connector-spend-btn:focus-visible:not(:disabled),
    .icon-btn.expense-trigger:hover:not(:disabled),
    .icon-btn.expense-trigger:focus-visible:not(:disabled) {
      background: var(--color-accent-tint);
      color: var(--color-accent-ink);
    }
    .order-btn {
      color: var(--color-text-muted);
    }
    .card {
      border-radius: var(--radius-md);
      padding: var(--space-3) var(--space-4);
      box-shadow: var(--shadow-card);
      transition: border-color 140ms ease, transform 140ms ease;
      cursor: pointer;
    }
    .card.selected {
      outline: 2px solid var(--color-accent);
      outline-offset: 1px;
    }
    .card:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    .flight-card {
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      border: 1px solid var(--color-primary-soft);
    }
    .flight-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: var(--space-3);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .flight-head-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .flight-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .flight-route {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--space-3);
    }
    .airport-col {
      display: flex;
      flex-direction: column;
    }
    .airport-col.right {
      text-align: right;
    }
    .iata {
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .time {
      font-size: 0.8125rem;
      opacity: 0.8;
    }
    .flight-arc {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .arc-line {
      width: 100%;
      height: 1px;
      background: var(--color-accent-border);
    }
    .flight-km {
      color: var(--color-accent);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .standard-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
    }
    .standard-card:hover {
      border-color: var(--color-border-strong);
    }
    .type-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--item-spot);
      flex-shrink: 0;
    }
    .type-dot[data-type='STAY'] {
      background: var(--item-stay);
    }
    .type-dot[data-type='FOOD'] {
      background: var(--item-food);
    }
    .type-dot[data-type='RESERVED_TRANSIT'] {
      background: var(--item-reserved);
    }
    .card-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: 6px;
    }
    .card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .pin-badge {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: var(--radius-pill);
      background: var(--item-spot);
      color: var(--color-text-on-primary);
      font-size: 0.75rem;
      font-weight: 600;
      flex-shrink: 0;
      transition: box-shadow 140ms ease;
    }
    .pin-badge[data-type='FOOD'] {
      background: var(--item-food);
    }
    .pin-badge[data-type='STAY'] {
      background: var(--item-stay);
    }
    .pin-badge[data-type='RESERVED_TRANSIT'] {
      background: var(--item-reserved);
    }
    .pin-badge.selected {
      box-shadow:
        0 0 0 2px var(--color-surface),
        0 0 0 4px var(--color-accent);
    }
    .type-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--color-text-secondary);
      font-size: var(--text-badge);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .meta-sep {
      color: var(--color-text-muted);
      font-size: var(--text-badge);
      font-weight: 600;
      user-select: none;
    }
    .time-text {
      font-family: var(--font-mono);
      font-size: 0.74rem;
      font-weight: 500;
      color: var(--color-text-muted);
    }
    .head-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .head-nav-btn {
      color: var(--color-primary);
    }
    .head-nav-btn:hover:not(:disabled),
    .head-nav-btn:focus-visible:not(:disabled) {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .icon-btn.expense-trigger {
      color: var(--color-accent-ink);
    }
    .icon-btn--dark {
      color: rgba(248, 250, 252, 0.82);
    }
    .icon-btn--dark:hover:not(:disabled),
    .icon-btn--dark:focus-visible:not(:disabled) {
      background: rgba(255, 255, 255, 0.14);
      color: var(--color-text-on-primary);
    }
    .icon-btn--dark.accent-dark {
      color: var(--color-accent-light);
    }
    .icon-btn--dark.accent-dark:hover:not(:disabled),
    .icon-btn--dark.accent-dark:focus-visible:not(:disabled) {
      background: var(--color-accent-tint);
      color: var(--color-accent-light);
    }
    .head-expense-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-accent-border);
      background: var(--color-accent-tint);
      color: var(--color-accent-ink);
      text-decoration: none;
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
      transition: border-color 140ms ease, background-color 140ms ease;
    }
    .head-expense-pill:hover {
      border-color: var(--color-accent);
    }
    .overflow-anchor {
      position: relative;
      flex-shrink: 0;
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
    .card-title {
      margin: 2px 0 3px;
      font-size: var(--text-card-title);
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.015em;
      color: var(--color-text-primary);
    }
    .card-sub {
      margin: 0 0 5px;
      font-size: var(--text-card-meta);
      line-height: 1.45;
      color: var(--color-text-muted);
    }
    .local-copy-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      margin: 0 0 6px -6px;
      padding: 3px 6px;
      border: none;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.76rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 140ms ease, color 140ms ease;
    }
    .local-copy-chip:hover,
    .local-copy-chip:focus-visible {
      background: rgba(20, 24, 31, 0.05);
      color: var(--color-primary);
    }
    .chip-truncate {
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-notes {
      margin: 7px 0 0;
      font-size: var(--text-card-body);
      line-height: 1.55;
      color: var(--color-text-secondary);
      white-space: pre-line;
    }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: nowrap;
      gap: 8px;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--color-border-soft);
    }
    .card-footer.dark {
      border-top-color: rgba(255, 255, 255, 0.12);
    }
    .footer-pills {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: rgba(20, 24, 31, 0.22) transparent;
      padding-bottom: 2px;
      gap: 10px;
    }
    .footer-pills::-webkit-scrollbar {
      height: 4px;
    }
    .footer-pills::-webkit-scrollbar-thumb {
      background: rgba(20, 24, 31, 0.18);
      border-radius: var(--radius-pill);
    }
    .footer-pills:hover::-webkit-scrollbar-thumb {
      background: rgba(20, 24, 31, 0.32);
    }
    .meta-chip,
    .attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      text-decoration: none;
      font-size: 0.74rem;
      font-weight: 500;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .meta-chip {
      padding: 2px 0;
      color: var(--color-text-secondary);
    }
    .meta-chip.alert {
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    .meta-chip.dark {
      color: rgba(248, 250, 252, 0.8);
    }
    .meta-chip.dark.alert {
      background: rgba(200, 75, 59, 0.24);
      color: var(--color-alert-light);
    }
    .footer-pills.dark {
      scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
    }
    .footer-pills.dark::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.26);
    }
    .head-expense-pill.dark {
      border-color: var(--color-accent-border);
      background: var(--color-accent-tint);
      color: var(--color-accent-light);
    }
    .head-expense-pill.dark:hover {
      border-color: var(--color-accent);
      background: rgba(196, 146, 76, 0.22);
    }
    .attachment-chip {
      padding: 2px 8px;
      border-radius: var(--radius-xs);
      background: var(--color-surface-alt);
      color: var(--color-primary);
      transition: background-color 140ms ease;
    }
    .attachment-chip:hover {
      background: var(--color-primary-tint);
    }
    .attachment-chip.dark {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text-on-primary);
    }
    .attachment-chip.dark:hover {
      background: rgba(255, 255, 255, 0.18);
    }
    .order-controls {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: auto;
    }
  `,
})
export class ItineraryCardComponent {
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  readonly item = input.required<ItineraryItem>();
  readonly tripId = input<string>('');
  readonly pinOrder = input<number | null>(null);
  readonly selected = input(false);
  readonly readOnly = input(false);
  readonly canMoveUp = input(true);
  readonly canMoveDown = input(true);
  readonly expenseSummary = input<ItemExpenseSummary | null>(null);

  readonly cardClicked = output<string>();
  readonly moveUp = output<ItineraryItem>();
  readonly moveDown = output<ItineraryItem>();
  readonly addAlternative = output<ItineraryItem>();
  readonly logExpense = output<ItineraryItem>();
  readonly edited = output<ItineraryItem>();
  readonly deleted = output<string>();

  protected readonly copiedLocal = signal(false);
  protected readonly menuOpen = signal(false);

  protected readonly attachments = computed<ItemAttachment[]>(() =>
    extractItemAttachments(this.item().details),
  );

  protected hasFooterPills(): boolean {
    return (
      this.hasDetailChips() ||
      this.attachments().length > 0 ||
      Boolean(this.expenseSummary() && this.tripId())
    );
  }

  protected onFooterWheel(event: WheelEvent): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || el.scrollWidth <= el.clientWidth) {
      return;
    }
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    }
  }

  protected hasDetailChips(): boolean {
    return Boolean(
      this.detail('line_or_train_no') ||
        this.detail('seat') ||
        this.detail('booking_ref') ||
        this.detail('confirmation_code') ||
        this.detail('free_cancellation_deadline'),
    );
  }

  protected formatAmount(value: number): string {
    return Math.round(value).toLocaleString();
  }

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  protected onEdit(): void {
    this.menuOpen.set(false);
    this.edited.emit(this.item());
  }

  protected onMoveUp(): void {
    if (!this.canMoveUp()) {
      return;
    }
    this.menuOpen.set(false);
    this.moveUp.emit(this.item());
  }

  protected onMoveDown(): void {
    if (!this.canMoveDown()) {
      return;
    }
    this.menuOpen.set(false);
    this.moveDown.emit(this.item());
  }

  protected onAddAlternative(): void {
    this.menuOpen.set(false);
    this.addAlternative.emit(this.item());
  }

  protected onDelete(): void {
    this.menuOpen.set(false);
    this.deleted.emit(this.item().id);
  }

  protected onCardKeydown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.cardClicked.emit(this.item().id);
    }
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

  protected async copyLocalName(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedLocal.set(true);
      setTimeout(() => this.copiedLocal.set(false), COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Ignore clipboard failures in restricted contexts.
    }
  }

  protected detail(key: string): string | null {
    return getItemDetailString(this.item().details, key);
  }

  protected typeIcon(): string {
    switch (this.item().type) {
      case 'FLIGHT':
        return 'flight';
      case 'RESERVED_TRANSIT':
        return 'train';
      case 'LOCAL_TRANSIT':
        return 'subway';
      case 'STAY':
        return 'hotel';
      case 'FOOD':
        return 'restaurant';
      default:
        return 'place';
    }
  }

  protected typeLabel():
    | 'item.type.flight'
    | 'item.type.reservedTransit'
    | 'item.type.localTransit'
    | 'item.type.stay'
    | 'item.type.spot'
    | 'item.type.food' {
    switch (this.item().type) {
      case 'FLIGHT':
        return 'item.type.flight';
      case 'RESERVED_TRANSIT':
        return 'item.type.reservedTransit';
      case 'LOCAL_TRANSIT':
        return 'item.type.localTransit';
      case 'STAY':
        return 'item.type.stay';
      case 'FOOD':
        return 'item.type.food';
      default:
        return 'item.type.spot';
    }
  }

  protected mapsUrl(): string | null {
    return buildGoogleMapsUrl(this.item());
  }
}
