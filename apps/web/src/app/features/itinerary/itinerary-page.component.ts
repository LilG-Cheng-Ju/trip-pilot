import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  DAY_STRIP_SCROLL_STEP_PX,
  SHARE_COPY_FEEDBACK_DURATION_MS,
} from '../../core/constants/app-limits';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItineraryItem, TripDay } from '../../core/models/tripilot.models';
import { readCheckedValue, readInputValue } from '../../core/utils/form-events.utils';
import {
  buildDayMapPins,
  buildDayMapRoutes,
  buildGoogleMapsUrl,
  buildPinOrderMap,
  DayMapRoutes,
  getItemDetailString,
  groupItemsIntoSlots,
  ItinerarySlot,
  toStayMapPin,
} from '../../core/utils/travel-format.utils';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { AppModalComponent } from '../../shared/modal.component';
import { TripSubnavComponent } from '../../shared/trip-subnav.component';
import { AuthStore } from '../../state/auth.store';
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
import { MobileMapSheetComponent } from './mobile-map-sheet.component';

/** Mobile-first itinerary timeline with Day 1..N, Plan A/B, slot choices, and map sync. */
@Component({
  selector: 'app-itinerary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    CdkScrollable,
    TranslatePipe,
    AppConfirmModalComponent,
    AppModalComponent,
    TripSubnavComponent,
    ItemFormModalComponent,
    ItineraryCardComponent,
    ItineraryMapComponent,
    MobileMapSheetComponent,
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
                class="icon-btn util-icon-btn"
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
                [attr.aria-label]="'itinerary.dayScrollLeft' | t"
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
                    role="tab"
                    [attr.aria-selected]="store.selectedDay()?.id === day.id"
                    class="day-chip tabular-nums"
                    [class.active]="store.selectedDay()?.id === day.id"
                    (click)="selectDay(day.day_index, $event)"
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
                [attr.aria-label]="'itinerary.dayScrollRight' | t"
                (click)="scrollDayStrip(dayStripScrollStepPx)"
              >
                <span class="ms-icon sm" aria-hidden="true">chevron_right</span>
              </button>
            </div>
          </div>

          <div #timelineScroll class="timeline-scroll" cdkScrollable>
            @if (store.error(); as err) {
              <div class="error-banner" role="alert">
                <span>{{ err }}</span>
                <button
                  type="button"
                  class="error-dismiss"
                  [attr.aria-label]="'common.cancel' | t"
                  (click)="store.clearError()"
                >
                  <span class="ms-icon sm" aria-hidden="true">close</span>
                </button>
              </div>
            }
            @if (store.selectedDay(); as day) {
              <!-- Inline Editable Day Theme / Focus -->
              <div class="day-theme-bar">
                <span class="ms-icon sm theme-ico" aria-hidden="true">flag</span>
                <input
                  type="text"
                  class="day-theme-input"
                  [value]="day.title || ''"
                  (blur)="saveDayTheme(day.id, readInputValue($event), day.title)"
                  (keydown.enter)="blurInput($event)"
                  [placeholder]="'itinerary.dayThemePlaceholder' | t"
                />
                @if (trip.days.length > 1) {
                  <button
                    type="button"
                    class="icon-btn icon-btn--danger"
                    [title]="'itinerary.deleteDay' | t"
                    [attr.aria-label]="'itinerary.deleteDay' | t"
                    (click)="pendingDeleteDay.set(day)"
                  >
                    <span class="ms-icon sm" aria-hidden="true">delete</span>
                  </button>
                }
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
                        class="icon-btn"
                        [title]="'itinerary.plan.rename' | t"
                        [attr.aria-label]="'itinerary.plan.rename' | t"
                        (click)="openRenameOptionModal(currentOpt.id, currentOpt.label)"
                      >
                        <span class="ms-icon sm" aria-hidden="true">edit</span>
                      </button>
                      <button
                        type="button"
                        class="icon-btn icon-btn--danger"
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
                  <div class="empty-state">{{ 'itinerary.emptyDay' | t }}</div>
                } @else {
                  <div
                    class="timeline-list"
                    cdkDropList
                    [cdkDropListData]="timelineSlots()"
                    (cdkDropListDropped)="onSlotDropped($event)"
                  >
                    @for (slot of timelineSlots(); track slot.key; let first = $first, last = $last) {
                      <div
                        class="slot-group"
                        [class.has-choices]="slot.choices.length > 1"
                        [attr.data-slot-item-id]="slot.activeItem.id"
                        cdkDrag
                        [cdkDragData]="slot"
                        [cdkDragStartDelay]="{ touch: 180, mouse: 0 }"
                      >
                        <div class="slot-drag-placeholder" *cdkDragPlaceholder></div>
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
                              [attr.aria-label]="'itinerary.choice.addAlt' | t"
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
                          [canMoveUp]="!first"
                          [canMoveDown]="!last"
                          [expenseSummary]="expenseStore.expensesByItemId()[slot.activeItem.id] ?? null"
                          (cardClicked)="store.selectItem($event)"
                          (moveUp)="store.moveItem($event, -1)"
                          (moveDown)="store.moveItem($event, 1)"
                          (addAlternative)="openAlternativeModal($event)"
                          (logExpense)="openQuickExpenseModal($event)"
                          (edited)="openEditItemModal($event)"
                          (deleted)="requestDeleteItem(slot.activeItem)"
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
            [schematicRoutes]="schematicMapRoutes()"
            [roadRoutes]="roadMapRoutes()"
            [allowModeToggle]="true"
            [routeMode]="store.mapRouteMode()"
            (routeModeChange)="store.setMapRouteMode($event)"
            [departureStayPin]="departureStayMapPin()"
            [stayPin]="stayMapPin()"
            [selectedPinId]="store.selectedItemId()"
            (pinSelected)="onMapPinSelected($event)"
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
        <app-mobile-map-sheet
          [dayLabel]="selectedDayLabel()"
          [pins]="mapPins()"
          [schematicRoutes]="schematicMapRoutes()"
          [roadRoutes]="roadMapRoutes()"
          [allowModeToggle]="true"
          [routeMode]="store.mapRouteMode()"
          (routeModeChange)="store.setMapRouteMode($event)"
          [departureStayPin]="departureStayMapPin()"
          [stayPin]="stayMapPin()"
          [selectedPinId]="store.selectedItemId()"
          [selectedItem]="selectedMapItem()"
          [selectedPinOrder]="selectedMapItem() ? (pinOrderById().get(selectedMapItem()!.id) ?? null) : null"
          (pinSelected)="onMapPinSelected($event)"
          (clearSelection)="store.selectItem(null)"
          (logExpense)="openQuickExpenseModal($event)"
          (closed)="store.setMobileMapOpen(false)"
        />
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
        [homeCurrency]="
          expenseStore.summary()?.home_currency ??
          authStore.profile()?.home_currency ??
          'TWD'
        "
        (closed)="showQuickExpenseModal.set(false)"
      />

      <!-- Modal: Create Day Plan Option (Blank or Clone) -->
      <app-modal
        [open]="showCloneModal()"
        [title]="'itinerary.plan.modalTitle' | t"
        (closed)="showCloneModal.set(false)"
      >
        <form class="modal-form" (submit)="$event.preventDefault(); submitCreateOption()" novalidate>
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

      <!-- Modal: Rename Day Plan Option -->
      <app-modal
        [open]="showRenameModal()"
        [title]="'itinerary.plan.rename' | t"
        (closed)="showRenameModal.set(false)"
      >
        <form class="modal-form" (submit)="$event.preventDefault(); submitRenameOption()" novalidate>
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

      <!-- Confirm Delete Day -->
      <app-confirm-modal
        [open]="pendingDeleteDay() !== null"
        [title]="'confirm.deleteDayTitle' | t"
        [message]="
          pendingDeleteDay()
            ? ('confirm.deleteDayBody' | t: { day: pendingDeleteDay()!.day_index })
            : ''
        "
        [busy]="deletingDay()"
        (confirmed)="executeDeleteDay()"
        (cancelled)="pendingDeleteDay.set(null)"
      />

      <!-- Confirm Delete Day Plan Option -->
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
        (confirmed)="executeDeleteOption()"
        (cancelled)="pendingDeleteOption.set(null)"
      />

      <!-- Confirm Delete Itinerary Item -->
      <app-confirm-modal
        [open]="pendingDeleteItem() !== null"
        [title]="'confirm.deleteItemTitle' | t"
        [message]="
          pendingDeleteItem()
            ? ('confirm.deleteItemBody' | t: { name: pendingDeleteItem()!.title })
            : ''
        "
        [busy]="deletingItem()"
        (confirmed)="executeDeleteItem()"
        (cancelled)="pendingDeleteItem.set(null)"
      />

      <!-- Confirm Revoke Share Link -->
      <app-confirm-modal
        [open]="pendingRevokeShare() !== null"
        [title]="'confirm.revokeShareTitle' | t"
        [message]="'confirm.revokeShareBody' | t"
        [confirmLabel]="'share.revoke' | t"
        [busy]="revokingShare()"
        (confirmed)="executeRevokeShare()"
        (cancelled)="pendingRevokeShare.set(null)"
      />

      <!-- Modal: Read-Only Share Settings -->
      <app-modal
        [open]="showShareModal()"
        [title]="'share.title' | t"
        (closed)="showShareModal.set(false)"
      >
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
                <button type="button" class="pill-btn danger" (click)="requestRevokeShare(trip.id, share.id)">
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
    } @else {
      <div class="cold-start-box" role="alert">
        <span class="ms-icon lg" aria-hidden="true">error_outline</span>
        <p>{{ store.error() || ('itinerary.errLoad' | t) }}</p>
        <div class="cold-start-actions">
          <button type="button" class="btn-primary" (click)="retryLoad()">
            {{ 'common.retry' | t }}
          </button>
          <a routerLink="/trips" class="btn-ghost">{{ 'itinerary.goTrips' | t }}</a>
        </div>
      </div>
    }
  `,
  styles: `
    .itinerary-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      min-height: calc(100dvh - var(--topbar-height));
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
      top: var(--topbar-height);
      z-index: 20;
      background: var(--color-surface-glass);
      backdrop-filter: blur(12px);
      padding: 8px var(--space-3) 7px;
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }
    .timeline-scroll {
      padding: 10px var(--space-3) calc(var(--nav-bottom-height) + env(safe-area-inset-bottom, 0px) + 64px);
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
      border-radius: var(--radius-sm);
    }
    .status-pill.syncing {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .status-pill.offline {
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
    }
    .util-icon-btn {
      color: var(--color-primary);
    }
    .util-icon-btn:hover:not(:disabled),
    .util-icon-btn:focus-visible:not(:disabled) {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .mobile-map-fab {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: calc(var(--nav-bottom-height) + env(safe-area-inset-bottom, 0px) + 10px);
      z-index: 35;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(27, 42, 74, 0.32);
      cursor: pointer;
    }
    .fab-ico {
      color: var(--color-accent);
    }
    .error-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      margin-bottom: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-alert-soft);
      border: 1px solid rgba(200, 75, 59, 0.35);
      color: var(--color-alert);
      font-size: 0.8125rem;
    }
    .error-dismiss {
      display: grid;
      place-items: center;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
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
    .cold-start-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
    }
    .day-add-btn {
      flex-shrink: 0;
      align-self: stretch;
      display: inline-flex;
      align-items: center;
      padding: 0 11px;
      border: 1px solid var(--color-border-soft);
      border-radius: var(--radius-sm);
      background: var(--color-surface-alt);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;
    }
    .day-add-btn:hover {
      border-color: var(--color-primary);
      background: var(--color-surface);
      color: var(--color-primary);
    }
    .day-theme-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      margin-bottom: 8px;
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
      flex: 1;
      min-width: 0;
      border: none;
      background: transparent;
      color: var(--color-primary);
      font: inherit;
      font-size: 0.82rem;
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
      gap: 4px;
    }
    .choice-add-btn::after {
      content: '';
      position: absolute;
      inset: -5px;
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
      padding: 5px 10px;
      border: 1px solid var(--color-accent-border);
      border-radius: var(--radius-pill);
      background: var(--color-accent-tint);
      color: var(--color-accent-ink);
      font: inherit;
      font-size: 0.73rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 140ms ease, background-color 140ms ease;
    }
    .clone-btn:hover {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
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
      padding: 6px 12px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-text-on-primary);
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }
    .summary-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: 10px;
    }
    .summary-text {
      font-size: 0.77rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .slot-drag-placeholder {
      min-height: 76px;
      border-radius: var(--radius-md);
      border: 1.5px solid var(--color-accent-border);
      background: var(--color-accent-tint);
      opacity: 0.85;
    }
    .slot-group.has-choices {
      padding: 8px;
      border-radius: var(--radius-md);
      background: var(--color-accent-tint);
      border: 1px solid var(--color-accent-border);
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
      color: var(--color-text-on-primary);
    }
    .choice-add-btn {
      position: relative;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      border: 1px solid var(--color-accent-border);
      border-radius: var(--radius-pill);
      background: var(--color-accent-tint);
      color: var(--color-accent-ink);
      cursor: pointer;
      transition: border-color 140ms ease, background-color 140ms ease;
    }
    .choice-add-btn:hover {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
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
    @media (min-width: 768px) {
      .sticky-trip-top {
        padding: var(--space-3) var(--space-4) var(--space-2);
      }
      .timeline-scroll {
        padding: var(--space-3) var(--space-4) calc(var(--nav-bottom-height) + env(safe-area-inset-bottom, 0px) + 72px);
      }
      .day-add-btn {
        padding: 0 14px;
        border-radius: var(--radius-md);
        font-size: 0.8125rem;
      }
      .day-theme-bar {
        padding: 6px 12px;
        margin-bottom: var(--space-3);
      }
      .day-theme-input {
        font-size: 0.875rem;
      }
      .summary-bar {
        margin-bottom: var(--space-4);
      }
      .summary-text {
        font-size: 0.8125rem;
      }
      .btn-accent,
      .add-item-btn {
        padding: 7px 14px;
        font-size: 0.8125rem;
      }
      .clone-btn {
        padding: 6px 12px;
        font-size: 0.75rem;
      }
    }
    @media (min-width: 1024px) {
      .mobile-map-fab,
      .mobile-map-sheet {
        display: none;
      }
      .itinerary-layout {
        grid-template-columns: minmax(440px, 46%) 1fr;
        height: calc(100dvh - var(--topbar-height));
      }
      .timeline-pane {
        max-width: none;
        height: calc(100dvh - var(--topbar-height));
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
        height: calc(100dvh - var(--topbar-height));
        position: sticky;
        top: var(--topbar-height);
      }
    }
  `,
})
export class ItineraryPageComponent implements OnInit {
  protected readonly store = inject(ItineraryStore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly authStore = inject(AuthStore);
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
  protected readonly pendingDeleteDay = signal<TripDay | null>(null);
  protected readonly deletingDay = signal(false);
  protected readonly pendingDeleteOption = signal<{
    dayId: string;
    optionId: string;
    label: string;
  } | null>(null);
  protected readonly deletingOption = signal(false);
  protected readonly pendingDeleteItem = signal<ItineraryItem | null>(null);
  protected readonly deletingItem = signal(false);
  protected readonly pendingRevokeShare = signal<{
    tripId: string;
    shareId: string;
  } | null>(null);
  protected readonly revokingShare = signal(false);
  protected readonly showShareModal = signal(false);
  protected readonly copiedToken = signal<string | null>(null);
  protected readonly cloneLabelError = signal(false);
  protected readonly readInputValue = readInputValue;
  protected readonly readCheckedValue = readCheckedValue;

  protected readonly cloneLabel = signal('Plan B');
  protected readonly renameLabel = signal('');
  protected readonly hideSecrets = signal(true);
  protected readonly includeNotes = signal(false);
  protected readonly includeBackups = signal(false);

  constructor() {
    // Automatically backfill OSRM segments when switching to Driving on legacy days.
    effect(() => {
      if (this.store.mapRouteMode() !== 'road') {
        return;
      }
      const option = this.store.selectedOption();
      const expected = this.roadMapRoutes().expectedPairs;
      if (option && expected.length > 0) {
        untracked(() => void this.store.ensureOptionRoadRoutes(option.id, expected));
      }
    });
  }

  protected readonly canCloneCurrentOption = computed(
    () => (this.store.selectedOption()?.items.length ?? 0) > 0,
  );

  /** Groups items sharing a choice_group_id into single timeline slots. */
  protected readonly timelineSlots = computed<ItinerarySlot[]>(() => {
    const option = this.store.selectedOption();
    return option ? groupItemsIntoSlots(option.items) : [];
  });

  protected readonly departureStayMapPin = computed<StayMapPin | null>(() =>
    toStayMapPin(this.store.departureStay()),
  );

  protected readonly stayMapPin = computed<StayMapPin | null>(() =>
    toStayMapPin(this.store.basecampStay()),
  );

  /** Overview curved map routes connecting daily stops, airports, and basecamp stays. */
  protected readonly schematicMapRoutes = computed<DayMapRoutes>(() =>
    buildDayMapRoutes(
      this.timelineSlots().map((slot) => slot.activeItem),
      [],
      'schematic',
      this.store.departureStay(),
      this.store.basecampStay(),
    ),
  );

  /** Driving polylines decoded from cached OSRM segments with straight-line fallbacks. */
  protected readonly roadMapRoutes = computed<DayMapRoutes>(() =>
    buildDayMapRoutes(
      this.timelineSlots().map((slot) => slot.activeItem),
      this.store.selectedOption()?.route_segments ?? [],
      'road',
      this.store.departureStay(),
      this.store.basecampStay(),
    ),
  );

  protected readonly mapPins = computed<MapPin[]>(() =>
    buildDayMapPins(
      this.timelineSlots().map((slot) => slot.activeItem),
      this.stayMapPin()?.id,
    ),
  );

  /** Lookup map syncing card pin numbers (1, 2, 3) with MapLibre markers. */
  protected readonly pinOrderById = computed<Map<string, number>>(() =>
    buildPinOrderMap(this.mapPins()),
  );

  protected readonly selectedDayLabel = computed(() => {
    const d = this.store.selectedDay();
    return d ? `Day ${d.day_index} · ${d.date.slice(5)}` : '';
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
    if (stay && stay.id === selectedId) {
      return stay;
    }
    const depStay = this.store.departureStay();
    return depStay && depStay.id === selectedId ? depStay : null;
  });

  ngOnInit(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      this.tripStore.setLastSelectedTripId(tripId);
      void this.store.loadTrip(tripId);
      void this.expenseStore.loadExpenses(tripId);
    }
  }

  protected retryLoad(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      void this.store.loadTrip(tripId);
      void this.expenseStore.loadExpenses(tripId);
    }
  }

  private readonly dayStrip = viewChild<ElementRef<HTMLDivElement>>('dayStrip');
  private readonly timelineScroll = viewChild<ElementRef<HTMLDivElement>>('timelineScroll');
  protected readonly dayStripScrollStepPx = DAY_STRIP_SCROLL_STEP_PX;

  protected onSlotDropped(event: CdkDragDrop<ItinerarySlot[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    void this.store.reorderSlotIndex(event.previousIndex, event.currentIndex);
  }

  protected onMapPinSelected(itemId: string): void {
    this.store.selectItem(itemId);
    const container = this.timelineScroll()?.nativeElement;
    if (!container) {
      return;
    }
    const target = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot-item-id]'),
    ).find((el) => el.getAttribute('data-slot-item-id') === itemId);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  protected selectDay(dayIndex: number, event?: Event): void {
    this.store.selectDay(dayIndex);
    (event?.currentTarget as HTMLElement | null)?.scrollIntoView({
      behavior: 'smooth',
      inline: 'nearest',
      block: 'nearest',
    });
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

  protected blurInput(event: Event): void {
    (event.target as HTMLInputElement).blur();
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
    this.cloneLabel.set(`Plan ${nextLetter}`);
    this.newOptionMode.set('blank');
    this.cloneLabelError.set(false);
    this.showCloneModal.set(true);
  }

  protected async submitCreateOption(): Promise<void> {
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

  protected openRenameOptionModal(optionId: string, currentLabel: string): void {
    this.renamingOptionId.set(optionId);
    this.renameLabel.set(currentLabel);
    this.renameLabelError.set(false);
    this.showRenameModal.set(true);
  }

  protected async submitRenameOption(): Promise<void> {
    const optionId = this.renamingOptionId();
    const label = this.renameLabel().trim();
    if (!optionId || !label) {
      this.renameLabelError.set(true);
      return;
    }
    await this.store.renameOption(optionId, label);
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

  protected async executeDeleteDay(): Promise<void> {
    const target = this.pendingDeleteDay();
    if (!target) {
      return;
    }
    this.deletingDay.set(true);
    try {
      await this.store.deleteDay(target.id);
      this.pendingDeleteDay.set(null);
      if (this.expenseStore.summary()?.trip_id === target.trip_id) {
        void this.expenseStore.loadExpenses(target.trip_id);
      }
    } catch {
      this.pendingDeleteDay.set(null);
    } finally {
      this.deletingDay.set(false);
    }
  }

  protected async executeDeleteOption(): Promise<void> {
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

  protected requestDeleteItem(item: ItineraryItem): void {
    this.pendingDeleteItem.set(item);
  }

  protected async executeDeleteItem(): Promise<void> {
    const target = this.pendingDeleteItem();
    if (!target) {
      return;
    }
    this.deletingItem.set(true);
    try {
      await this.store.deleteItem(target.id);
      this.pendingDeleteItem.set(null);
    } finally {
      this.deletingItem.set(false);
    }
  }

  protected requestRevokeShare(tripId: string, shareId: string): void {
    this.pendingRevokeShare.set({ tripId, shareId });
  }

  protected async executeRevokeShare(): Promise<void> {
    const target = this.pendingRevokeShare();
    if (!target) {
      return;
    }
    this.revokingShare.set(true);
    try {
      await this.store.revokeShare(target.tripId, target.shareId);
      this.pendingRevokeShare.set(null);
    } finally {
      this.revokingShare.set(false);
    }
  }

  protected openShareModal(tripId: string): void {
    this.showShareModal.set(true);
    void this.store.loadShares(tripId);
  }

  protected async createShareLink(tripId: string): Promise<void> {
    await this.store.createShare(tripId, 'Shared Link', {
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
}
