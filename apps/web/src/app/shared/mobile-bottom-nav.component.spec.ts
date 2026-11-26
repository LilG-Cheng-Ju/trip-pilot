import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { I18nService } from '../core/i18n/i18n.service';
import { MobileBottomNavComponent } from './mobile-bottom-nav.component';

describe('MobileBottomNavComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MobileBottomNavComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    TestBed.inject(I18nService).setLocale('en');
  });

  it('renders global 2-tab navigation on top-level routes', () => {
    const fixture = TestBed.createComponent(MobileBottomNavComponent);
    fixture.componentRef.setInput('currentUrl', '/trips');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const nav = host.querySelector('.mobile-bottom-nav');
    const items = Array.from(host.querySelectorAll('.bottom-item'));

    expect(nav?.classList.contains('trip-mode')).toBe(false);
    expect(items).toHaveLength(2);
    expect(items.map((el) => el.textContent)).toEqual([
      expect.stringContaining('Trips'),
      expect.stringContaining('Logbook'),
    ]);

    fixture.componentRef.setInput('currentUrl', '/stats');
    fixture.detectChanges();
    expect(host.querySelector('.mobile-bottom-nav')?.classList.contains('trip-mode')).toBe(
      false,
    );
  });

  it('switches into 4-tab contextual trip workspace mode inside /trips/:id/*', () => {
    const fixture = TestBed.createComponent(MobileBottomNavComponent);
    fixture.componentRef.setInput('currentUrl', '/trips/trip-42/expenses?itemId=it-1');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const nav = host.querySelector('.mobile-bottom-nav');
    const links = Array.from(host.querySelectorAll('a.bottom-item')) as HTMLAnchorElement[];

    expect(nav?.classList.contains('trip-mode')).toBe(true);
    expect(links).toHaveLength(4);
    expect(links[0].classList.contains('back-item')).toBe(true);
    expect(links[0].getAttribute('href')).toBe('/trips');
    expect(links[1].getAttribute('href')).toBe('/trips/trip-42');
    expect(links[2].getAttribute('href')).toBe('/trips/trip-42/brief');
    expect(links[3].getAttribute('href')).toBe('/trips/trip-42/expenses');
    expect(links.map((el) => el.textContent)).toEqual([
      expect.stringContaining('All Trips'),
      expect.stringContaining('Itinerary'),
      expect.stringContaining('Brief'),
      expect.stringContaining('Expenses'),
    ]);
  });
});
