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
import { PwaUpdateService } from './core/pwa/pwa-update.service';
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

    const dropdown = document.querySelector('.account-dropdown');
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
    expect(offlineBar?.textContent).toContain('Offline — viewing cached data');

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

    const versionBtn = document.querySelector('.version-pill-btn') as HTMLButtonElement;
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

    const dropdown = document.querySelector('.account-dropdown');
    expect(dropdown).toBeTruthy();
    expect(dropdown?.querySelector('a[routerLink="/profile"]')?.classList.contains('disabled')).toBe(
      true,
    );
    expect(dropdown?.querySelector('.version-pill-btn')).toBeTruthy();

    wake.reset();
  });

  it('should show whats-new toast for returning upgraded users with release notes and acknowledge buttons', async () => {
    localStorage.setItem('tripilot:last_seen_version', '0.9.16-beta');
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('zh-TW');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const toast = compiled.querySelector('app-update-toast');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain(`v${APP_VERSION}`);
    expect(toast?.textContent).toContain('更新日誌');
    expect(toast?.textContent).toContain('確認');

    const changelogBtn = toast?.querySelector('.btn-ghost') as HTMLButtonElement;
    changelogBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('app-update-toast')).toBeNull();
    expect(compiled.textContent).toContain('Tripilot 更新日誌');
    expect(localStorage.getItem('tripilot:last_seen_version')).toBe(APP_VERSION);
  });

  it('should dismiss whats-new toast and clear unread dot when clicking acknowledge', async () => {
    localStorage.setItem('tripilot:last_seen_version', '0.9.16-beta');
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('zh-TW');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.avatar-unread-dot')).toBeTruthy();
    const ackBtn = compiled.querySelector('app-update-toast .btn-primary') as HTMLButtonElement;
    ackBtn.click();
    fixture.detectChanges();

    expect(compiled.querySelector('app-update-toast')).toBeNull();
    expect(compiled.querySelector('.avatar-unread-dot')).toBeNull();
    expect(localStorage.getItem('tripilot:last_seen_version')).toBe(APP_VERSION);
  });

  it('should show update-ready toast when PwaUpdateService detects a pending SW build', async () => {
    localStorage.setItem('tripilot:last_seen_version', APP_VERSION);
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('zh-TW');

    const fixture = TestBed.createComponent(App);
    const pwaUpdate = TestBed.inject(PwaUpdateService);
    pwaUpdate.pendingUpdate.set({
      versionHash: 'hash-next',
      note: {
        version: '0.9.18-beta',
        date: '2026-11-29',
        title: {
          'zh-TW': '即將更新的測試版本',
          en: 'Upcoming Release',
        },
        changes: {
          'zh-TW': ['加入即時新版本提示卡片'],
          en: ['Added proactive update banner'],
        },
      },
    });

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const toast = compiled.querySelector('app-update-toast');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain('發現新版本');
    expect(toast?.textContent).toContain('v0.9.18-beta');
    expect(toast?.textContent).toContain('加入即時新版本提示卡片');
    expect(toast?.textContent).toContain('立即更新');
  });
});
