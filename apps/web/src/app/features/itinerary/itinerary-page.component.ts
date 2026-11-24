import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import {
  COPY_FEEDBACK_DURATION_MS,
  DAY_STRIP_SCROLL_STEP_PX,
  SHARE_COPY_FEEDBACK_DURATION_MS,
} from '../../core/constants/app-limits';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem } from '../../core/models/tripilot.models';
import {
  buildGoogleMapsUrl,
  getItemDetailString,
  groupItemsIntoSlots,
  ItinerarySlot,
} from '../../core/utils/travel-format.utils';
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
                (click)="scrollDayStrip(-dayStripScrollStepPx)"
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
                (click)="scrollDayStrip(dayStripScrollStepPx)"
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

              <!-- Whole-Day Plan A / Plan B Segmented Switcher (shown once a day has 2+ plans) -->
              @if (day.options.length > 1) {
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
                  <div class="plan-actions">
                    @if (store.selectedOption(); as currentOpt) {
                      <button
                        type="button"
                        class="plan-icon-btn"
                        [title]="'itinerary.plan.rename' | t"
                        [attr.aria-label]="'itinerary.plan.rename' | t"
                        (click)="openRenameOptionModal(currentOpt.id, currentOpt.label)"
                      >
                        <span class="ms-icon sm" aria-hidden="true">edit</span>
                      </button>
                      <button
                        type="button"
                        class="plan-icon-btn danger"
                        [title]="'itinerary.plan.delete' | t"
                        [attr.aria-label]="'itinerary.plan.delete' | t"
                        (click)="confirmDeleteOption(day.id, currentOpt.id, currentOpt.label)"
                      >
                        <span class="ms-icon sm" aria-hidden="true">delete</span>
                      </button>
                    }
                    <button type="button" class="clone-btn" (click)="openCloneModal()">
                      {{ 'itinerary.plan.addOption' | t }}
                    </button>
                  </div>
                </div>
              }

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

                  <div class="summary-actions">
                    @if (day.options.length === 1) {
                      <button type="button" class="clone-btn" (click)="openCloneModal()">
                        {{ 'itinerary.plan.addOption' | t }}
                      </button>
                    }
                    <button type="button" class="add-item-btn" (click)="openAddItemModal()">
                      <span class="ms-icon sm" aria-hidden="true">add</span>
                      <span>{{ 'itinerary.addItem' | t }}</span>
                    </button>
                  </div>
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

            @if (selectedMapItem(); as spot) {
              <div class="map-mini-card" (click)="$event.stopPropagation()">
                <div class="mini-head">
                  <div class="mini-title-row">
                    @if (pinOrderById().get(spot.id); as num) {
                      <span class="mini-pin tabular-nums">{{ num }}</span>
                    } @else if (spot.type === 'STAY') {
                      <span class="mini-pin stay">
                        <span class="ms-icon sm" aria-hidden="true">hotel</span>
                      </span>
                    }
                    <strong class="mini-title">{{ spot.title }}</strong>
                  </div>
                  <button
                    type="button"
                    class="mini-close"
                    aria-label="Close preview"
                    (click)="store.selectItem(null)"
                  >
                    <span class="ms-icon sm" aria-hidden="true">close</span>
                  </button>
                </div>

                @if (spot.start_time || spot.address) {
                  <p class="mini-meta tabular-nums">
                    @if (spot.start_time) {
                      <span>
                        {{ spot.start_time }}@if (spot.end_time) { – {{ spot.end_time }} }
                      </span>
                    }
                    @if (spot.start_time && spot.address) { · }
                    @if (spot.address) {
                      <span>{{ spot.address }}</span>
                    }
                  </p>
                }

                <div class="mini-actions">
                  @if (itemMapsUrl(spot); as url) {
                    <a
                      class="mini-btn primary"
                      [href]="url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span class="ms-icon sm" aria-hidden="true">near_me</span>
                      <span>{{ 'common.navigate' | t }}</span>
                    </a>
                  }
                  @if (itemLocalName(spot); as localName) {
                    <button
                      type="button"
                      class="mini-btn"
                      (click)="copyMiniLocalName(localName)"
                    >
                      <span class="ms-icon sm" aria-hidden="true">
                        {{ copiedMiniLocal() ? 'check' : 'content_copy' }}
                      </span>
                      <span class="mini-truncate">
                        {{ copiedMiniLocal() ? ('common.copied' | t) : localName }}
                      </span>
                    </button>
                  }
                  <button
                    type="button"
                    class="mini-btn accent"
                    (click)="openQuickExpenseModal(spot)"
                  >
                    <span class="ms-icon sm" aria-hidden="true">payments</span>
                    <span>{{ 'item.spendShort' | t }}</span>
                  </button>
                </div>
              </div>
            }
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

      <!-- Modal: Create Day Plan Option (Blank or Clone) -->
      <app-modal
        [open]="showCloneModal()"
        [title]="'itinerary.plan.modalTitle' | t"
        (closed)="showCloneModal.set(false)"
      >
        <form class="modal-form" (ngSubmit)="submitCreateOption()" novalidate>
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

      <!-- Modal: Rename Day Plan Option -->
      <app-modal
        [open]="showRenameModal()"
        [title]="'itinerary.plan.rename' | t"
        (closed)="showRenameModal.set(false)"
      >
        <form class="modal-form" (ngSubmit)="submitRenameOption()" novalidate>
          <label class="field" [class.has-error]="renameLabelError()">
            <span>{{ 'itinerary.plan.clonePrompt' | t }} <em class="req">*</em></span>
            <input
              type="text"
              [(ngModel)]="renameLabel"
              name="renameLabel"
              (ngModelChange)="renameLabelError.set(false)"
              placeholder="Plan A · 晴天戶外版"
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

      <!-- Modal: Confirm Delete Day Plan Option -->
      <app-modal
        [open]="pendingDeleteOption() !== null"
        [title]="'itinerary.plan.delete' | t"
        (closed)="pendingDeleteOption.set(null)"
      >
        @if (pendingDeleteOption(); as target) {
          <div class="modal-form">
            <p class="confirm-copy">
              {{ 'itinerary.plan.deleteConfirm' | t: { name: target.label } }}
            </p>
            <div class="add-actions">
              <button
                type="button"
                class="pill-btn"
                (click)="pendingDeleteOption.set(null)"
              >
                {{ 'common.cancel' | t }}
              </button>
              <button
                type="button"
                class="btn-danger"
                (click)="executeDeleteOption()"
              >
                {{ 'itinerary.plan.delete' | t }}
              </button>
            </div>
          </div>
        }
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
      top: 54px;
      z-index: 20;
      background: rgba(245, 246, 248, 0.88);
      backdrop-filter: blur(12px);
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
      position: relative;
      flex: 1;
      min-height: 0;
      padding: 8px;
    }
    .map-mini-card {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 16px;
      z-index: 12;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.22);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mini-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .mini-title-row {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .mini-pin {
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font-size: 0.72rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    .mini-pin.stay {
      background: var(--color-accent);
    }
    .mini-title {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--color-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mini-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 7px;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      flex-shrink: 0;
    }
    .mini-meta {
      margin: 0;
      font-size: 0.76rem;
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mini-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 2px;
    }
    .mini-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 30px;
      padding: 0 10px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg);
      color: var(--color-primary);
      text-decoration: none;
      font: inherit;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
    }
    .mini-btn.primary {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #ffffff;
    }
    .mini-btn.accent {
      border-color: rgba(200, 155, 91, 0.55);
      background: var(--color-accent-soft);
      color: #8b652d;
    }
    .mini-truncate {
      max-width: 130px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
    .plan-actions,
    .summary-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .plan-icon-btn {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      cursor: pointer;
    }
    .plan-icon-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .plan-icon-btn.danger:hover {
      border-color: var(--color-alert);
      color: var(--color-alert);
    }
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
      border-radius: calc(var(--radius-sm) - 2px);
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
    .confirm-copy {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.55;
      color: var(--color-text-secondary);
    }
    .btn-danger {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-alert);
      color: #ffffff;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
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
  protected readonly newOptionMode = signal<'blank' | 'clone'>('blank');
  protected readonly showRenameModal = signal(false);
  protected readonly renamingOptionId = signal<string | null>(null);
  protected readonly renameLabelError = signal(false);
  protected readonly pendingDeleteOption = signal<{
    dayId: string;
    optionId: string;
    label: string;
  } | null>(null);
  protected readonly showShareModal = signal(false);
  protected readonly copiedToken = signal<string | null>(null);
  protected readonly copiedMiniLocal = signal(false);
  protected readonly cloneLabelError = signal(false);

  protected cloneLabel = 'Plan B · 雨天備案';
  protected renameLabel = '';
  protected hideSecrets = true;
  protected includeNotes = false;
  protected includeBackups = false;

  protected readonly canCloneCurrentOption = computed(
    () => (this.store.selectedOption()?.items.length ?? 0) > 0,
  );

  /** Groups items sharing a choice_group_id into single timeline slots. */
  protected readonly timelineSlots = computed<ItinerarySlot[]>(() => {
    const option = this.store.selectedOption();
    return option ? groupItemsIntoSlots(option.items) : [];
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

  protected readonly selectedMapItem = computed<ItineraryItem | null>(() => {
    const selectedId = this.store.selectedItemId();
    if (!selectedId) {
      return null;
    }
    const fromSlots = this.timelineSlots().find((s) => s.activeItem.id === selectedId)?.activeItem;
    if (fromSlots) {
      return fromSlots;
    }
    const stay = this.store.basecampStay();
    return stay && stay.id === selectedId ? stay : null;
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
  protected readonly dayStripScrollStepPx = DAY_STRIP_SCROLL_STEP_PX;

  protected itemMapsUrl(item: ItineraryItem): string | null {
    return buildGoogleMapsUrl(item);
  }

  protected itemLocalName(item: ItineraryItem): string | null {
    return getItemDetailString(item.details, 'local_name');
  }

  protected async copyMiniLocalName(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedMiniLocal.set(true);
      setTimeout(() => this.copiedMiniLocal.set(false), COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Ignore clipboard failures in restricted contexts.
    }
  }

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
    const count = this.store.selectedDay()?.options.length ?? 1;
    const nextLetter = String.fromCharCode(65 + Math.min(count, 25));
    this.cloneLabel = `Plan ${nextLetter}`;
    this.newOptionMode.set('blank');
    this.cloneLabelError.set(false);
    this.showCloneModal.set(true);
  }

  protected async submitCreateOption(): Promise<void> {
    if (!this.cloneLabel.trim()) {
      this.cloneLabelError.set(true);
      return;
    }
    const label = this.cloneLabel.trim();
    if (this.canCloneCurrentOption() && this.newOptionMode() === 'clone') {
      await this.store.cloneCurrentOption(label);
    } else {
      await this.store.createBlankOption(label);
    }
    this.showCloneModal.set(false);
  }

  protected openRenameOptionModal(optionId: string, currentLabel: string): void {
    this.renamingOptionId.set(optionId);
    this.renameLabel = currentLabel;
    this.renameLabelError.set(false);
    this.showRenameModal.set(true);
  }

  protected async submitRenameOption(): Promise<void> {
    const optionId = this.renamingOptionId();
    if (!optionId || !this.renameLabel.trim()) {
      this.renameLabelError.set(true);
      return;
    }
    await this.store.renameOption(optionId, this.renameLabel.trim());
    this.showRenameModal.set(false);
  }

  protected confirmDeleteOption(
    dayId: string,
    optionId: string,
    label: string,
  ): void {
    const day = this.store.selectedDay();
    if (!day || day.options.length <= 1) {
      return;
    }
    this.pendingDeleteOption.set({ dayId, optionId, label });
  }

  protected async executeDeleteOption(): Promise<void> {
    const target = this.pendingDeleteOption();
    if (!target) {
      return;
    }
    this.pendingDeleteOption.set(null);
    await this.store.deleteOption(target.dayId, target.optionId);
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
      setTimeout(() => this.copiedToken.set(null), SHARE_COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts.
    }
  }
}
