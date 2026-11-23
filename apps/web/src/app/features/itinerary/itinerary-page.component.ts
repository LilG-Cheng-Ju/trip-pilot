import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem } from '../../core/models/tripilot.models';
import { AppModalComponent } from '../../shared/modal.component';
import { TripSubnavComponent } from '../../shared/trip-subnav.component';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';
import { TripStore } from '../../state/trip.store';
import { QuickExpenseModalComponent } from '../expenses/quick-expense-modal.component';
import {
  ItemFormModalComponent,
  ItemFormSubmitEvent,
} from './item-form-modal.component';
import { ItineraryCardComponent } from './itinerary-card.component';
import {
  ItineraryMapComponent,
  MapPin,
  StayMapPin,
} from './itinerary-map.component';

interface TimelineSlot {
  key: string;
  activeItem: ItineraryItem;
  choices: ItineraryItem[];
}

/** Mobile-first itinerary timeline with Day 1..N, Plan A/B, slot choices, and map sync. */
@Component({
  selector: 'app-itinerary-page',
  imports: [
    FormsModule,
    TranslatePipe,
    AppModalComponent,
    TripSubnavComponent,
    ItemFormModalComponent,
    ItineraryCardComponent,
    ItineraryMapComponent,
    QuickExpenseModalComponent,
  ],
  template: `
    @if (store.trip(); as trip) {
      <div class="itinerary-layout">
        <section class="timeline-pane">
          <!-- Frozen Header + Workspace Tabs + Day 1..N Strip -->
          <div class="sticky-trip-top">
            <app-trip-subnav
              [tripId]="trip.id"
              [title]="trip.title"
              [dateRange]="trip.start_date + ' — ' + trip.end_date"
            >
              @if (store.usingOfflineCache()) {
                <span class="status-pill offline" [title]="'sync.offlineCache' | t">
                  <span class="ms-icon sm" aria-hidden="true">cloud_off</span>
                </span>
              } @else if (store.syncing()) {
                <span class="status-pill syncing" [title]="'sync.syncing' | t">
                  <span class="ms-icon sm spin" aria-hidden="true">sync</span>
                </span>
              }
              <button
                type="button"
                class="util-icon-btn"
                [title]="'common.share' | t"
                [attr.aria-label]="'common.share' | t"
                (click)="openShareModal(trip.id)"
              >
                <span class="ms-icon sm" aria-hidden="true">share</span>
              </button>
            </app-trip-subnav>

            <!-- Horizontal Day Switcher (wheel + arrow + touch scroll) -->
            <div class="day-strip-wrap">
              <button
                type="button"
                class="day-scroll-btn"
                aria-label="Scroll days left"
                (click)="scrollDayStrip(-200)"
              >
                <span class="ms-icon sm" aria-hidden="true">chevron_left</span>
              </button>

              <div
                #dayStrip
                class="day-strip"
                role="tablist"
                (wheel)="onDayStripWheel($event)"
              >
                @for (day of trip.days; track day.id) {
                  <button
                    type="button"
                    class="day-chip tabular-nums"
                    [class.active]="store.selectedDay()?.id === day.id"
                    (click)="store.selectDay(day.day_index)"
                  >
                    <span class="day-num">Day {{ day.day_index }}</span>
                    <span class="day-date">{{ day.date.slice(5) }}</span>
                  </button>
                }
                <button type="button" class="day-add-btn" (click)="store.appendDay()">
                  {{ 'itinerary.addDay' | t }}
                </button>
              </div>

              <button
                type="button"
                class="day-scroll-btn"
                aria-label="Scroll days right"
                (click)="scrollDayStrip(200)"
              >
                <span class="ms-icon sm" aria-hidden="true">chevron_right</span>
              </button>
            </div>
          </div>

          <div class="timeline-scroll">
            @if (store.selectedDay(); as day) {
              <!-- Inline Editable Day Theme / Focus -->
              <div class="day-theme-bar">
                <span class="ms-icon sm theme-ico" aria-hidden="true">flag</span>
                <input
                  type="text"
                  class="day-theme-input"
                  [ngModel]="day.title || ''"
                  (blur)="saveDayTheme(day.id, $any($event.target).value, day.title)"
                  (keydown.enter)="$any($event.target).blur()"
                  [placeholder]="'itinerary.dayThemePlaceholder' | t"
                />
              </div>

              <!-- Whole-Day Plan A / Plan B Segmented Switcher -->
              <div class="plan-bar">
                <div class="plan-pills">
                  @for (opt of day.options; track opt.id) {
                    <button
                      type="button"
                      class="plan-pill"
                      [class.selected]="store.selectedOption()?.id === opt.id"
                      (click)="store.previewOption(day.id, opt.id)"
                    >
                      @if (day.active_option_id === opt.id) {
                        <span class="active-dot" aria-hidden="true"></span>
                      }
                      <span>{{ opt.label }}</span>
                      @if (opt.cached_ground_distance_km > 0) {
                        <span class="opt-km tabular-nums">
                          {{ opt.cached_distance_is_approx ? '~' : '' }}{{ opt.cached_ground_distance_km }} km
                        </span>
                      }
                    </button>
                  }
                </div>
                <button type="button" class="clone-btn" (click)="openCloneModal()">
                  {{ 'itinerary.plan.addOption' | t }}
                </button>
              </div>

              @if (store.selectedOption(); as option) {
                @if (!store.isPreviewingActiveOption()) {
                  <div class="activate-banner">
                    <span>{{ option.label }}</span>
                    <button
                      type="button"
                      class="btn-accent"
                      (click)="store.setActiveOption(day.id, option.id)"
                    >
                      {{ 'itinerary.plan.setActive' | t }}
                    </button>
                  </div>
                }

                <div class="summary-bar">
                  <span class="summary-text tabular-nums">
                    {{ 'itinerary.summary.stops' | t: { count: store.stopCount() } }}
                    · {{ option.cached_distance_is_approx ? '~' : '' }}{{ option.cached_ground_distance_km }} km
                  </span>

                  <button type="button" class="add-item-btn" (click)="openAddItemModal()">
                    <span class="ms-icon sm" aria-hidden="true">add</span>
                    <span>{{ 'itinerary.addItem' | t }}</span>
                  </button>
                </div>

                @if (timelineSlots().length === 0) {
                  <div class="empty-day">{{ 'itinerary.emptyDay' | t }}</div>
                } @else {
                  <div class="timeline-list">
                    @for (slot of timelineSlots(); track slot.key) {
                      <div class="slot-group" [class.has-choices]="slot.choices.length > 1">
                        @if (slot.choices.length > 1) {
                          <div class="choice-bar">
                            <div class="choice-pills">
                              @for (choice of slot.choices; track choice.id) {
                                <button
                                  type="button"
                                  class="choice-pill"
                                  [class.active]="choice.is_selected"
                                  (click)="store.selectChoiceItem(choice.id)"
                                >
                                  @if (choice.is_selected) {
                                    <span class="choice-dot" aria-hidden="true"></span>
                                  }
                                  <span>{{ choice.title }}</span>
                                </button>
                              }
                            </div>
                            <button
                              type="button"
                              class="choice-add-btn"
                              (click)="openAlternativeModal(slot.activeItem)"
                              aria-label="Add alternative"
                            >
                              <span class="ms-icon sm">add</span>
                            </button>
                          </div>
                        }

                        <app-itinerary-card
                          [item]="slot.activeItem"
                          [tripId]="trip.id"
                          [pinOrder]="pinOrderById().get(slot.activeItem.id) ?? null"
                          [selected]="store.selectedItemId() === slot.activeItem.id"
                          [expenseSummary]="expenseStore.expensesByItemId()[slot.activeItem.id] ?? null"
                          (cardClicked)="store.selectItem($event)"
                          (moveUp)="store.moveItem($event, -1)"
                          (moveDown)="store.moveItem($event, 1)"
                          (addAlternative)="openAlternativeModal($event)"
                          (logExpense)="openQuickExpenseModal($event)"
                          (edited)="openEditItemModal($event)"
                          (deleted)="store.deleteItem($event)"
                        />
                      </div>
                    }
                  </div>
                }
              }
            }
          </div>
        </section>

        <!-- Always-on Desktop Split Map -->
        <aside class="desktop-map-pane">
          <app-itinerary-map
            [pins]="mapPins()"
            [routePath]="mapRoutePath()"
            [stayPin]="stayMapPin()"
            [connectFromStay]="connectFromStay()"
            [connectToStay]="connectToStay()"
            [selectedPinId]="store.selectedItemId()"
            (pinSelected)="store.selectItem($event)"
          />
        </aside>
      </div>

      <!-- Mobile Floating Map Pill (Thumb-Zone Airbnb pattern) -->
      @if (!store.mobileMapOpen()) {
        <button
          type="button"
          class="mobile-map-fab"
          (click)="store.setMobileMapOpen(true)"
        >
          <span class="ms-icon sm fab-ico" aria-hidden="true">map</span>
          <span>{{ 'map.openSheet' | t }}</span>
        </button>
      }

      <!-- Mobile Non-Destructive Bottom Sheet Map Overlay -->
      @if (store.mobileMapOpen()) {
        <div class="mobile-map-sheet" role="dialog" aria-label="Interactive Map">
          <div class="sheet-bar">
            <span class="sheet-handle" aria-hidden="true"></span>
            <span class="sheet-title tabular-nums">
              @if (store.selectedDay(); as d) {
                Day {{ d.day_index }} · {{ d.date.slice(5) }}
              }
            </span>
            <button
              type="button"
              class="sheet-close-btn"
              (click)="store.setMobileMapOpen(false)"
            >
              <span class="ms-icon sm" aria-hidden="true">close</span>
              <span>{{ 'map.closeSheet' | t }}</span>
            </button>
          </div>
          <div class="sheet-map-body">
            <app-itinerary-map
              [pins]="mapPins()"
              [routePath]="mapRoutePath()"
              [stayPin]="stayMapPin()"
              [connectFromStay]="connectFromStay()"
              [connectToStay]="connectToStay()"
              [selectedPinId]="store.selectedItemId()"
              (pinSelected)="store.selectItem($event)"
            />
          </div>
        </div>
      }

      <!-- Unified Add / Edit / Alternative Item Modal -->
      <app-item-form-modal
        [open]="showItemModal()"
        [editingItem]="editingItem()"
        [alternativeFor]="alternativeTarget()"
        (closed)="showItemModal.set(false)"
        (saved)="handleItemSaved($event)"
      />

      <!-- 1-Tap Quick Expense Modal -->
      <app-quick-expense-modal
        [open]="showQuickExpenseModal()"
        [tripId]="trip.id"
        [tripDayId]="store.selectedDay()?.id ?? null"
        [item]="quickExpenseItem()"
        [defaultCurrency]="trip.default_currency"
        [homeCurrency]="expenseStore.summary()?.home_currency ?? 'TWD'"
        (closed)="showQuickExpenseModal.set(false)"
      />

      <!-- Modal: Create Plan B Option -->
      <app-modal
        [open]="showCloneModal()"
        [title]="'itinerary.plan.modalTitle' | t"
        (closed)="showCloneModal.set(false)"
      >
        <form class="modal-form" (ngSubmit)="submitCloneOption()" novalidate>
          <label class="field" [class.has-error]="cloneLabelError()">
            <span>{{ 'itinerary.plan.clonePrompt' | t }} <em class="req">*</em></span>
            <input
              type="text"
              [(ngModel)]="cloneLabel"
              name="cloneLabel"
              (ngModelChange)="cloneLabelError.set(false)"
              placeholder="Plan B · 雨天室內版"
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

      <!-- Modal: Read-Only Share Settings -->
      <app-modal
        [open]="showShareModal()"
        [title]="'share.title' | t"
        (closed)="showShareModal.set(false)"
      >
        <div class="share-options">
          <label class="check-row">
            <input type="checkbox" [(ngModel)]="hideSecrets" name="hideSecrets" />
            <span>{{ 'share.hideSecrets' | t }}</span>
          </label>
          <label class="check-row">
            <input type="checkbox" [(ngModel)]="includeNotes" name="includeNotes" />
            <span>{{ 'share.includeNotes' | t }}</span>
          </label>
          <label class="check-row">
            <input type="checkbox" [(ngModel)]="includeBackups" name="includeBackups" />
            <span>{{ 'share.includeBackups' | t }}</span>
          </label>
          <button type="button" class="add-item-btn" (click)="createShareLink(trip.id)">
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
                <button type="button" class="pill-btn danger" (click)="store.revokeShare(trip.id, share.id)">
                  {{ 'share.revoke' | t }}
                </button>
              </div>
            </div>
          }
        }
      </app-modal>
    } @else if (store.loading()) {
      <div class="cold-start-box">
        <span class="ms-icon lg spin" aria-hidden="true">progress_activity</span>
        <p>{{ 'sync.wakingServer' | t }}</p>
      </div>
    }
  `,
  styles: `
    .itinerary-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      min-height: calc(100dvh - 56px);
    }
    .timeline-pane {
      min-width: 0;
      display: flex;
      flex-direction: column;
      max-width: 780px;
      width: 100%;
      margin: 0 auto;
    }
    .sticky-trip-top {
      position: sticky;
      top: 56px;
      z-index: 20;
      background: var(--color-bg);
      padding: var(--space-3) var(--space-4) var(--space-2);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }
    .timeline-scroll {
      padding: var(--space-3) var(--space-4) calc(var(--nav-bottom-height) + 76px);
    }
    .desktop-map-pane {
      display: none;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
    }
    .status-pill.syncing {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .status-pill.offline {
      background: var(--color-accent-soft);
      color: #8b652d;
    }
    .spin {
      animation: tp-spin 1s linear infinite;
    }
    @keyframes tp-spin {
      to {
        transform: rotate(360deg);
      }
    }
    .util-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: 9px;
      background: var(--color-surface);
      color: var(--color-primary);
      cursor: pointer;
    }
    .util-icon-btn:hover,
    .util-icon-btn.active {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
    }
    .day-strip-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
    }
    .day-scroll-btn {
      display: none;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 44px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-surface);
      color: var(--color-text-secondary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .day-scroll-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .day-strip {
      display: flex;
      flex: 1;
      min-width: 0;
      gap: 8px;
      max-width: 100%;
      overflow-x: auto;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding: 2px 0;
    }
    .day-strip::-webkit-scrollbar {
      display: none;
    }
    .mobile-map-fab {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: calc(var(--nav-bottom-height) + env(safe-area-inset-bottom) + 12px);
      z-index: 35;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 700;
      box-shadow: 0 8px 24px rgba(27, 42, 74, 0.32);
      cursor: pointer;
    }
    .fab-ico {
      color: var(--color-accent);
    }
    .mobile-map-sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: calc(var(--nav-bottom-height) + env(safe-area-inset-bottom));
      height: 70dvh;
      z-index: 38;
      display: flex;
      flex-direction: column;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -10px 30px rgba(15, 23, 42, 0.22);
      overflow: hidden;
    }
    .sheet-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      position: relative;
    }
    .sheet-handle {
      position: absolute;
      top: 5px;
      left: 50%;
      transform: translateX(-50%);
      width: 36px;
      height: 4px;
      border-radius: 99px;
      background: var(--color-border);
    }
    .sheet-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .sheet-close-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 11px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.76rem;
      font-weight: 700;
      cursor: pointer;
    }
    .sheet-map-body {
      flex: 1;
      min-height: 0;
      padding: 8px;
    }
    .cold-start-box {
      max-width: 420px;
      margin: 48px auto;
      padding: var(--space-6);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }
    .cold-start-box p {
      margin: 0;
      font-size: 0.85rem;
    }
    .day-chip {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 72px;
      padding: 8px 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      cursor: pointer;
    }
    .day-chip.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .day-num {
      font-weight: 700;
      font-size: 0.875rem;
    }
    .day-date {
      font-size: 0.7rem;
      opacity: 0.8;
    }
    .day-add-btn {
      flex-shrink: 0;
      padding: 8px 14px;
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .day-theme-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      margin-bottom: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
    }
    .day-theme-bar:focus-within {
      border-color: var(--color-accent);
    }
    .theme-ico {
      color: var(--color-accent);
      flex-shrink: 0;
    }
    .day-theme-input {
      width: 100%;
      border: none;
      background: transparent;
      color: var(--color-primary);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      outline: none;
    }
    .day-theme-input::placeholder {
      color: var(--color-text-muted);
      font-weight: 400;
    }
    .plan-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
      flex-wrap: wrap;
    }
    .plan-pills {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px;
      background: var(--color-surface-muted);
      border-radius: var(--radius-pill);
    }
    .plan-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .plan-pill.selected {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: var(--shadow-card);
    }
    .active-dot,
    .choice-dot {
      width: 7px;
      height: 7px;
      border-radius: var(--radius-pill);
      background: var(--color-accent);
    }
    .opt-km {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .clone-btn {
      padding: 6px 12px;
      border: 1px dashed var(--color-accent);
      border-radius: var(--radius-pill);
      background: var(--color-accent-soft);
      color: #8b652d;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }
    .activate-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      margin-bottom: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-accent-soft);
      border: 1px solid var(--color-accent);
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .btn-accent,
    .add-item-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 7px 14px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .summary-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
    .summary-text {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .slot-group.has-choices {
      padding: 8px;
      border-radius: var(--radius-md);
      background: rgba(200, 155, 91, 0.08);
      border: 1px solid rgba(200, 155, 91, 0.35);
    }
    .choice-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 8px;
    }
    .choice-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .choice-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .choice-pill.active {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: #ffffff;
    }
    .choice-add-btn {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      border: 1px dashed var(--color-accent);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: #8b652d;
      cursor: pointer;
    }
    .empty-day {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
    }
    .modal-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .field input {
      padding: 9px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
    }
    .field.has-error input {
      border-color: var(--color-alert);
      background: var(--color-alert-soft);
    }
    .req {
      color: var(--color-alert);
      font-style: normal;
      font-weight: 700;
    }
    .err-msg {
      color: var(--color-alert);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .add-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
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

    .pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 7px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-primary);
      text-decoration: none;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
    }
    .pill-btn.danger {
      color: var(--color-alert);
    }
    @media (min-width: 768px) {
      .day-scroll-btn {
        display: inline-flex;
      }
    }
    @media (min-width: 1024px) {
      .mobile-map-fab,
      .mobile-map-sheet {
        display: none;
      }
      .itinerary-layout {
        grid-template-columns: minmax(440px, 46%) 1fr;
        height: calc(100dvh - 56px);
      }
      .timeline-pane {
        max-width: none;
        height: calc(100dvh - 56px);
        overflow: hidden;
      }
      .sticky-trip-top {
        position: static;
        padding: var(--space-4) var(--space-5) var(--space-3);
      }
      .timeline-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--space-4) var(--space-5) var(--space-6);
      }
      .desktop-map-pane {
        display: block;
        padding: var(--space-4) var(--space-4) var(--space-4) 0;
        height: calc(100dvh - 56px);
        position: sticky;
        top: 56px;
      }
    }
  `,
})
export class ItineraryPageComponent implements OnInit {
  protected readonly store = inject(ItineraryStore);
  protected readonly expenseStore = inject(ExpenseStore);
  private readonly tripStore = inject(TripStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly showItemModal = signal(false);
  protected readonly editingItem = signal<ItineraryItem | null>(null);
  protected readonly alternativeTarget = signal<ItineraryItem | null>(null);

  protected readonly showQuickExpenseModal = signal(false);
  protected readonly quickExpenseItem = signal<ItineraryItem | null>(null);

  protected readonly showCloneModal = signal(false);
  protected readonly showShareModal = signal(false);
  protected readonly copiedToken = signal<string | null>(null);
  protected readonly cloneLabelError = signal(false);

  protected cloneLabel = 'Plan B · 雨天備案';
  protected hideSecrets = true;
  protected includeNotes = false;
  protected includeBackups = false;

  /** Groups items sharing a choice_group_id into single timeline slots. */
  protected readonly timelineSlots = computed<TimelineSlot[]>(() => {
    const option = this.store.selectedOption();
    if (!option) return [];

    const slots: TimelineSlot[] = [];
    const seenGroups = new Set<string>();

    for (const item of option.items) {
      if (!item.choice_group_id) {
        slots.push({ key: item.id, activeItem: item, choices: [item] });
        continue;
      }
      if (seenGroups.has(item.choice_group_id)) {
        continue;
      }
      seenGroups.add(item.choice_group_id);
      const groupItems = option.items.filter(
        (candidate) => candidate.choice_group_id === item.choice_group_id,
      );
      const activeItem = groupItems.find((c) => c.is_selected) ?? groupItems[0];
      slots.push({
        key: item.choice_group_id,
        activeItem,
        choices: groupItems,
      });
    }
    return slots;
  });

  protected readonly stayMapPin = computed<StayMapPin | null>(() => {
    const stay = this.store.basecampStay();
    if (!stay || stay.latitude === null || stay.longitude === null) {
      return null;
    }
    return {
      id: stay.id,
      title: stay.title,
      lat: stay.latitude,
      lng: stay.longitude,
    };
  });

  protected readonly connectFromStay = computed(() => {
    const slots = this.timelineSlots();
    if (slots.length === 0) return false;
    // Skip departure leg from hotel on arrival days that begin with a flight.
    return slots[0].activeItem.type !== 'FLIGHT';
  });

  protected readonly connectToStay = computed(() => {
    const slots = this.timelineSlots();
    if (slots.length === 0) return false;
    // Skip return leg to hotel on departure days that end with a flight.
    return slots[slots.length - 1].activeItem.type !== 'FLIGHT';
  });

  /** Chronological coordinates across flights, stays, transit stations, and stops. */
  protected readonly mapRoutePath = computed<[number, number][]>(() =>
    this.timelineSlots()
      .map((slot) => slot.activeItem)
      .filter((item) => item.latitude !== null && item.longitude !== null)
      .map((item): [number, number] => [item.longitude!, item.latitude!]),
  );

  protected readonly mapPins = computed<MapPin[]>(() => {
    const basecampId = this.stayMapPin()?.id;
    const pins: MapPin[] = [];
    let order = 1;
    for (const slot of this.timelineSlots()) {
      const item = slot.activeItem;
      // Keep the active basecamp STAY on its dedicated hotel marker rather than numbering it.
      if (item.id === basecampId || item.type === 'STAY') {
        continue;
      }
      if (item.latitude !== null && item.longitude !== null) {
        pins.push({
          id: item.id,
          order: item.type === 'FLIGHT' ? 0 : order++,
          title: item.title,
          lat: item.latitude,
          lng: item.longitude,
          type: item.type,
        });
      }
    }
    return pins;
  });

  /** Lookup map syncing card pin numbers (1, 2, 3) with MapLibre markers. */
  protected readonly pinOrderById = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const pin of this.mapPins()) {
      if (pin.order > 0) {
        map.set(pin.id, pin.order);
      }
    }
    return map;
  });

  ngOnInit(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      this.tripStore.setLastSelectedTripId(tripId);
      void this.store.loadTrip(tripId);
      void this.expenseStore.loadExpenses(tripId);
    }
  }

  private readonly dayStrip = viewChild<ElementRef<HTMLDivElement>>('dayStrip');

  protected openQuickExpenseModal(item: ItineraryItem): void {
    this.quickExpenseItem.set(item);
    this.showQuickExpenseModal.set(true);
  }

  protected scrollDayStrip(deltaPx: number): void {
    const el = this.dayStrip()?.nativeElement;
    if (el) {
      el.scrollBy({ left: deltaPx, behavior: 'smooth' });
    }
  }

  protected onDayStripWheel(event: WheelEvent): void {
    const el = this.dayStrip()?.nativeElement;
    if (!el || el.scrollWidth <= el.clientWidth) {
      return;
    }
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    }
  }

  protected openAddItemModal(): void {
    this.editingItem.set(null);
    this.alternativeTarget.set(null);
    this.showItemModal.set(true);
  }

  protected openEditItemModal(item: ItineraryItem): void {
    this.editingItem.set(item);
    this.alternativeTarget.set(null);
    this.showItemModal.set(true);
  }

  protected openAlternativeModal(target: ItineraryItem): void {
    this.editingItem.set(null);
    this.alternativeTarget.set(target);
    this.showItemModal.set(true);
  }

  protected async handleItemSaved(event: ItemFormSubmitEvent): Promise<void> {
    if (event.editingItemId) {
      await this.store.updateItem(event.editingItemId, event.payload);
    } else {
      await this.store.addItem(event.payload);
    }
    this.showItemModal.set(false);
  }

  protected async saveDayTheme(
    dayId: string,
    nextValue: string,
    previousValue: string | null,
  ): Promise<void> {
    const trimmed = nextValue.trim();
    if (trimmed === (previousValue ?? '').trim()) {
      return;
    }
    await this.store.updateDayTitle(dayId, trimmed || null);
  }

  protected openCloneModal(): void {
    this.cloneLabel = 'Plan B · 雨天備案';
    this.cloneLabelError.set(false);
    this.showCloneModal.set(true);
  }

  protected async submitCloneOption(): Promise<void> {
    if (!this.cloneLabel.trim()) {
      this.cloneLabelError.set(true);
      return;
    }
    await this.store.cloneCurrentOption(this.cloneLabel.trim());
    this.showCloneModal.set(false);
  }

  protected openShareModal(tripId: string): void {
    this.showShareModal.set(true);
    void this.store.loadShares(tripId);
  }

  protected async createShareLink(tripId: string): Promise<void> {
    await this.store.createShare(tripId, 'Shared Link', {
      include_booking_refs: !this.hideSecrets,
      include_notes: this.includeNotes,
      include_expenses: false,
      include_backup_options: this.includeBackups,
    });
  }

  protected shareUrl(token: string): string {
    return `${window.location.origin}/s/${token}`;
  }

  protected async copyShareUrl(token: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl(token));
      this.copiedToken.set(token);
      setTimeout(() => this.copiedToken.set(null), 1800);
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts.
    }
  }
}
