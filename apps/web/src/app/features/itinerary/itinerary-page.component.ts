import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { DAY_STRIP_SCROLL_STEP_PX } from '../../core/constants/app-limits';
import { resolveCountryMapCenter } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ItemType, ItineraryItem, TripDay } from '../../core/models/tripilot.models';
import { NetworkStatusService } from '../../core/network/network-status.service';
import { readInputValue } from '../../core/utils/form-events.utils';
import {
  injectMenuCloseScrollStrategy,
  isClickInsideElement,
  MENU_OVERLAY_POSITIONS,
} from '../../core/utils/overlay-positions';
import {
  buildDayMapPins,
  buildDayMapRoutes,
  buildPinOrderMap,
  DayMapRoutes,
  formatDateWithWeekday,
  groupItemsIntoSlots,
  ItinerarySlot,
  toStayMapPin,
} from '../../core/utils/travel-format.utils';
import { ViewportService } from '../../core/utils/viewport.service';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { TripSubnavComponent } from '../../shared/trip-subnav.component';
import { AuthStore } from '../../state/auth.store';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';
import { TripStore } from '../../state/trip.store';
import { QuickExpenseModalComponent } from '../expenses/quick-expense-modal.component';
import { DayOptionModalsComponent } from './day-option-modals.component';
import {
  ItemFormModalComponent,
  ItemFormSubmitEvent,
} from './item-form-modal.component';
import { ITEM_TYPE_OPTIONS } from './item-type-meta';
import { ItineraryCardComponent } from './itinerary-card.component';
import { ItineraryMapComponent } from './itinerary-map.component';
import { MapPin, StayMapPin } from './itinerary-map.types';
import { MobileMapSheetComponent } from './mobile-map-sheet.component';
import {
  MoveItemConfirmEvent,
  MoveItemModalComponent,
} from './move-item-modal.component';
import { TripShareModalComponent } from './trip-share-modal.component';

/** Mobile-first itinerary timeline with Day 1..N, Plan A/B, slot choices, and map sync. */
@Component({
  selector: 'app-itinerary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    CdkScrollable,
    CdkTextareaAutosize,
    TranslatePipe,
    AppConfirmModalComponent,
    TripSubnavComponent,
    DayOptionModalsComponent,
    ItemFormModalComponent,
    ItineraryCardComponent,
    ItineraryMapComponent,
    MobileMapSheetComponent,
    MoveItemModalComponent,
    QuickExpenseModalComponent,
    TripShareModalComponent,
  ],
  templateUrl: './itinerary-page.component.html',
  styleUrl: './itinerary-page.component.css',
})
export class ItineraryPageComponent implements OnInit {
  protected readonly store = inject(ItineraryStore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly authStore = inject(AuthStore);
  protected readonly viewport = inject(ViewportService);
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly network = inject(NetworkStatusService);
  private readonly tripStore = inject(TripStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly isOfflineReadOnly = computed(
    () => !this.network.isOnline() || this.store.usingOfflineCache(),
  );

  protected readonly addTypeMenuOpen = signal(false);
  protected readonly showItemModal = signal(false);
  protected readonly initialItemType = signal<ItemType>('SPOT');
  protected readonly editingItem = signal<ItineraryItem | null>(null);
  protected readonly alternativeTarget = signal<ItineraryItem | null>(null);
  protected readonly savingItem = signal(false);
  protected readonly addItemTypeOptions = ITEM_TYPE_OPTIONS;
  protected readonly addMenuPositions = MENU_OVERLAY_POSITIONS;
  protected readonly addMenuScrollStrategy = injectMenuCloseScrollStrategy();

  protected readonly showQuickExpenseModal = signal(false);
  protected readonly quickExpenseItem = signal<ItineraryItem | null>(null);

  protected readonly pendingDeleteDay = signal<TripDay | null>(null);
  protected readonly deletingDay = signal(false);
  protected readonly pendingDeleteItem = signal<ItineraryItem | null>(null);
  protected readonly deletingItem = signal(false);
  protected readonly movingItemTarget = signal<ItineraryItem | null>(null);
  protected readonly movingItem = signal(false);
  protected readonly showShareModal = signal(false);

  protected readonly canMoveToAnotherOption = computed(() => {
    const trip = this.store.trip();
    if (!trip) {
      return false;
    }
    let optionCount = 0;
    for (const day of trip.days) {
      optionCount += day.options.length;
      if (optionCount > 1) {
        return true;
      }
    }
    return false;
  });
  protected readonly mobileHeaderCollapsed = signal(false);
  protected readonly editingDayThemeId = signal<string | null>(null);
  protected readonly readInputValue = readInputValue;

  private readonly addItemBtn = viewChild<ElementRef<HTMLButtonElement>>('addItemBtn');
  private readonly itemFormModal = viewChild(ItemFormModalComponent);
  private readonly dayStrip = viewChild<ElementRef<HTMLDivElement>>('dayStrip');
  private readonly dayThemeInput = viewChild<ElementRef<HTMLTextAreaElement>>('dayThemeInput');
  private readonly timelineScroll = viewChild<ElementRef<HTMLDivElement>>('timelineScroll');
  protected readonly optionModals = viewChild(DayOptionModalsComponent);
  protected readonly dayStripScrollStepPx = DAY_STRIP_SCROLL_STEP_PX;

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

    // Keep today's / newly selected Day chip visible when opening a multi-day trip.
    effect(() => {
      const tripId = this.store.trip()?.id;
      const dayIdx = this.store.selectedDayIndex();
      if (!tripId || !dayIdx) {
        return;
      }
      queueMicrotask(() => {
        const activeChip = this.dayStrip()?.nativeElement.querySelector<HTMLElement>(
          '.day-chip.active',
        );
        activeChip?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
      });
    });

    if (typeof window !== 'undefined') {
      let lastScrollY = Math.max(0, window.scrollY);
      let lastToggleAt = 0;
      const onWindowScroll = (): void => {
        if (this.viewport.isDesktop()) {
          this.mobileHeaderCollapsed.set(false);
          return;
        }
        const y = Math.max(0, window.scrollY);
        const now = Date.now();
        // Cooldown prevents sticky-header height changes on short timelines from oscillating.
        if (now - lastToggleAt < 260) {
          lastScrollY = y;
          return;
        }
        const delta = y - lastScrollY;
        if (y <= 32) {
          if (this.mobileHeaderCollapsed()) {
            this.mobileHeaderCollapsed.set(false);
            lastToggleAt = now;
          }
          lastScrollY = y;
          return;
        }
        if (Math.abs(delta) >= 12) {
          const shouldCollapse = delta > 0 && y > 120;
          if (shouldCollapse !== this.mobileHeaderCollapsed()) {
            this.mobileHeaderCollapsed.set(shouldCollapse);
            lastToggleAt = now;
          }
          lastScrollY = y;
        }
      };
      window.addEventListener('scroll', onWindowScroll, { passive: true });
      this.destroyRef.onDestroy(() => window.removeEventListener('scroll', onWindowScroll));
    }
  }

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

  protected readonly hasAnyMapPin = computed(
    () =>
      this.mapPins().length > 0 ||
      Boolean(this.stayMapPin()) ||
      Boolean(this.departureStayMapPin()),
  );

  protected readonly tripMapCenter = computed<readonly [number, number]>(() =>
    resolveCountryMapCenter(
      this.store.trip()?.country_codes ?? [],
      this.authStore.profile()?.home_country_code ?? 'TW',
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

  protected onSlotDropped(event: CdkDragDrop<ItinerarySlot[]>): void {
    if (this.isOfflineReadOnly() || event.previousIndex === event.currentIndex) {
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
    this.mobileHeaderCollapsed.set(false);
    this.editingDayThemeId.set(null);
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

  protected toggleAddTypeMenu(event: Event): void {
    event.stopPropagation();
    if (this.isOfflineReadOnly()) {
      return;
    }
    this.addTypeMenuOpen.update((open) => !open);
  }

  protected onAddTypeMenuOutsideClick(event: MouseEvent): void {
    if (!isClickInsideElement(event, this.addItemBtn()?.nativeElement)) {
      this.addTypeMenuOpen.set(false);
    }
  }

  protected onAddTypeMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.addTypeMenuOpen.set(false);
    }
  }

  protected openAddItemModal(type: ItemType = 'SPOT'): void {
    this.addTypeMenuOpen.set(false);
    this.initialItemType.set(type);
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

  protected openMoveItemModal(item: ItineraryItem): void {
    if (this.isOfflineReadOnly() || !this.canMoveToAnotherOption()) {
      return;
    }
    this.movingItemTarget.set(item);
  }

  protected async executeMoveItem(event: MoveItemConfirmEvent): Promise<void> {
    this.movingItem.set(true);
    try {
      const moved = await this.store.moveItemToOption(event.itemId, event.targetOptionId);
      if (moved) {
        this.movingItemTarget.set(null);
        const tripId = this.store.trip()?.id;
        if (tripId && this.expenseStore.summary()?.trip_id === tripId) {
          void this.expenseStore.loadExpenses(tripId);
        }
      }
    } finally {
      this.movingItem.set(false);
    }
  }

  protected async handleItemSaved(event: ItemFormSubmitEvent): Promise<void> {
    if (this.savingItem()) {
      return;
    }
    this.savingItem.set(true);
    try {
      if (event.editingItemId) {
        await this.store.updateItem(event.editingItemId, event.payload);
      } else {
        await this.store.addItem(event.payload);
      }
      if (this.store.error()) {
        return;
      }
      if (event.addAnother && !event.editingItemId) {
        this.itemFormModal()?.resetForNext(
          event.payload.title,
          event.payload.end_time ?? '',
        );
        return;
      }
      this.showItemModal.set(false);
    } finally {
      this.savingItem.set(false);
    }
  }

  protected formatChapterDate(isoDate: string): string {
    return formatDateWithWeekday(isoDate, this.i18n.locale());
  }

  protected isDayThemeVisible(day: TripDay): boolean {
    return Boolean(day.title?.trim()) || this.editingDayThemeId() === day.id;
  }

  protected startEditingDayTheme(dayId: string): void {
    if (this.isOfflineReadOnly()) {
      return;
    }
    this.editingDayThemeId.set(dayId);
    queueMicrotask(() => {
      const el = this.dayThemeInput()?.nativeElement;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }

  protected async onDayThemeBlur(
    dayId: string,
    nextValue: string,
    previousValue: string | null,
  ): Promise<void> {
    if (this.editingDayThemeId() === dayId) {
      this.editingDayThemeId.set(null);
    }
    await this.saveDayTheme(dayId, nextValue, previousValue);
  }

  protected cancelDayThemeEdit(event: Event, previousValue: string | null): void {
    const inputEl = event.target as HTMLTextAreaElement;
    inputEl.value = previousValue ?? '';
    this.editingDayThemeId.set(null);
    inputEl.blur();
  }

  protected blurInput(event: Event): void {
    (event.target as HTMLElement).blur();
  }

  protected async saveDayTheme(
    dayId: string,
    nextValue: string,
    previousValue: string | null,
  ): Promise<void> {
    if (this.isOfflineReadOnly()) {
      return;
    }
    const trimmed = nextValue.replace(/\s+/g, ' ').trim();
    if (trimmed === (previousValue ?? '').trim()) {
      return;
    }
    await this.store.updateDayTitle(dayId, trimmed || null);
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
}
