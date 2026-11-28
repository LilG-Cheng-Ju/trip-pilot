import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { provideTripilotDateAdapter } from '../../core/config/material-date-formats';
import { I18nService } from '../../core/i18n/i18n.service';
import { PlaceCandidate } from '../../core/models/tripilot.models';
import { ItemFormModalComponent, ItemFormSubmitEvent } from './item-form-modal.component';

describe('ItemFormModalComponent', () => {
  let resolvePlaceUrlSpy: ReturnType<typeof vi.fn>;
  let searchPlacesSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.clear();
    const resolvedCandidate: PlaceCandidate = {
      name: 'Senso-ji Temple',
      address: '2-3-1 Asakusa, Taito',
      latitude: 35.7148,
      longitude: 139.7967,
      google_maps_url: 'https://maps.google.com/?q=35.7148,139.7967',
      provider: 'url_resolve',
    };
    resolvePlaceUrlSpy = vi.fn(async () => resolvedCandidate);
    searchPlacesSpy = vi.fn(async () => [resolvedCandidate]);

    await TestBed.configureTestingModule({
      imports: [ItemFormModalComponent],
      providers: [
        provideTripilotDateAdapter(),
        {
          provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
          useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
        },
        {
          provide: TripilotApiService,
          useValue: {
            resolvePlaceUrl: resolvePlaceUrlSpy,
            searchPlaces: searchPlacesSpy,
            resolveLinkTitle: async () => ({ title: 'Ticket PDF' }),
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('displays typed modal title and allows switching type without losing draft title', () => {
    const fixture: ComponentFixture<ItemFormModalComponent> =
      TestBed.createComponent(ItemFormModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('initialType', 'SPOT');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add Spot');

    const titleInput = host.querySelector<HTMLInputElement>('input[name="itemTitle"]')!;
    titleInput.value = 'Kawaguchiko Station';
    titleInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const switchBtn = host.querySelector<HTMLButtonElement>('.type-switch-btn')!;
    switchBtn.click();
    fixture.detectChanges();

    const matSelect = fixture.debugElement.query(By.directive(MatSelect))
      .componentInstance as MatSelect;
    matSelect.selectionChange.emit(new MatSelectChange(matSelect, 'STAY'));
    fixture.detectChanges();

    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add Stay');
    expect(host.querySelector<HTMLInputElement>('input[name="itemTitle"]')?.value).toBe(
      'Kawaguchiko Station',
    );
  });

  it('auto-resolves a pasted Google Maps short URL without clicking Resolve', async () => {
    const fixture = TestBed.createComponent(ItemFormModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('initialType', 'FOOD');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const placeInput = host.querySelector<HTMLInputElement>('input[name="placeQuery"]')!;
    placeInput.value = 'https://maps.app.goo.gl/abc123';
    placeInput.dispatchEvent(new Event('input'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(resolvePlaceUrlSpy).toHaveBeenCalledWith('https://maps.app.goo.gl/abc123');
    expect(host.querySelector('.pinned-badge')?.textContent).toContain('Senso-ji Temple');
    expect(host.querySelector<HTMLInputElement>('input[name="itemTitle"]')?.value).toBe(
      'Senso-ji Temple',
    );
  });

  it('emits addAnother on Save & Add Another and resets form while carrying end time forward', () => {
    const fixture = TestBed.createComponent(ItemFormModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('initialType', 'FOOD');
    fixture.detectChanges();

    const emitted: ItemFormSubmitEvent[] = [];
    fixture.componentInstance.saved.subscribe((ev) => emitted.push(ev));

    const host = fixture.nativeElement as HTMLElement;
    const titleInput = host.querySelector<HTMLInputElement>('input[name="itemTitle"]')!;
    titleInput.value = 'Ichiran Ramen';
    titleInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const addAnotherBtn = host.querySelector<HTMLButtonElement>('.add-another-btn')!;
    addAnotherBtn.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].addAnother).toBe(true);
    expect(emitted[0].payload.type).toBe('FOOD');
    expect(emitted[0].payload.title).toBe('Ichiran Ramen');

    fixture.componentInstance.resetForNext('Ichiran Ramen', '13:30');
    fixture.detectChanges();

    expect(host.querySelector('.added-banner')?.textContent).toContain('Added "Ichiran Ramen"');
    expect(host.querySelector<HTMLInputElement>('input[name="itemTitle"]')?.value).toBe('');
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Add Food & Drink',
    );
    const timeInputs = host.querySelectorAll<HTMLInputElement>('app-time-input input');
    expect(timeInputs[0]?.value).toBe('13:30');
    expect(timeInputs[1]?.value ?? '').toBe('');
  });
});
