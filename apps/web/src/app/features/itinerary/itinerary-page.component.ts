import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  ItemType,
  ItineraryItem,
  PlaceCandidate,
} from '../../core/models/tripilot.models';
import { AppModalComponent } from '../../shared/modal.component';
import { ItineraryStore } from '../../state/itinerary.store';
import { TripStore } from '../../state/trip.store';
import { ItineraryCardComponent } from './itinerary-card.component';
import { ItineraryMapComponent, MapPin } from './itinerary-map.component';

interface TimelineSlot {
  key: string;
  activeItem: ItineraryItem;
  choices: ItineraryItem[];
}

/** Mobile-first itinerary timeline with Day 1..N, Plan A/B, slot choices, and Google Places. */
@Component({
  selector: 'app-itinerary-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    AppModalComponent,
    ItineraryCardComponent,
    ItineraryMapComponent,
  ],
  template: `
    @if (store.trip(); as trip) {
      <div class="itinerary-layout" [class.map-hidden]="!store.desktopMapVisible()">
        <section class="timeline-pane">
          <header class="trip-bar">
            <div class="trip-bar-left">
              <a routerLink="/trips" class="back-btn" [attr.aria-label]="'common.back' | t">←</a>
              <div>
                <h2 class="trip-name">{{ trip.title }}</h2>
                <p class="trip-range tabular-nums">{{ trip.start_date }} — {{ trip.end_date }}</p>
              </div>
            </div>
            <div class="trip-bar-actions">
              <a class="pill-btn" [routerLink]="['/trips', trip.id, 'expenses']">
                💰 {{ 'common.expenses' | t }}
              </a>
              <button type="button" class="pill-btn" (click)="openShareModal(trip.id)">
                🔗 {{ 'common.share' | t }}
              </button>
              <button
                type="button"
                class="pill-btn desktop-only"
                (click)="store.toggleDesktopMap()"
              >
                {{ store.desktopMapVisible() ? ('itinerary.map.hide' | t) : ('itinerary.map.show' | t) }}
              </button>
            </div>
          </header>

          <!-- Horizontal Day Switcher (Day 1, Day 2, ... + Add Day) -->
          <div class="day-strip" role="tablist">
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

          @if (store.selectedDay(); as day) {
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

                <div class="summary-controls">
                  <div class="mobile-toggle">
                    <button
                      type="button"
                      [class.active]="store.mobileView() === 'list'"
                      (click)="store.setMobileView('list')"
                    >
                      {{ 'itinerary.view.list' | t }}
                    </button>
                    <button
                      type="button"
                      [class.active]="store.mobileView() === 'map'"
                      (click)="store.setMobileView('map')"
                    >
                      {{ 'itinerary.view.map' | t }}
                    </button>
                  </div>
                  <button type="button" class="add-item-btn" (click)="openAddItemModal(null)">
                    + {{ 'itinerary.addItem' | t }}
                  </button>
                </div>
              </div>

              @if (store.mobileView() === 'map') {
                <div class="mobile-map-box">
                  <app-itinerary-map
                    [pins]="mapPins()"
                    [selectedPinId]="store.selectedItemId()"
                    (pinSelected)="store.selectItem($event)"
                  />
                </div>
              } @else {
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
                              (click)="openAddItemModal(slot.activeItem)"
                            >
                              +
                            </button>
                          </div>
                        }

                        <app-itinerary-card
                          [item]="slot.activeItem"
                          [selected]="store.selectedItemId() === slot.activeItem.id"
                          (cardClicked)="store.selectItem($event)"
                          (moveUp)="store.moveItem($event, -1)"
                          (moveDown)="store.moveItem($event, 1)"
                          (addAlternative)="openAddItemModal($event)"
                          (deleted)="store.deleteItem($event)"
                        />
                      </div>
                    }
                  </div>
                }
              }
            }
          }
        </section>

        @if (store.desktopMapVisible()) {
          <aside class="desktop-map-pane">
            <app-itinerary-map
              [pins]="mapPins()"
              [selectedPinId]="store.selectedItemId()"
              (pinSelected)="store.selectItem($event)"
            />
          </aside>
        }
      </div>

      <!-- Modal: Add Item / Add Slot Alternative with Smart Place Search -->
      <app-modal
        [open]="showAddItemModal()"
        [title]="alternativeTarget() ? ('itinerary.choice.modalTitle' | t) : ('itinerary.addItem' | t)"
        (closed)="showAddItemModal.set(false)"
      >
        <form class="modal-form" (ngSubmit)="submitItem()" novalidate>
          <div class="two-col">
            <label class="field">
              <span>{{ 'itinerary.form.type' | t }}</span>
              <select [(ngModel)]="itemType" name="itemType">
                <option value="SPOT">{{ 'item.type.spot' | t }}</option>
                <option value="FOOD">{{ 'item.type.food' | t }}</option>
                <option value="STAY">{{ 'item.type.stay' | t }}</option>
                <option value="FLIGHT">{{ 'item.type.flight' | t }}</option>
                <option value="RESERVED_TRANSIT">{{ 'item.type.reservedTransit' | t }}</option>
                <option value="LOCAL_TRANSIT">{{ 'item.type.localTransit' | t }}</option>
              </select>
            </label>
            <label class="field" [class.has-error]="itemTitleError()">
              <span>{{ 'itinerary.form.title' | t }} <em class="req">*</em></span>
              <input
                type="text"
                [(ngModel)]="itemTitle"
                name="itemTitle"
                (ngModelChange)="itemTitleError.set(false)"
              />
              @if (itemTitleError()) {
                <small class="err-msg">{{ 'itinerary.form.errTitle' | t }}</small>
              }
            </label>
          </div>

          <div class="two-col">
            <label class="field">
              <span>{{ 'itinerary.form.startTime' | t }}</span>
              <input type="time" [(ngModel)]="startTime" name="startTime" />
            </label>
            <label class="field">
              <span>{{ 'itinerary.form.endTime' | t }}</span>
              <input type="time" [(ngModel)]="endTime" name="endTime" />
            </label>
          </div>

          @if (itemType === 'FLIGHT') {
            <div class="two-col">
              <label class="field">
                <span>{{ 'itinerary.form.flightNo' | t }}</span>
                <input type="text" [(ngModel)]="flightNo" name="flightNo" placeholder="NH852" />
              </label>
              <label class="field">
                <span>{{ 'itinerary.form.bookingRef' | t }}</span>
                <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
              </label>
              <label class="field">
                <span>{{ 'itinerary.form.originIata' | t }}</span>
                <input type="text" [(ngModel)]="originIata" name="originIata" maxlength="3" placeholder="TSA" />
              </label>
              <label class="field">
                <span>{{ 'itinerary.form.destIata' | t }}</span>
                <input type="text" [(ngModel)]="destIata" name="destIata" maxlength="3" placeholder="HND" />
              </label>
            </div>
          } @else if (itemType === 'RESERVED_TRANSIT') {
            <div class="two-col">
              <label class="field">
                <span>{{ 'itinerary.form.trainLine' | t }}</span>
                <input type="text" [(ngModel)]="trainLine" name="trainLine" />
              </label>
              <label class="field">
                <span>{{ 'itinerary.form.seat' | t }}</span>
                <input type="text" [(ngModel)]="seat" name="seat" />
              </label>
            </div>
            <label class="field">
              <span>{{ 'itinerary.form.bookingRef' | t }}</span>
              <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
            </label>
          } @else if (itemType === 'LOCAL_TRANSIT') {
            <label class="field">
              <span>{{ 'itinerary.form.transitMin' | t }}</span>
              <input type="number" [(ngModel)]="transitMin" name="transitMin" min="1" />
            </label>
          } @else {
            <!-- Smart Place Picker: Google Maps URL or Keyword Search (Zero raw lat/lng!) -->
            <div class="place-picker">
              <label class="field">
                <span>{{ 'itinerary.place.label' | t }}</span>
                <div class="place-input-row">
                  <input
                    type="text"
                    [(ngModel)]="placeQuery"
                    name="placeQuery"
                    [placeholder]="'itinerary.place.placeholder' | t"
                    (keydown.enter)="$event.preventDefault(); searchOrResolvePlace()"
                  />
                  <button
                    type="button"
                    class="pill-btn"
                    [disabled]="searchingPlaces()"
                    (click)="searchOrResolvePlace()"
                  >
                    {{ isUrlInput() ? ('itinerary.place.resolve' | t) : ('itinerary.place.search' | t) }}
                  </button>
                </div>
              </label>

              @if (pinnedPlace(); as pinned) {
                <div class="pinned-badge">
                  <div>
                    <strong>📍 {{ 'itinerary.place.selected' | t }}: {{ pinned.name }}</strong>
                    @if (pinned.address) {
                      <p>{{ pinned.address }}</p>
                    }
                  </div>
                  <button type="button" class="pill-btn" (click)="clearPinnedPlace()">
                    {{ 'itinerary.place.clear' | t }}
                  </button>
                </div>
              } @else {
                <small class="place-hint">{{ 'itinerary.place.optionalHint' | t }}</small>
              }

              @if (placeSearchError()) {
                <small class="err-msg">{{ 'itinerary.place.notFound' | t }}</small>
              }

              @if (placeCandidates().length > 0) {
                <div class="candidate-list">
                  @for (cand of placeCandidates(); track cand.latitude + ',' + cand.longitude) {
                    <button type="button" class="candidate-row" (click)="selectPlaceCandidate(cand)">
                      <strong>{{ cand.name }}</strong>
                      @if (cand.address) {
                        <span>{{ cand.address }}</span>
                      }
                    </button>
                  }
                </div>
              }
            </div>

            @if (itemType === 'STAY') {
              <div class="two-col">
                <label class="field">
                  <span>{{ 'itinerary.form.bookingRef' | t }}</span>
                  <input type="text" [(ngModel)]="bookingRef" name="bookingRef" />
                </label>
                <label class="field">
                  <span>{{ 'itinerary.form.freeCancel' | t }}</span>
                  <input type="text" [(ngModel)]="freeCancel" name="freeCancel" placeholder="Nov 20" />
                </label>
              </div>
            }
          }

          <label class="field">
            <span>{{ 'itinerary.form.notes' | t }}</span>
            <input type="text" [(ngModel)]="notes" name="notes" />
          </label>

          <div class="add-actions">
            <button type="button" class="pill-btn" (click)="showAddItemModal.set(false)">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="add-item-btn">{{ 'common.save' | t }}</button>
          </div>
        </form>
      </app-modal>

      <!-- Modal: Create Plan B Option (Replaces browser window.prompt) -->
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
      <p class="empty-day">{{ 'common.loading' | t }}</p>
    }
  `,
  styles: `
    .itinerary-layout {
      display: grid;
      grid-template-columns: 1fr;
      min-height: calc(100dvh - 56px);
    }
    .timeline-pane {
      padding: var(--space-4) var(--space-4) calc(var(--nav-bottom-height) + var(--space-6));
      max-width: 780px;
      width: 100%;
      margin: 0 auto;
    }
    .desktop-map-pane,
    .desktop-only {
      display: none;
    }
    .trip-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .trip-bar-left {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .back-btn {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 700;
    }
    .trip-name {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .trip-range {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .trip-bar-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .pill-btn {
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
    .day-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: var(--space-2);
      margin-bottom: var(--space-3);
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
    .summary-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mobile-toggle {
      display: inline-flex;
      padding: 3px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
    }
    .mobile-toggle button {
      padding: 5px 12px;
      border: none;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .mobile-toggle button.active {
      background: var(--color-surface);
      color: var(--color-primary);
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
      width: 26px;
      height: 26px;
      flex-shrink: 0;
      border: 1px dashed var(--color-accent);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: #8b652d;
      font-weight: 700;
      cursor: pointer;
    }
    .mobile-map-box {
      height: 62dvh;
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
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
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
    .field input,
    .field select {
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
    .place-picker {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .place-input-row {
      display: flex;
      gap: 6px;
    }
    .place-input-row input {
      flex: 1;
      background: var(--color-surface);
    }
    .place-hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .pinned-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.8125rem;
    }
    .pinned-badge p {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }
    .candidate-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 180px;
      overflow-y: auto;
    }
    .candidate-row {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 8px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.8125rem;
      text-align: left;
      cursor: pointer;
    }
    .candidate-row:hover {
      border-color: var(--color-primary);
    }
    .candidate-row span {
      font-size: 0.72rem;
      color: var(--color-text-muted);
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

    @media (min-width: 1024px) {
      .desktop-only {
        display: inline-flex;
      }
      .mobile-toggle,
      .mobile-map-box {
        display: none;
      }
      .itinerary-layout:not(.map-hidden) {
        grid-template-columns: minmax(440px, 46%) 1fr;
        height: calc(100dvh - 56px);
      }
      .itinerary-layout:not(.map-hidden) .timeline-pane {
        max-width: none;
        overflow-y: auto;
        padding: var(--space-5);
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
  private readonly tripStore = inject(TripStore);
  private readonly api = inject(TripilotApiService);
  private readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);

  protected readonly showAddItemModal = signal(false);
  protected readonly showCloneModal = signal(false);
  protected readonly showShareModal = signal(false);
  protected readonly alternativeTarget = signal<ItineraryItem | null>(null);
  protected readonly copiedToken = signal<string | null>(null);

  protected readonly itemTitleError = signal(false);
  protected readonly cloneLabelError = signal(false);
  protected readonly searchingPlaces = signal(false);
  protected readonly placeSearchError = signal(false);
  protected readonly placeCandidates = signal<PlaceCandidate[]>([]);
  protected readonly pinnedPlace = signal<PlaceCandidate | null>(null);

  protected cloneLabel = 'Plan B · 雨天備案';

  protected itemType: ItemType = 'SPOT';
  protected itemTitle = '';
  protected startTime = '';
  protected endTime = '';
  protected placeQuery = '';
  protected notes = '';
  protected flightNo = '';
  protected originIata = '';
  protected destIata = '';
  protected bookingRef = '';
  protected trainLine = '';
  protected seat = '';
  protected transitMin: number | null = 15;
  protected freeCancel = '';

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

  protected readonly mapPins = computed<MapPin[]>(() => {
    const pins: MapPin[] = [];
    let order = 1;
    for (const slot of this.timelineSlots()) {
      const item = slot.activeItem;
      if (item.latitude !== null && item.longitude !== null) {
        pins.push({
          id: item.id,
          order: order++,
          title: item.title,
          lat: item.latitude,
          lng: item.longitude,
          type: item.type,
        });
      }
    }
    return pins;
  });

  ngOnInit(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      this.tripStore.setLastSelectedTripId(tripId);
      void this.store.loadTrip(tripId);
    }
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

  protected openAddItemModal(targetForAlt: ItineraryItem | null): void {
    this.alternativeTarget.set(targetForAlt);
    this.itemType = targetForAlt ? targetForAlt.type : 'SPOT';
    this.itemTitle = '';
    this.startTime = targetForAlt?.start_time ?? '';
    this.endTime = targetForAlt?.end_time ?? '';
    this.placeQuery = '';
    this.notes = '';
    this.bookingRef = '';
    this.itemTitleError.set(false);
    this.placeSearchError.set(false);
    this.placeCandidates.set([]);
    this.pinnedPlace.set(null);
    this.showAddItemModal.set(true);
  }

  protected isUrlInput(): boolean {
    const q = this.placeQuery.trim().toLowerCase();
    return q.startsWith('http://') || q.startsWith('https://');
  }

  protected async searchOrResolvePlace(): Promise<void> {
    const q = this.placeQuery.trim();
    if (!q) return;

    this.searchingPlaces.set(true);
    this.placeSearchError.set(false);
    this.placeCandidates.set([]);

    try {
      if (this.isUrlInput()) {
        const resolved = await this.api.resolvePlaceUrl(q);
        this.selectPlaceCandidate(resolved);
      } else {
        const results = await this.api.searchPlaces(q, this.i18n.locale());
        if (results.length === 0) {
          this.placeSearchError.set(true);
        } else {
          this.placeCandidates.set(results);
        }
      }
    } catch {
      this.placeSearchError.set(true);
    } finally {
      this.searchingPlaces.set(false);
    }
  }

  protected selectPlaceCandidate(cand: PlaceCandidate): void {
    this.pinnedPlace.set(cand);
    this.placeCandidates.set([]);
    if (!this.itemTitle.trim()) {
      this.itemTitle = cand.name;
    }
  }

  protected clearPinnedPlace(): void {
    this.pinnedPlace.set(null);
  }

  protected async submitItem(): Promise<void> {
    if (!this.itemTitle.trim()) {
      this.itemTitleError.set(true);
      return;
    }
    const details: Record<string, unknown> = {};
    if (this.itemType === 'FLIGHT') {
      if (this.flightNo) details['flight_number'] = this.flightNo.trim();
      if (this.originIata) details['origin_iata'] = this.originIata.trim().toUpperCase();
      if (this.destIata) details['dest_iata'] = this.destIata.trim().toUpperCase();
      if (this.bookingRef) details['booking_ref'] = this.bookingRef.trim();
    } else if (this.itemType === 'RESERVED_TRANSIT') {
      if (this.trainLine) details['line_or_train_no'] = this.trainLine.trim();
      if (this.seat) details['seat'] = this.seat.trim();
      if (this.bookingRef) details['booking_ref'] = this.bookingRef.trim();
    } else if (this.itemType === 'LOCAL_TRANSIT') {
      if (this.transitMin) details['duration_minutes'] = this.transitMin;
    } else if (this.itemType === 'STAY') {
      if (this.bookingRef) details['confirmation_code'] = this.bookingRef.trim();
      if (this.freeCancel) details['free_cancellation_deadline'] = this.freeCancel.trim();
    }

    const pinned = this.pinnedPlace();
    await this.store.addItem({
      type: this.itemType,
      title: this.itemTitle.trim(),
      start_time: this.startTime || null,
      end_time: this.endTime || null,
      address: pinned?.address ?? null,
      latitude: pinned?.latitude ?? null,
      longitude: pinned?.longitude ?? null,
      google_maps_url: pinned?.google_maps_url ?? null,
      notes: this.notes.trim() || null,
      details,
      alternative_for_item_id: this.alternativeTarget()?.id ?? null,
    });

    this.showAddItemModal.set(false);
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
