import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { I18nService } from '../../core/i18n/i18n.service';
import { ItineraryItem } from '../../core/models/tripilot.models';
import { ItineraryCardComponent } from './itinerary-card.component';

function makeItem(overrides: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: 'item-1',
    day_option_id: 'opt-1',
    type: 'SPOT',
    sort_order: 0,
    title: 'Senso-ji Temple',
    start_time: '09:30',
    end_time: '11:00',
    timezone: null,
    address: 'Asakusa, Tokyo',
    latitude: 35.7148,
    longitude: 139.7967,
    google_maps_url: null,
    notes: null,
    details: {},
    choice_group_id: null,
    is_selected: true,
    ...overrides,
  };
}

describe('ItineraryCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItineraryCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    TestBed.inject(I18nService).setLocale('en');
  });

  it('renders a SPOT pin and emits cardClicked and logExpense without bubbling', async () => {
    const spot = makeItem({ id: 'spot-1', type: 'SPOT', title: 'Senso-ji Temple' });
    const fixture = TestBed.createComponent(ItineraryCardComponent);
    fixture.componentRef.setInput('item', spot);
    fixture.componentRef.setInput('pinOrder', 2);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const badge = host.querySelector('.pin-badge');
    expect(badge?.textContent?.trim()).toBe('2');
    expect(badge?.getAttribute('data-type')).toBe('SPOT');
    expect(host.querySelector('.type-dot')).toBeNull();
    expect(host.querySelector('.card-title')?.textContent?.trim()).toBe('Senso-ji Temple');

    const clickedIds: string[] = [];
    const loggedItems: ItineraryItem[] = [];
    fixture.componentInstance.cardClicked.subscribe((id) => clickedIds.push(id));
    fixture.componentInstance.logExpense.subscribe((item) => loggedItems.push(item));

    const card = host.querySelector('.standard-card') as HTMLElement;
    card.click();
    expect(clickedIds).toEqual(['spot-1']);

    const expenseBtn = host.querySelector('.expense-trigger') as HTMLButtonElement;
    expenseBtn.click();
    expect(loggedItems).toEqual([spot]);
    expect(clickedIds).toEqual(['spot-1']);

    // Keyboard Enter on card selects it, while Enter on inner button does not re-emit cardClicked.
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(clickedIds).toEqual(['spot-1', 'spot-1']);
    expenseBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(clickedIds).toEqual(['spot-1', 'spot-1']);
  });

  it('renders LOCAL_TRANSIT as a single-line pill with overflow menu ordering controls', async () => {
    const transit = makeItem({
      id: 'lt-1',
      type: 'LOCAL_TRANSIT',
      title: 'Ginza Line to Asakusa',
      address: null,
      latitude: null,
      longitude: null,
      details: { duration_minutes: 12 },
    });
    const fixture = TestBed.createComponent(ItineraryCardComponent);
    fixture.componentRef.setInput('item', transit);
    fixture.componentRef.setInput('canMoveUp', false);
    fixture.componentRef.setInput('canMoveDown', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.connector-pill')).toBeTruthy();
    expect(host.querySelector('.connector-title')?.textContent?.trim()).toBe(
      'Ginza Line to Asakusa',
    );
    expect(host.querySelector('.connector-dur')?.textContent).toContain('12 min');

    const menuBtn = host.querySelector('.connector-menu-btn') as HTMLButtonElement;
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    menuBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');
    const menuItems = Array.from(
      host.querySelectorAll('.action-menu-item[role="menuitem"]'),
    ) as HTMLButtonElement[];
    expect(menuItems.length).toBe(4);
    expect(menuItems[0].disabled).toBe(true);
    expect(menuItems[1].disabled).toBe(false);

    const movedDown: ItineraryItem[] = [];
    fixture.componentInstance.moveDown.subscribe((item) => movedDown.push(item));
    menuItems[1].click();
    fixture.detectChanges();

    expect(movedDown).toEqual([transit]);
    expect(host.querySelector('.action-menu')).toBeNull();
    // Ordering controls stay inside the overflow menu so the transit title is not compressed.
    expect(host.querySelector('.connector-order')).toBeNull();
  });

  it('shows type-dot only when a standard card has no map pinOrder', async () => {
    const food = makeItem({
      id: 'food-1',
      type: 'FOOD',
      title: 'Night Market Stall',
      latitude: null,
      longitude: null,
    });
    const fixture = TestBed.createComponent(ItineraryCardComponent);
    fixture.componentRef.setInput('item', food);
    fixture.componentRef.setInput('pinOrder', null);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.pin-badge')).toBeNull();
    expect(host.querySelector('.type-dot')?.getAttribute('data-type')).toBe('FOOD');
  });
});
