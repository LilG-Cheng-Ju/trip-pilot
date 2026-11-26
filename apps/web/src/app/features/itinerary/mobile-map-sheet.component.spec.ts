import { TestBed } from '@angular/core/testing';

import { I18nService } from '../../core/i18n/i18n.service';
import { MobileMapSheetComponent } from './mobile-map-sheet.component';

describe('MobileMapSheetComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MobileMapSheetComponent],
    }).compileComponents();
    TestBed.inject(I18nService).setLocale('en');
  });

  it('closes when the sheet header is dragged downward past the threshold and springs back on short pulls', async () => {
    const fixture = TestBed.createComponent(MobileMapSheetComponent);
    fixture.componentRef.setInput('dayLabel', 'Day 1 · 04-01');
    fixture.detectChanges();
    await fixture.whenStable();

    let closeCount = 0;
    fixture.componentInstance.closed.subscribe(() => {
      closeCount += 1;
    });

    const host = fixture.nativeElement as HTMLElement;
    const bar = host.querySelector('.sheet-bar') as HTMLElement;

    // Short pull (< 84px) springs back without closing.
    bar.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientY: 100, button: 0, bubbles: true }));
    bar.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientY: 140, bubbles: true }));
    bar.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientY: 140, bubbles: true }));
    fixture.detectChanges();
    expect(closeCount).toBe(0);

    // Full swipe down (>= 84px) emits closed.
    bar.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientY: 100, button: 0, bubbles: true }));
    bar.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientY: 210, bubbles: true }));
    bar.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, clientY: 210, bubbles: true }));
    fixture.detectChanges();
    expect(closeCount).toBe(1);
  });
});
