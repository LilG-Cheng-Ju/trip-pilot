import { computed, Injectable, signal } from '@angular/core';

import { getRuntimeConfig } from '../config/runtime-config';

const DEFAULT_DEV_TOKEN = 'dev-local-user';
const AUTH_TOKEN_STORAGE_KEY = 'tripilot.authToken';

/**
 * Signal-based authentication session supporting both local DEV mode
 * and cloud Firebase Auth (Google Sign-In) via runtime-config.js.
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly firebaseConfig = getRuntimeConfig().firebase ?? null;
  private readonly idToken = signal<string | null>(null);
  private readonly emailSignal = signal<string | null>(null);
  private readonly readySignal = signal<boolean>(!this.firebaseConfig);

  readonly isFirebaseEnabled = computed(() => this.firebaseConfig !== null);
  readonly isReady = this.readySignal.asReadonly();
  readonly userEmail = this.emailSignal.asReadonly();
  readonly isAuthenticated = computed(() =>
    this.isFirebaseEnabled() ? this.idToken() !== null : true,
  );

  private firebaseAuthInstance: unknown = null;

  constructor() {
    if (this.firebaseConfig) {
      void this.initFirebaseAuth();
    }
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

  async signInWithGoogle(): Promise<void> {
    if (!this.firebaseConfig) {
      return;
    }
    await this.initFirebaseAuth();
    const authMod = await this.loadFirebaseAuthModule();
    const provider = new authMod.GoogleAuthProvider();
    const result = await authMod.signInWithPopup(this.firebaseAuthInstance, provider);
    const token = await result.user.getIdToken();
    this.idToken.set(token);
    this.emailSignal.set(result.user.email ?? null);
  }

  async signOut(): Promise<void> {
    if (!this.firebaseConfig || !this.firebaseAuthInstance) {
      return;
    }
    const authMod = await this.loadFirebaseAuthModule();
    await authMod.signOut(this.firebaseAuthInstance);
    this.idToken.set(null);
    this.emailSignal.set(null);
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

      authMod.onIdTokenChanged(auth, async (user: { email?: string | null; getIdToken: () => Promise<string> } | null) => {
        if (user) {
          this.idToken.set(await user.getIdToken());
          this.emailSignal.set(user.email ?? null);
        } else {
          this.idToken.set(null);
          this.emailSignal.set(null);
        }
        this.readySignal.set(true);
      });
    } catch {
      this.readySignal.set(true);
    }
  }

  private loadFirebaseAppModule(): Promise<any> {
    const url = 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
    return import(/* @vite-ignore */ url);
  }

  private loadFirebaseAuthModule(): Promise<any> {
    const url = 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
    return import(/* @vite-ignore */ url);
  }
}
