import { TestBed } from '@angular/core/testing';

import { I18nService } from '../../core/i18n/i18n.service';
import { DayMapRoutes, EMPTY_DAY_MAP_ROUTES } from '../../core/utils/travel-format.utils';
import { ItineraryMapComponent } from './itinerary-map.component';

const ROUTES_WITH_STAY_LEGS: DayMapRoutes = {
  mainLegs: [],
  stayLegs: [
    [
      [139.7003, 35.6909],
      [139.7967, 35.7148],
    ],
  ],
  expectedPairs: ['stay-1->spot-1'],
};

describe('ItineraryMapComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItineraryMapComponent],
    }).compileComponents();
    TestBed.inject(I18nService).setLocale('en');
  });

  it('renders empty state gracefully without WebGL', async () => {
    const fixture = TestBed.createComponent(ItineraryMapComponent);
    fixture.componentRef.setInput('emptyText', 'No pins yet');
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const emptyEl = host.querySelector('.map-empty');
    expect(emptyEl).toBeTruthy();
    expect(emptyEl?.textContent).toContain('No pins yet');
  });

  it('shows Overview/Driving toggle only when allowModeToggle is true and routes exist', async () => {
    const fixture = TestBed.createComponent(ItineraryMapComponent);
    fixture.componentRef.setInput('allowModeToggle', true);
    fixture.componentRef.setInput('schematicRoutes', ROUTES_WITH_STAY_LEGS);
    fixture.componentRef.setInput('roadRoutes', ROUTES_WITH_STAY_LEGS);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(
      host.querySelectorAll('.route-mode-btn'),
    ) as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Overview', 'Driving']);
    expect(buttons[0].classList.contains('active')).toBe(true);

    buttons[1].click();
    fixture.detectChanges();
    expect(buttons[1].classList.contains('active')).toBe(true);

    fixture.componentRef.setInput('allowModeToggle', false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('.route-mode-toggle')).toBeNull();

    fixture.componentRef.setInput('allowModeToggle', true);
    fixture.componentRef.setInput('schematicRoutes', EMPTY_DAY_MAP_ROUTES);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('.route-mode-toggle')).toBeNull();
  });

  it('toggles map attribution links on attribution button click', async () => {
    const fixture = TestBed.createComponent(ItineraryMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const attribBtn = host.querySelector('.map-attrib-btn') as HTMLButtonElement;
    expect(attribBtn.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.map-attrib-links')).toBeNull();

    attribBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(attribBtn.getAttribute('aria-expanded')).toBe('true');
    const links = host.querySelector('.map-attrib-links');
    expect(links?.textContent).toContain('OpenFreeMap');
    expect(links?.textContent).toContain('OpenStreetMap');

    attribBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(attribBtn.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.map-attrib-links')).toBeNull();
  });
});
