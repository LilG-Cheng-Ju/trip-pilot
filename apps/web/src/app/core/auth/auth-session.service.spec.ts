import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import { vi } from 'vitest';

import { TripilotApiService } from '../api/tripilot-api.service';
import { AuthStore } from '../../state/auth.store';
import { authGuard } from './auth.guard';
import { AuthSessionService, OFFLINE_SESSION_STORAGE_KEY } from './auth-session.service';

const FIREBASE_CONFIG = {
  apiKey: 'test-key',
  authDomain: 'tripilot.firebaseapp.com',
  projectId: 'tripilot',
};

function setNavigatorOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

describe('AuthSessionService offline PWA continuity', () => {
  let originalConfig: typeof window.__TRIPILOT_CONFIG__;
  let originalOnLineDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorage.clear();
    originalConfig = window.__TRIPILOT_CONFIG__;
    originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
    window.__TRIPILOT_CONFIG__ = { firebase: FIREBASE_CONFIG };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    window.__TRIPILOT_CONFIG__ = originalConfig;
    if (originalOnLineDescriptor) {
      Object.defineProperty(window.navigator, 'onLine', originalOnLineDescriptor);
    } else {
      setNavigatorOnline(true);
    }
  });

  it('keeps persisted user authenticated in offline read-only mode when Firebase CDN import fails and allows authGuard', async () => {
    setNavigatorOnline(false);
    localStorage.setItem(
      OFFLINE_SESSION_STORAGE_KEY,
      JSON.stringify({
        email: 'traveler@example.com',
        displayName: 'Alex',
        photoUrl: 'https://example.com/avatar.png',
      }),
    );

    vi.spyOn(
      AuthSessionService.prototype as unknown as { loadFirebaseAppModule: () => Promise<unknown> },
      'loadFirebaseAppModule',
    ).mockRejectedValue(new Error('Network offline'));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: TripilotApiService,
          useValue: {
            getMe: async () => {
              throw new Error('Offline');
            },
          },
        },
      ],
    });

    const service = TestBed.inject(AuthSessionService);
    await service.waitUntilReady();

    expect(service.isReady()).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.isOfflineSession()).toBe(true);
    expect(service.userEmail()).toBe('traveler@example.com');
    expect(service.userDisplayName()).toBe('Alex');
    expect(service.userPhotoUrl()).toBe('https://example.com/avatar.png');
    expect(service.getBearerToken()).toBe('');

    const guardResult = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect(guardResult).toBe(true);
    expect(TestBed.inject(AuthStore).suspended()).toBe(false);
  });

  it('redirects to /login when offline cold-start has no persisted offline session', async () => {
    setNavigatorOnline(false);

    vi.spyOn(
      AuthSessionService.prototype as unknown as { loadFirebaseAppModule: () => Promise<unknown> },
      'loadFirebaseAppModule',
    ).mockRejectedValue(new Error('Network offline'));

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient()],
    });

    const service = TestBed.inject(AuthSessionService);
    await service.waitUntilReady();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.isOfflineSession()).toBe(false);

    const guardResult = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect(guardResult instanceof UrlTree).toBe(true);
    expect((guardResult as UrlTree).toString()).toBe('/login');
  });

  it('recovers real Firebase ID token on online event and clears offline session when signed out', async () => {
    setNavigatorOnline(false);
    localStorage.setItem(
      OFFLINE_SESSION_STORAGE_KEY,
      JSON.stringify({
        email: 'traveler@example.com',
        displayName: 'Alex',
        photoUrl: null,
      }),
    );

    const loadAppSpy = vi
      .spyOn(
        AuthSessionService.prototype as unknown as { loadFirebaseAppModule: () => Promise<unknown> },
        'loadFirebaseAppModule',
      )
      .mockRejectedValueOnce(new Error('Offline'));

    let authCallback: ((user: unknown) => Promise<void>) | null = null;
    vi.spyOn(
      AuthSessionService.prototype as unknown as { loadFirebaseAuthModule: () => Promise<unknown> },
      'loadFirebaseAuthModule',
    ).mockResolvedValue({
      getAuth: () => ({ name: 'auth' }),
      onIdTokenChanged: (_auth: unknown, cb: (user: unknown) => Promise<void>) => {
        authCallback = cb;
      },
      signOut: async () => undefined,
    });

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient()],
    });

    const service = TestBed.inject(AuthSessionService);
    await service.waitUntilReady();
    expect(service.isOfflineSession()).toBe(true);

    // Simulate connectivity restoration.
    loadAppSpy.mockResolvedValue({ initializeApp: () => ({ name: 'app' }) });
    setNavigatorOnline(true);
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(authCallback).not.toBeNull();
    await authCallback!({
      email: 'traveler@example.com',
      displayName: 'Alex',
      photoURL: null,
      getIdToken: async () => 'fresh-jwt-123',
    });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.isOfflineSession()).toBe(false);
    expect(service.getBearerToken()).toBe('fresh-jwt-123');

    // If Firebase reports the session was revoked/signed out after coming online, clear persisted offline state.
    await authCallback!(null);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.isOfflineSession()).toBe(false);
    expect(localStorage.getItem(OFFLINE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('preserves offline session when onIdTokenChanged user.getIdToken rejects while offline', async () => {
    setNavigatorOnline(false);

    vi.spyOn(
      AuthSessionService.prototype as unknown as { loadFirebaseAppModule: () => Promise<unknown> },
      'loadFirebaseAppModule',
    ).mockResolvedValue({ initializeApp: () => ({ name: 'app' }) });

    vi.spyOn(
      AuthSessionService.prototype as unknown as { loadFirebaseAuthModule: () => Promise<unknown> },
      'loadFirebaseAuthModule',
    ).mockResolvedValue({
      getAuth: () => ({ name: 'auth' }),
      onIdTokenChanged: (_auth: unknown, cb: (user: unknown) => Promise<void>) => {
        void cb({
          email: 'traveler@example.com',
          displayName: 'Alex',
          photoURL: null,
          getIdToken: async () => {
            throw new Error('auth/network-request-failed');
          },
        });
      },
    });

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient()],
    });

    const service = TestBed.inject(AuthSessionService);
    await service.waitUntilReady();

    expect(service.isAuthenticated()).toBe(true);
    expect(service.isOfflineSession()).toBe(true);
    expect(service.userEmail()).toBe('traveler@example.com');
    expect(localStorage.getItem(OFFLINE_SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it('clears persisted offline session when signing out offline without Firebase auth instance', async () => {
    setNavigatorOnline(false);
    localStorage.setItem(
      OFFLINE_SESSION_STORAGE_KEY,
      JSON.stringify({
        email: 'traveler@example.com',
        displayName: 'Alex',
        photoUrl: null,
      }),
    );

    vi.spyOn(
      AuthSessionService.prototype as unknown as { loadFirebaseAppModule: () => Promise<unknown> },
      'loadFirebaseAppModule',
    ).mockRejectedValue(new Error('Offline'));

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient()],
    });

    const service = TestBed.inject(AuthSessionService);
    await service.waitUntilReady();
    expect(service.isAuthenticated()).toBe(true);

    await service.signOut();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.isOfflineSession()).toBe(false);
    expect(service.userEmail()).toBeNull();
    expect(localStorage.getItem(OFFLINE_SESSION_STORAGE_KEY)).toBeNull();
  });
});
