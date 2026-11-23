import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItemAttachment, ItineraryItem } from '../../core/models/tripilot.models';
import { ItemExpenseSummary } from '../../state/expense.store';

/** Renders split-transit and venue itinerary cards with synced map pins, attachments, and 1-tap expense logging. */
@Component({
  selector: 'app-itinerary-card',
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (item().type === 'LOCAL_TRANSIT') {
      <div class="connector-wrap">
        <div class="connector-line" aria-hidden="true"></div>
        <div class="connector-pill">
          <span class="ms-icon sm" aria-hidden="true">subway</span>
          <span>{{ item().title }}</span>
          @if (detail('duration_minutes')) {
            <span class="tabular-nums">· {{ detail('duration_minutes') }} min</span>
          }
          @if (mapsUrl()) {
            <a [href]="mapsUrl()" target="_blank" rel="noopener noreferrer" class="connector-link">
              <span class="ms-icon sm">open_in_new</span>
            </a>
          }
          @if (!readOnly()) {
            <button
              type="button"
              class="mini-btn accent"
              (click)="logExpense.emit(item())"
              [title]="'item.logExpense' | t"
              [attr.aria-label]="'item.logExpense' | t"
            >
              <span class="ms-icon sm">payments</span>
            </button>
            <button type="button" class="mini-btn" (click)="edited.emit(item())" aria-label="Edit">
              <span class="ms-icon sm">edit</span>
            </button>
            <button type="button" class="mini-btn" (click)="deleted.emit(item().id)" aria-label="Delete">
              <span class="ms-icon sm">close</span>
            </button>
          }
        </div>
        <div class="connector-line" aria-hidden="true"></div>
      </div>
    } @else if (item().type === 'FLIGHT') {
      <article
        class="card flight-card"
        [class.selected]="selected()"
        (click)="cardClicked.emit(item().id)"
      >
        <div class="flight-top">
          <div class="flight-head-left">
            <span class="flight-tag">
              <span class="ms-icon sm" aria-hidden="true">flight</span>
              <span>{{ detail('flight_number') || item().title }}</span>
            </span>
            @if (detail('booking_ref')) {
              <span class="ref-chip">{{ detail('booking_ref') }}</span>
            }
          </div>

          @if (!readOnly()) {
            <div class="head-actions" (click)="$event.stopPropagation()">
              <button
                type="button"
                class="head-icon-btn dark accent-dark"
                [title]="'item.logExpense' | t"
                [attr.aria-label]="'item.logExpense' | t"
                (click)="logExpense.emit(item())"
              >
                <span class="ms-icon sm" aria-hidden="true">payments</span>
              </button>
              <div class="overflow-anchor">
                <button
                  type="button"
                  class="head-icon-btn dark"
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

        @if (attachments().length > 0 || expenseSummary()) {
          <div class="micro-pills dark" (click)="$event.stopPropagation()">
            @if (attachments().length > 0) {
              <button
                type="button"
                class="micro-pill dark"
                (click)="attachmentsOpen.set(!attachmentsOpen())"
              >
                <span class="ms-icon sm" aria-hidden="true">attach_file</span>
                <span>
                  {{
                    attachments().length === 1
                      ? ('item.attachmentSingle' | t)
                      : ('item.attachmentsBadge' | t: { count: attachments().length })
                  }}
                </span>
              </button>
            }
            @if (expenseSummary(); as exp) {
              @if (tripId()) {
                <a
                  class="micro-pill dark expense-pill-dark tabular-nums"
                  [routerLink]="['/trips', tripId(), 'expenses']"
                  [queryParams]="{ itemId: item().id }"
                >
                  <span class="ms-icon sm" aria-hidden="true">receipt_long</span>
                  <span>
                    {{
                      'expenses.itemSummary'
                        | t: { count: exp.count, currency: exp.currencyHome, total: formatAmount(exp.totalHome) }
                    }}
                  </span>
                </a>
              }
            }
          </div>

          @if (attachmentsOpen() && attachments().length > 0) {
            <div class="attachment-drawer dark" (click)="$event.stopPropagation()">
              @for (att of attachments(); track $index) {
                <a
                  class="attachment-item dark"
                  [href]="att.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="ms-icon sm" aria-hidden="true">open_in_new</span>
                  <span>{{ att.name }}</span>
                </a>
              }
            </div>
          }
        }

        @if (!readOnly()) {
          <div class="card-footer dark">
            <div class="order-controls">
              <button
                type="button"
                class="order-btn dark"
                (click)="$event.stopPropagation(); moveUp.emit(item())"
                aria-label="Move up"
              >
                <span class="ms-icon sm">keyboard_arrow_up</span>
              </button>
              <button
                type="button"
                class="order-btn dark"
                (click)="$event.stopPropagation(); moveDown.emit(item())"
                aria-label="Move down"
              >
                <span class="ms-icon sm">keyboard_arrow_down</span>
              </button>
            </div>
          </div>
        }
      </article>
    } @else {
      <article
        class="card standard-card"
        [class.selected]="selected()"
        [attr.data-type]="item().type"
        (click)="cardClicked.emit(item().id)"
      >
        <div class="card-head">
          <div class="card-meta">
            @if (pinOrder() !== null) {
              <span class="pin-badge tabular-nums" [class.selected]="selected()">
                {{ pinOrder() }}
              </span>
            }
            <span class="type-pill">
              <span class="ms-icon sm" aria-hidden="true">{{ typeIcon() }}</span>
              <span>{{ typeLabel() | t }}</span>
            </span>
            @if (item().start_time) {
              <span class="time-pill tabular-nums">
                {{ item().start_time }}@if (item().end_time) { – {{ item().end_time }} }
              </span>
            }
          </div>

          <div class="head-actions" (click)="$event.stopPropagation()">
            @if (mapsUrl()) {
              <a
                class="head-icon-btn"
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
                class="head-icon-btn expense-trigger"
                [title]="'item.logExpense' | t"
                [attr.aria-label]="'item.logExpense' | t"
                (click)="logExpense.emit(item())"
              >
                <span class="ms-icon sm" aria-hidden="true">payments</span>
              </button>

              <div class="overflow-anchor">
                <button
                  type="button"
                  class="head-icon-btn"
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

        @if (hasMicroPills()) {
          <div class="micro-pills" (click)="$event.stopPropagation()">
            @if (detail('local_name'); as localName) {
              <button
                type="button"
                class="micro-pill"
                (click)="copyLocalName(localName)"
                [title]="localName"
              >
                <span class="ms-icon sm" aria-hidden="true">
                  {{ copiedLocal() ? 'check' : 'content_copy' }}
                </span>
                <span class="pill-truncate">
                  {{ copiedLocal() ? ('common.copied' | t) : localName }}
                </span>
              </button>
            }

            @if (attachments().length > 0) {
              <button
                type="button"
                class="micro-pill"
                [class.active]="attachmentsOpen()"
                (click)="attachmentsOpen.set(!attachmentsOpen())"
              >
                <span class="ms-icon sm" aria-hidden="true">attach_file</span>
                <span>
                  {{
                    attachments().length === 1
                      ? ('item.attachmentSingle' | t)
                      : ('item.attachmentsBadge' | t: { count: attachments().length })
                  }}
                </span>
              </button>
            }

            @if (expenseSummary(); as exp) {
              @if (tripId()) {
                <a
                  class="micro-pill expense-pill tabular-nums"
                  [routerLink]="['/trips', tripId(), 'expenses']"
                  [queryParams]="{ itemId: item().id }"
                >
                  <span class="ms-icon sm" aria-hidden="true">receipt_long</span>
                  <span>
                    {{
                      'expenses.itemSummary'
                        | t: { count: exp.count, currency: exp.currencyHome, total: formatAmount(exp.totalHome) }
                    }}
                  </span>
                </a>
              }
            }
          </div>
        }

        @if (attachmentsOpen() && attachments().length > 0) {
          <div class="attachment-drawer" (click)="$event.stopPropagation()">
            @for (att of attachments(); track $index) {
              <a
                class="attachment-item"
                [href]="att.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="ms-icon sm" aria-hidden="true">open_in_new</span>
                <span>{{ att.name }}</span>
              </a>
            }
          </div>
        }

        @if (hasDetailChips()) {
          <div class="detail-chips">
            @if (detail('line_or_train_no')) {
              <span class="info-chip">
                <span class="ms-icon sm">train</span> {{ detail('line_or_train_no') }}
              </span>
            }
            @if (detail('seat')) {
              <span class="info-chip">{{ detail('seat') }}</span>
            }
            @if (detail('booking_ref')) {
              <span class="info-chip">Ref: {{ detail('booking_ref') }}</span>
            }
            @if (detail('confirmation_code')) {
              <span class="info-chip">Conf: {{ detail('confirmation_code') }}</span>
            }
            @if (detail('free_cancellation_deadline')) {
              <span class="alert-chip">
                <span class="ms-icon sm">warning</span> {{ detail('free_cancellation_deadline') }}
              </span>
            }
          </div>
        }

        @if (item().notes) {
          <p class="card-notes">{{ item().notes }}</p>
        }

        @if (!readOnly()) {
          <div class="card-footer">
            <div class="order-controls">
              <button
                type="button"
                class="order-btn"
                (click)="$event.stopPropagation(); moveUp.emit(item())"
                aria-label="Move up"
              >
                <span class="ms-icon sm">keyboard_arrow_up</span>
              </button>
              <button
                type="button"
                class="order-btn"
                (click)="$event.stopPropagation(); moveDown.emit(item())"
                aria-label="Move down"
              >
                <span class="ms-icon sm">keyboard_arrow_down</span>
              </button>
            </div>
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
      gap: 6px;
      padding: 5px 12px;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .connector-link {
      display: inline-flex;
      color: var(--color-primary);
      text-decoration: none;
    }
    .mini-btn {
      display: inline-flex;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 2px;
    }
    .mini-btn.accent {
      color: #8b652d;
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
    .ref-chip {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.14);
      font-family: var(--font-mono);
      font-size: 0.75rem;
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
      font-weight: 800;
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
      background: rgba(200, 155, 91, 0.55);
    }
    .flight-km {
      color: var(--color-accent);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .standard-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-left: 4px solid var(--item-spot);
    }
    .standard-card[data-type='STAY'] {
      border-left-color: var(--item-stay);
    }
    .standard-card[data-type='FOOD'] {
      border-left-color: var(--item-food);
    }
    .standard-card[data-type='RESERVED_TRANSIT'] {
      border-left-color: var(--item-reserved);
    }
    .card-head {
      display: flex;
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
      background: var(--color-primary);
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 800;
      flex-shrink: 0;
    }
    .pin-badge.selected {
      background: var(--color-accent);
    }
    .type-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-primary);
      font-size: 0.72rem;
      font-weight: 700;
    }
    .time-pill {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .head-actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .head-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-secondary);
      text-decoration: none;
      cursor: pointer;
      transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;
    }
    .head-icon-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .head-icon-btn.expense-trigger {
      border-color: rgba(200, 155, 91, 0.55);
      background: var(--color-accent-soft);
      color: #8b652d;
    }
    .head-icon-btn.expense-trigger:hover {
      border-color: var(--color-accent);
      background: var(--color-accent);
      color: #ffffff;
    }
    .head-icon-btn.dark {
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }
    .head-icon-btn.dark:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .head-icon-btn.accent-dark {
      border-color: rgba(200, 155, 91, 0.65);
      background: rgba(200, 155, 91, 0.22);
      color: #f3d7a4;
    }
    .overflow-anchor {
      position: relative;
    }
    .action-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 158px;
      padding: 6px;
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
      z-index: 40;
      display: flex;
      flex-direction: column;
      gap: 2px;
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
    .action-menu-item:hover {
      background: var(--color-bg);
    }
    .action-menu-item.danger {
      color: var(--color-alert);
    }
    .action-menu-divider {
      height: 1px;
      background: var(--color-border);
      margin: 4px 2px;
    }
    .card-title {
      margin: 0 0 4px;
      font-size: 1rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .card-sub {
      margin: 0 0 6px;
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
    }
    .micro-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .micro-pills.dark {
      margin-top: 10px;
    }
    .micro-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
      padding: 3px 9px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-secondary);
      text-decoration: none;
      font: inherit;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
    }
    .micro-pill:hover,
    .micro-pill.active {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .pill-truncate {
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .micro-pill.expense-pill {
      border-color: rgba(200, 155, 91, 0.5);
      background: var(--color-accent-soft);
      color: #8b652d;
    }
    .micro-pill.dark {
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }
    .micro-pill.expense-pill-dark {
      border-color: rgba(200, 155, 91, 0.6);
      background: rgba(200, 155, 91, 0.2);
      color: #f3d7a4;
    }
    .attachment-drawer {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
      padding: 8px;
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .attachment-drawer.dark {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.18);
    }
    .attachment-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
      text-decoration: none;
    }
    .attachment-item:hover {
      text-decoration: underline;
    }
    .attachment-item.dark {
      color: #f3d7a4;
    }
    .detail-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .info-chip,
    .alert-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .info-chip {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .alert-chip {
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    .card-notes {
      margin: 8px 0 0;
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      white-space: pre-line;
    }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid var(--color-border);
    }
    .card-footer.dark {
      border-top-color: rgba(255, 255, 255, 0.14);
    }
    .order-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .order-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 26px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-text-muted);
      cursor: pointer;
    }
    .order-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .order-btn.dark {
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
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
  protected readonly attachmentsOpen = signal(false);

  protected readonly attachments = computed<ItemAttachment[]>(() => {
    const raw = this.item().details?.['attachments'];
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter(
      (entry): entry is ItemAttachment =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ItemAttachment).url === 'string' &&
        (entry as ItemAttachment).url.trim().length > 0,
    );
  });

  protected hasMicroPills(): boolean {
    return (
      Boolean(this.detail('local_name')) ||
      this.attachments().length > 0 ||
      this.expenseSummary() !== null
    );
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

  protected onAddAlternative(): void {
    this.menuOpen.set(false);
    this.addAlternative.emit(this.item());
  }

  protected onDelete(): void {
    this.menuOpen.set(false);
    this.deleted.emit(this.item().id);
  }

  @HostListener('document:click', ['$event'])
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

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
    }
  }

  protected async copyLocalName(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedLocal.set(true);
      setTimeout(() => this.copiedLocal.set(false), 1600);
    } catch {
      // Ignore clipboard failures in restricted contexts.
    }
  }

  protected detail(key: string): string | null {
    const val = this.item().details?.[key];
    return val === undefined || val === null || val === '' ? null : String(val);
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
    const it = this.item();
    if (it.google_maps_url) {
      return it.google_maps_url;
    }
    if (it.latitude !== null && it.longitude !== null) {
      return `https://www.google.com/maps/search/?api=1&query=${it.latitude},${it.longitude}`;
    }
    if (it.address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.address)}`;
    }
    return null;
  }
}
