import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { APP_VERSION } from './core/config/app-version';
import { I18nService } from './core/i18n/i18n.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the Tripilot shell with BETA badge and switch navigation labels by locale', async () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('en');

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe('Tripilot');
    expect(compiled.querySelector('.beta-badge')?.textContent?.trim()).toBe('BETA');
    expect(compiled.textContent).toContain('Trips');

    i18n.setLocale('zh-TW');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.textContent).toContain('旅程');
  });

  it('should open the account avatar menu and show settings and app version', async () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('en');

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const avatarBtn = compiled.querySelector('.avatar-btn') as HTMLButtonElement;
    avatarBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dropdown = compiled.querySelector('.account-dropdown');
    expect(dropdown?.textContent).toContain('Settings & Agent Access');
    expect(dropdown?.textContent).toContain(`v${APP_VERSION}`);
  });
});
