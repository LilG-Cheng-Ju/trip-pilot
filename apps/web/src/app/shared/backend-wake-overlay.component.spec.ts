import { TestBed } from '@angular/core/testing';

import { I18nService } from '../core/i18n/i18n.service';
import { BACKEND_WAKE_MESSAGES } from './backend-wake-messages';
import { AppBackendWakeOverlayComponent } from './backend-wake-overlay.component';

describe('AppBackendWakeOverlayComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppBackendWakeOverlayComponent],
    }).compileComponents();
  });

  it('keeps wake messages bilingual and free of em/en dashes', () => {
    expect(BACKEND_WAKE_MESSAGES.length).toBeGreaterThanOrEqual(8);
    for (const msg of BACKEND_WAKE_MESSAGES) {
      expect(msg.tag['zh-TW'].trim().length).toBeGreaterThan(0);
      expect(msg.tag.en.trim().length).toBeGreaterThan(0);
      expect(msg.text['zh-TW'].trim().length).toBeGreaterThan(0);
      expect(msg.text.en.trim().length).toBeGreaterThan(0);
      expect(msg.text['zh-TW']).not.toMatch(/—|——|–|--/);
      expect(msg.text.en).not.toMatch(/—|——|–|--/);
    }
  });

  it('renders nothing when inactive and rotates tips/jokes manually when active', async () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('zh-TW');

    const fixture = TestBed.createComponent(AppBackendWakeOverlayComponent);
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.wake-backdrop')).toBeNull();

    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('.wake-backdrop')).toBeTruthy();
    expect(host.querySelector('.wake-title')?.textContent?.trim()).toBe('後端啟動中');
    const firstCopy = host.querySelector('.wake-copy')?.textContent?.trim();
    expect(firstCopy).toBeTruthy();

    const nextBtn = host.querySelector('.wake-next-btn') as HTMLButtonElement;
    nextBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const secondCopy = host.querySelector('.wake-copy')?.textContent?.trim();
    expect(secondCopy).toBeTruthy();
    expect(secondCopy).not.toBe(firstCopy);

    i18n.setLocale('en');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('.wake-title')?.textContent?.trim()).toBe('Waking up server');
    expect(host.querySelector('.wake-next-btn')?.textContent).toContain('Next');
  });
});
