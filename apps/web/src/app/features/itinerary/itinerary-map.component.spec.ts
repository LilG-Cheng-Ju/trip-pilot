import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

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

  it('calls map.easeTo when selectedPinId is outside bounds and skips when inside bounds', async () => {
    const fixture = TestBed.createComponent(ItineraryMapComponent);
    const pins = [
      { id: 'spot-in', order: 1, title: 'Senso-ji', lat: 35.7148, lng: 139.7967, type: 'SPOT' },
      { id: 'spot-out', order: 2, title: 'Hakone', lat: 35.2324, lng: 139.1069, type: 'SPOT' },
    ];
    fixture.componentRef.setInput('pins', pins);
    fixture.detectChanges();
    await fixture.whenStable();
    await (fixture.componentInstance as unknown as { mapInitPromise: Promise<void> | null })
      .mapInitPromise;

    let inBounds = false;
    const easeTo = vi.fn();
    const contains = vi.fn(() => inBounds);
    (fixture.componentInstance as unknown as { map: unknown }).map = {
      getBounds: () => ({ contains }),
      easeTo,
      remove: vi.fn(),
    };

    // Out-of-bounds selection triggers smooth pan
    inBounds = false;
    fixture.componentRef.setInput('selectedPinId', 'spot-out');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(contains).toHaveBeenCalledWith([139.1069, 35.2324]);
    expect(easeTo).toHaveBeenCalledTimes(1);
    expect(easeTo).toHaveBeenCalledWith({ center: [139.1069, 35.2324], duration: 450 });

    // In-bounds selection does not pan
    inBounds = true;
    fixture.componentRef.setInput('selectedPinId', 'spot-in');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(contains).toHaveBeenCalledWith([139.7967, 35.7148]);
    expect(easeTo).toHaveBeenCalledTimes(1);
  });

  it('injects /maplibre-gl.css once and resizes the map on stylesheet load', async () => {
    document.querySelectorAll('link[data-maplibre-css]').forEach((el) => el.remove());

    const fixture = TestBed.createComponent(ItineraryMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const links = document.querySelectorAll<HTMLLinkElement>('link[data-maplibre-css]');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/maplibre-gl.css');

    const resize = vi.fn();
    (fixture.componentInstance as unknown as { map: unknown }).map = {
      resize,
      remove: vi.fn(),
    };
    links[0].dispatchEvent(new Event('load'));
    expect(resize).toHaveBeenCalledTimes(1);

    document.querySelectorAll('link[data-maplibre-css]').forEach((el) => el.remove());
  });

  it('defers panning until active becomes true and resizes the map on activation', async () => {
    const fixture = TestBed.createComponent(ItineraryMapComponent);
    const pins = [
      { id: 'spot-1', order: 1, title: 'Senso-ji', lat: 35.7148, lng: 139.7967, type: 'SPOT' },
    ];
    fixture.componentRef.setInput('pins', pins);
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    await fixture.whenStable();
    await (fixture.componentInstance as unknown as { mapInitPromise: Promise<void> | null })
      .mapInitPromise;

    const easeTo = vi.fn();
    const resize = vi.fn();
    (fixture.componentInstance as unknown as { map: unknown }).map = {
      getBounds: () => ({ contains: () => false }),
      easeTo,
      resize,
      remove: vi.fn(),
    };

    fixture.componentRef.setInput('selectedPinId', 'spot-1');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(easeTo).not.toHaveBeenCalled();

    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(resize).toHaveBeenCalledTimes(1);
    expect(easeTo).toHaveBeenCalledTimes(1);
    expect(easeTo).toHaveBeenCalledWith({ center: [139.7967, 35.7148], duration: 450 });
  });
});
