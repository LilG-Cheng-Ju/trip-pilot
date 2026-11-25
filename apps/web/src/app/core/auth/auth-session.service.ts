import { computed, Injectable, signal } from '@angular/core';

import { FirebaseWebConfig, getRuntimeConfig } from '../config/runtime-config';

const DEFAULT_DEV_TOKEN = 'dev-local-user';
const AUTH_TOKEN_STORAGE_KEY = 'tripilot.authToken';

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
 * and cloud Firebase Auth (Google Sign-In) via runtime-config.js.
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly firebaseConfig = getRuntimeConfig().firebase ?? null;
  private readonly idToken = signal<string | null>(null);
  private readonly emailSignal = signal<string | null>(null);
  private readonly displayNameSignal = signal<string | null>(null);
  private readonly photoUrlSignal = signal<string | null>(null);
  private readonly readySignal = signal<boolean>(!this.firebaseConfig);

  readonly isFirebaseEnabled = computed(() => this.firebaseConfig !== null);
  readonly isReady = this.readySignal.asReadonly();
  readonly userEmail = this.emailSignal.asReadonly();
  readonly userDisplayName = this.displayNameSignal.asReadonly();
  readonly userPhotoUrl = this.photoUrlSignal.asReadonly();
  readonly isAuthenticated = computed(() =>
    this.isFirebaseEnabled() ? this.idToken() !== null : true,
  );

  private firebaseAuthInstance: unknown = null;
  private currentFirebaseUser: FirebaseUserLike | null = null;
  private readyResolve: (() => void) | null = null;
  private readonly readyPromise: Promise<void>;

  constructor() {
    if (this.firebaseConfig) {
      this.readyPromise = new Promise<void>((resolve) => {
        this.readyResolve = resolve;
      });
      void this.initFirebaseAuth();
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
    await this.applyFirebaseUser(result.user);
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
    await this.applyFirebaseUser(result.user);
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
    await this.applyFirebaseUser(result.user);
  }

  private async applyFirebaseUser(user: FirebaseUserLike): Promise<void> {
    this.currentFirebaseUser = user;
    const token = await user.getIdToken();
    this.idToken.set(token);
    this.emailSignal.set(user.email ?? null);
    this.displayNameSignal.set(user.displayName ?? null);
    this.photoUrlSignal.set(user.photoURL ?? null);
  }

  async signOut(): Promise<void> {
    if (!this.firebaseConfig || !this.firebaseAuthInstance) {
      return;
    }
    const authMod = await this.loadFirebaseAuthModule();
    await authMod.signOut(this.firebaseAuthInstance);
    this.currentFirebaseUser = null;
    this.idToken.set(null);
    this.emailSignal.set(null);
    this.displayNameSignal.set(null);
    this.photoUrlSignal.set(null);
  }

  private async initFirebaseAuth(): Promise<void> {
    if (this.firebaseAuthInstance || !this.firebaseConfig) {
      return;
    }
    try {
      const appMod = await this.loadFirebaseAppModule();
      const authMod = await this.loadFirebaseAuthModule();
      const app = appMod.initializeApp(this.firebaseConfig);
      const auth = authMod.getAuth(app);
      this.firebaseAuthInstance = auth;

      authMod.onIdTokenChanged(auth, async (user: FirebaseUserLike | null) => {
          if (user) {
            this.currentFirebaseUser = user;
            this.idToken.set(await user.getIdToken());
            this.emailSignal.set(user.email ?? null);
            this.displayNameSignal.set(user.displayName ?? null);
            this.photoUrlSignal.set(user.photoURL ?? null);
          } else {
            this.currentFirebaseUser = null;
            this.idToken.set(null);
            this.emailSignal.set(null);
            this.displayNameSignal.set(null);
            this.photoUrlSignal.set(null);
          }
          this.readySignal.set(true);
          this.readyResolve?.();
          this.readyResolve = null;
        },
      );
    } catch {
      this.readySignal.set(true);
      this.readyResolve?.();
      this.readyResolve = null;
    }
  }

  private loadFirebaseAppModule(): Promise<FirebaseAppModule> {
    const url = 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
    return import(/* @vite-ignore */ url) as Promise<FirebaseAppModule>;
  }

  private loadFirebaseAuthModule(): Promise<FirebaseAuthModule> {
    const url = 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
    return import(/* @vite-ignore */ url) as Promise<FirebaseAuthModule>;
  }
}
