import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import { I18nService } from '../core/i18n/i18n.service';
import { AirportEntry } from '../core/models/tripilot.models';
import { AppAirportPickerComponent } from './airport-picker.component';

const MOCK_AIRPORTS: AirportEntry[] = [
  {
    iata: 'NRT',
    name: 'Narita International Airport',
    city: 'Tokyo',
    country_code: 'JP',
    latitude: 35.772,
    longitude: 140.3929,
    timezone: 'Asia/Tokyo',
  },
  {
    iata: 'HND',
    name: 'Haneda Airport',
    city: 'Tokyo',
    country_code: 'JP',
    latitude: 35.5494,
    longitude: 139.7798,
    timezone: 'Asia/Tokyo',
  },
];

describe('AppAirportPickerComponent', () => {
  let searchAirportsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    searchAirportsMock = vi.fn(async () => MOCK_AIRPORTS);

    await TestBed.configureTestingModule({
      imports: [AppAirportPickerComponent],
      providers: [
        {
          provide: TripilotApiService,
          useValue: { searchAirports: searchAirportsMock },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces 2+ character queries by 220ms and selects clicked airport', async () => {
    const fixture = TestBed.createComponent(AppAirportPickerComponent);
    fixture.componentRef.setInput('label', 'Origin Airport');
    fixture.componentRef.setInput('placeholder', 'IATA or city');
    fixture.componentRef.setInput('inputId', 'origin-input');
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((val) => emitted.push(val));

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('#origin-input') as HTMLInputElement;
    expect(host.querySelector('label')?.getAttribute('for')).toBe('origin-input');
    expect(input.placeholder).toBe('IATA or city');

    // Single character should not trigger search
    input.value = 't';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(250);
    expect(searchAirportsMock).not.toHaveBeenCalled();

    // Two+ characters debounce by 220ms and request limit 8
    input.value = 'to';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(150);
    expect(searchAirportsMock).not.toHaveBeenCalled();

    input.value = 'tokyo';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(220);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(searchAirportsMock).toHaveBeenCalledTimes(1);
    expect(searchAirportsMock).toHaveBeenCalledWith('tokyo', 8);

    const options = Array.from(host.querySelectorAll('[role="option"]')) as HTMLButtonElement[];
    expect(options).toHaveLength(2);
    expect(options[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'NRT — Narita International Airport · Tokyo',
    );

    options[0].click();
    fixture.detectChanges();

    expect(input.value).toBe('NRT');
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(emitted[emitted.length - 1]).toBe('NRT');
  });

  it('supports keyboard ArrowDown, ArrowUp, Enter, and Escape plus outside click close', async () => {
    const fixture = TestBed.createComponent(AppAirportPickerComponent);
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((val) => emitted.push(val));

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input') as HTMLInputElement;

    input.value = 'tokyo';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(220);
    fixture.detectChanges();
    await fixture.whenStable();

    // ArrowDown moves highlight to index 1 (HND), ArrowUp returns to 0 (NRT), ArrowDown back to 1
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    const options = Array.from(host.querySelectorAll('[role="option"]'));
    expect(options[1].classList.contains('active')).toBe(true);

    // Escape closes without selecting
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(host.querySelector('[role="listbox"]')).toBeNull();

    // ArrowDown reopens at index 0, second ArrowDown highlights index 1 (HND), Enter commits
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(host.querySelector('[role="listbox"]')).toBeTruthy();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(input.value).toBe('HND');
    expect(emitted[emitted.length - 1]).toBe('HND');

    // Outside click closes open listbox
    input.value = 'tokyo';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(220);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('[role="listbox"]')).toBeTruthy();

    document.body.click();
    fixture.detectChanges();
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  });

  it('preserves manual 3-letter uppercase IATA fallback offline or when unfound and closes on blur', async () => {
    searchAirportsMock.mockRejectedValueOnce(new Error('Offline'));

    const fixture = TestBed.createComponent(AppAirportPickerComponent);
    fixture.componentRef.setInput('value', 'TSA');
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((val) => emitted.push(val));

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('TSA');

    input.value = 'kix';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(220);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted).toContain('KIX');
    expect(host.querySelector('[role="listbox"]')).toBeNull();

    // Unfound empty list shows helpful hint, preserves manual 3-letter code, and closes on blur
    searchAirportsMock.mockResolvedValueOnce([]);
    input.value = 'xyz';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(220);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('.empty-opt')).toBeTruthy();
    input.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
    fixture.detectChanges();

    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(input.value).toBe('XYZ');
    expect(emitted[emitted.length - 1]).toBe('XYZ');
  });
});
