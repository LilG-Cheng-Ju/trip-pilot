import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { TripilotApiService } from './core/api/tripilot-api.service';
import { APP_VERSION } from './core/config/app-version';
import { I18nService } from './core/i18n/i18n.service';
import { UserProfile } from './core/models/tripilot.models';
import { BackendWakeService } from './core/network/backend-wake.service';
import { NetworkStatusService } from './core/network/network-status.service';
import { AuthStore } from './state/auth.store';

describe('App', () => {
  beforeEach(async () => {
    const profile: UserProfile = {
      id: 'u-1',
      email: 'billlcj104@gmail.com',
      display_name: 'Owner',
      role: 'OWNER',
      is_active: true,
      last_login_at: '2026-11-25T10:00:00Z',
      home_country_code: 'TW',
      home_currency: 'TWD',
      created_at: '2026-11-25T09:00:00Z',
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: TripilotApiService,
          useValue: {
            getMe: async () => profile,
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(AuthStore).reset();
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
    expect(dropdown?.textContent).toContain('Settings');
    expect(dropdown?.textContent).toContain('Admin Console');
    expect(dropdown?.textContent).toContain(`v${APP_VERSION}`);
  });

  it('should show and hide the offline banner when NetworkStatusService.isOnline toggles', async () => {
    const i18n = TestBed.inject(I18nService);
    const network = TestBed.inject(NetworkStatusService);
    i18n.setLocale('en');
    network.isOnline.set(true);

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.offline-bar')).toBeNull();

    network.isOnline.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const offlineBar = compiled.querySelector('.offline-bar');
    expect(offlineBar).toBeTruthy();
    expect(offlineBar?.textContent).toContain('Offline — showing cached data on this device');

    network.isOnline.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('.offline-bar')).toBeNull();
  });

  it('should show unread release dot until What\'s New is opened and render release history', async () => {
    localStorage.removeItem('tripilot:last_seen_version');
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('zh-TW');

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.avatar-unread-dot')).toBeTruthy();

    const avatarBtn = compiled.querySelector('.avatar-btn') as HTMLButtonElement;
    avatarBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const versionBtn = compiled.querySelector('.version-pill-btn') as HTMLButtonElement;
    versionBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('.avatar-unread-dot')).toBeNull();
    expect(localStorage.getItem('tripilot:last_seen_version')).toBe(APP_VERSION);
    expect(compiled.textContent).toContain('Tripilot 更新日誌');
    expect(compiled.textContent).toContain(`v${APP_VERSION}`);
  });

  it('should show wake overlay, lock nav tabs, and keep avatar menu actions usable in preview mode', async () => {
    const i18n = TestBed.inject(I18nService);
    const wake = TestBed.inject(BackendWakeService);
    i18n.setLocale('zh-TW');
    wake.reset();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.wake-backdrop')).toBeNull();

    wake.setPreviewMode(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('.wake-backdrop')).toBeTruthy();
    expect(compiled.querySelector('.nav-tab.nav-locked')).toBeTruthy();

    const avatarBtn = compiled.querySelector('.avatar-btn') as HTMLButtonElement;
    avatarBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dropdown = compiled.querySelector('.account-dropdown');
    expect(dropdown).toBeTruthy();
    expect(dropdown?.querySelector('a[routerLink="/profile"]')?.classList.contains('disabled')).toBe(
      true,
    );
    expect(dropdown?.querySelector('.version-pill-btn')).toBeTruthy();

    wake.reset();
  });
});
