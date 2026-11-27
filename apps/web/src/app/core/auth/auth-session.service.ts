import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import { FirebaseWebConfig, getRuntimeConfig } from '../config/runtime-config';

const DEFAULT_DEV_TOKEN = 'dev-local-user';
const AUTH_TOKEN_STORAGE_KEY = 'tripilot.authToken';
export const OFFLINE_SESSION_STORAGE_KEY = 'tripilot.offlineSession';

interface OfflineSessionSnapshot {
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
}

interface FirebaseUserLike {
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  getIdToken: () => Promise<string>;
}

interface FirebaseAppModule {
  initializeApp: (config: FirebaseWebConfig) => unknown;
}

interface FirebaseAuthModule {
  GoogleAuthProvider: new () => unknown;
  getAuth: (app: unknown) => unknown;
  onIdTokenChanged: (
    auth: unknown,
    callback: (user: FirebaseUserLike | null) => void | Promise<void>,
  ) => void;
  signInWithPopup: (auth: unknown, provider: unknown) => Promise<{ user: FirebaseUserLike }>;
  signInWithEmailAndPassword: (
    auth: unknown,
    email: string,
    password: string,
  ) => Promise<{ user: FirebaseUserLike }>;
  createUserWithEmailAndPassword: (
    auth: unknown,
    email: string,
    password: string,
  ) => Promise<{ user: FirebaseUserLike }>;
  signOut: (auth: unknown) => Promise<void>;
}

/**
 * Signal-based authentication session supporting both local DEV mode
 * and cloud Firebase Auth (Google Sign-In) via runtime-config.js,
 * with offline read-only session continuity for installed PWAs.
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly firebaseConfig = getRuntimeConfig().firebase ?? null;
  private readonly idToken = signal<string | null>(null);
  private readonly emailSignal = signal<string | null>(null);
  private readonly displayNameSignal = signal<string | null>(null);
  private readonly photoUrlSignal = signal<string | null>(null);
  private readonly offlineSessionActive = signal<boolean>(false);
  private readonly readySignal = signal<boolean>(!this.firebaseConfig);

  readonly isFirebaseEnabled = computed(() => this.firebaseConfig !== null);
  readonly isReady = this.readySignal.asReadonly();
  readonly isOfflineSession = this.offlineSessionActive.asReadonly();
  readonly userEmail = this.emailSignal.asReadonly();
  readonly userDisplayName = this.displayNameSignal.asReadonly();
  readonly userPhotoUrl = this.photoUrlSignal.asReadonly();
  readonly isAuthenticated = computed(() =>
    this.isFirebaseEnabled()
      ? this.idToken() !== null || this.offlineSessionActive()
      : true,
  );

  private firebaseAuthInstance: unknown = null;
  private initInFlight: Promise<void> | null = null;
  private currentFirebaseUser: FirebaseUserLike | null = null;
  private readyResolve: (() => void) | null = null;
  private readonly readyPromise: Promise<void>;

  constructor() {
    if (this.firebaseConfig) {
      this.readyPromise = new Promise<void>((resolve) => {
        this.readyResolve = resolve;
      });
      void this.initFirebaseAuth();
      if (typeof window !== 'undefined') {
        const handleOnline = (): void => {
          void this.handleOnlineRecovery();
        };
        window.addEventListener('online', handleOnline);
        this.destroyRef.onDestroy(() => {
          window.removeEventListener('online', handleOnline);
        });
      }
    } else {
      this.readyPromise = Promise.resolve();
    }
  }

  /** Wait until Firebase Auth has restored any persisted browser session. */
  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  getBearerToken(): string {
    if (this.isFirebaseEnabled()) {
      return this.idToken() ?? '';
    }
    try {
      return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || DEFAULT_DEV_TOKEN;
    } catch {
      return DEFAULT_DEV_TOKEN;
    }
  }

  /** Return a fresh Bearer token, letting Firebase SDK auto-refresh expired JWTs. */
  async getFreshBearerToken(): Promise<string> {
    if (!this.isFirebaseEnabled()) {
      return this.getBearerToken();
    }
    if (this.currentFirebaseUser) {
      try {
        const fresh = await this.currentFirebaseUser.getIdToken();
        this.idToken.set(fresh);
        this.offlineSessionActive.set(false);
        return fresh;
      } catch {
        return this.idToken() ?? '';
      }
    }
    return this.idToken() ?? '';
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.firebaseConfig) {
      return;
    }
    await this.initFirebaseAuth();
    const authMod = await this.loadFirebaseAuthModule();
    const provider = new authMod.GoogleAuthProvider();
    const result = await authMod.signInWithPopup(this.firebaseAuthInstance, provider);
    await this.applyResolvedFirebaseUser(result.user);
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    if (!this.firebaseConfig) {
      return;
    }
    await this.initFirebaseAuth();
    const authMod = await this.loadFirebaseAuthModule();
    const result = await authMod.signInWithEmailAndPassword(
      this.firebaseAuthInstance,
      email.trim(),
      password,
    );
    await this.applyResolvedFirebaseUser(result.user);
  }

  async signUpWithEmail(email: string, password: string): Promise<void> {
    if (!this.firebaseConfig) {
      return;
    }
    await this.initFirebaseAuth();
    const authMod = await this.loadFirebaseAuthModule();
    const result = await authMod.createUserWithEmailAndPassword(
      this.firebaseAuthInstance,
      email.trim(),
      password,
    );
    await this.applyResolvedFirebaseUser(result.user);
  }

  async signOut(): Promise<void> {
    if (this.firebaseConfig && this.firebaseAuthInstance) {
      const authMod = await this.loadFirebaseAuthModule();
      await authMod.signOut(this.firebaseAuthInstance);
    }
    this.currentFirebaseUser = null;
    this.idToken.set(null);
    this.emailSignal.set(null);
    this.displayNameSignal.set(null);
    this.photoUrlSignal.set(null);
    this.offlineSessionActive.set(false);
    this.clearOfflineSession();
  }

  private async handleOnlineRecovery(): Promise<void> {
    if (!this.firebaseConfig) {
      return;
    }
    if (!this.firebaseAuthInstance) {
      await this.initFirebaseAuth();
      return;
    }
    if (this.offlineSessionActive() && this.currentFirebaseUser) {
      const token = await this.getFreshBearerToken();
      if (token) {
        this.offlineSessionActive.set(false);
      }
    }
  }

  private async applyResolvedFirebaseUser(user: FirebaseUserLike | null): Promise<void> {
    if (!user) {
      this.currentFirebaseUser = null;
      this.idToken.set(null);
      this.emailSignal.set(null);
      this.displayNameSignal.set(null);
      this.photoUrlSignal.set(null);
      this.offlineSessionActive.set(false);
      this.clearOfflineSession();
      return;
    }

    this.currentFirebaseUser = user;
    const email = user.email ?? null;
    const displayName = user.displayName ?? null;
    const photoUrl = user.photoURL ?? null;
    try {
      const token = await user.getIdToken();
      this.idToken.set(token);
      this.emailSignal.set(email);
      this.displayNameSignal.set(displayName);
      this.photoUrlSignal.set(photoUrl);
      this.offlineSessionActive.set(false);
      this.persistOfflineSession({ email, displayName, photoUrl });
    } catch {
      this.idToken.set(null);
      if (!this.isNavigatorOnline()) {
        this.emailSignal.set(email);
        this.displayNameSignal.set(displayName);
        this.photoUrlSignal.set(photoUrl);
        this.offlineSessionActive.set(true);
        this.persistOfflineSession({ email, displayName, photoUrl });
      } else {
        this.offlineSessionActive.set(false);
      }
    }
  }

  private isNavigatorOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  private persistOfflineSession(snapshot: OfflineSessionSnapshot): void {
    try {
      localStorage.setItem(OFFLINE_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota or private-browsing failures.
    }
  }

  private readOfflineSession(): OfflineSessionSnapshot | null {
    try {
      const raw = localStorage.getItem(OFFLINE_SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }
      const record = parsed as Record<string, unknown>;
      return {
        email: typeof record['email'] === 'string' ? record['email'] : null,
        displayName: typeof record['displayName'] === 'string' ? record['displayName'] : null,
        photoUrl: typeof record['photoUrl'] === 'string' ? record['photoUrl'] : null,
      };
    } catch {
      return null;
    }
  }

  private clearOfflineSession(): void {
    try {
      localStorage.removeItem(OFFLINE_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage access errors.
    }
  }

  private restoreOfflineSessionIfOffline(): boolean {
    if (this.isNavigatorOnline()) {
      return false;
    }
    const snapshot = this.readOfflineSession();
    if (!snapshot) {
      return false;
    }
    this.emailSignal.set(snapshot.email);
    this.displayNameSignal.set(snapshot.displayName);
    this.photoUrlSignal.set(snapshot.photoUrl);
    this.offlineSessionActive.set(true);
    return true;
  }

  private async initFirebaseAuth(): Promise<void> {
    if (this.firebaseAuthInstance || !this.firebaseConfig) {
      return;
    }
    if (this.initInFlight) {
      return this.initInFlight;
    }

    const run = (async () => {
      try {
        const appMod = await this.loadFirebaseAppModule();
        const authMod = await this.loadFirebaseAuthModule();
        const app = appMod.initializeApp(this.firebaseConfig!);
        const auth = authMod.getAuth(app);
        this.firebaseAuthInstance = auth;

        authMod.onIdTokenChanged(auth, async (user: FirebaseUserLike | null) => {
          await this.applyResolvedFirebaseUser(user);
          this.readySignal.set(true);
          this.readyResolve?.();
          this.readyResolve = null;
        });
      } catch {
        this.restoreOfflineSessionIfOffline();
        this.readySignal.set(true);
        this.readyResolve?.();
        this.readyResolve = null;
      } finally {
        this.initInFlight = null;
      }
    })();

    this.initInFlight = run;
    return run;
  }

  protected loadFirebaseAppModule(): Promise<FirebaseAppModule> {
    const url = 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
    return import(/* @vite-ignore */ url) as Promise<FirebaseAppModule>;
  }

  protected loadFirebaseAuthModule(): Promise<FirebaseAuthModule> {
    const url = 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
    return import(/* @vite-ignore */ url) as Promise<FirebaseAuthModule>;
  }
}
