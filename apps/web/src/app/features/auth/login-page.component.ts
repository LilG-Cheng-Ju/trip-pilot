import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { APP_VERSION, IS_BETA } from '../../core/config/app-version';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/** Full-bleed split-screen login page with scenic travel photography, Email/Password, and Google Sign-In. */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="login-shell">
      <!-- Left Scenic Travel Visual (Unsplash royalty-free photography) -->
      <section class="visual-pane" aria-hidden="true">
        <div class="visual-overlay">
          <div class="brand-lockup">
            <svg class="logo-svg" viewBox="0 0 24 24" fill="none">
              <path
                d="M3.5 11.2L20.5 3.5L13.2 20.5L10.6 13.4L3.5 11.2Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <path
                d="M10.6 13.4L20.5 3.5"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
            <span class="brand-title">{{ 'app.name' | t }}</span>
            @if (isBeta) {
              <span class="beta-chip">BETA</span>
            }
          </div>

          <div class="visual-copy">
            <h2>
              {{
                i18n.locale() === 'zh-TW'
                  ? '每一趟出發，都有專屬副駕駛。'
                  : 'Every journey deserves a pocket copilot.'
              }}
            </h2>
            <p>{{ 'app.tagline' | t }}</p>
            <div class="visual-tags">
              <span>
                <span class="ms-icon sm">map</span>
                {{ i18n.locale() === 'zh-TW' ? '即時互動地圖' : 'Live Route Map' }}
              </span>
              <span>
                <span class="ms-icon sm">summarize</span>
                {{ i18n.locale() === 'zh-TW' ? '住宿航班摘要' : 'Trip Brief' }}
              </span>
              <span>
                <span class="ms-icon sm">offline_pin</span>
                {{ i18n.locale() === 'zh-TW' ? '離線快取檢視' : 'Offline Cache' }}
              </span>
            </div>
          </div>

          <span class="photo-credit">Photo via Unsplash</span>
        </div>
      </section>

      <!-- Right Auth Form Pane -->
      <section class="form-pane">
        <div class="form-topbar">
          <button type="button" class="lang-btn" (click)="i18n.toggleLocale()">
            <span class="ms-icon sm" aria-hidden="true">translate</span>
            <span>{{ i18n.locale() === 'en' ? '繁體中文' : 'EN' }}</span>
          </button>
        </div>

        <div class="form-card">
          <div class="form-head">
            <h1>
              {{
                authMode() === 'signin'
                  ? i18n.locale() === 'zh-TW'
                    ? '歡迎回來'
                    : 'Welcome back'
                  : i18n.locale() === 'zh-TW'
                    ? '建立帳號'
                    : 'Create account'
              }}
            </h1>
            <p class="head-sub">
              {{
                i18n.locale() === 'zh-TW'
                  ? '登入 Tripilot 同步你的旅程、地圖與花費。'
                  : 'Sign in to sync your itineraries, maps, and expenses.'
              }}
            </p>
          </div>

          @if (session.isFirebaseEnabled()) {
            <div class="mode-tabs" role="tablist">
              <button
                type="button"
                class="mode-tab"
                [class.active]="authMode() === 'signin'"
                (click)="switchMode('signin')"
              >
                {{ i18n.locale() === 'zh-TW' ? '登入' : 'Sign In' }}
              </button>
              <button
                type="button"
                class="mode-tab"
                [class.active]="authMode() === 'signup'"
                (click)="switchMode('signup')"
              >
                {{ i18n.locale() === 'zh-TW' ? '註冊新帳號' : 'Sign Up' }}
              </button>
            </div>

            <form class="email-form" (ngSubmit)="submitEmailAuth()">
              <label class="field">
                <span class="field-label">
                  {{ i18n.locale() === 'zh-TW' ? '電子信箱' : 'Email' }} <em class="req">*</em>
                </span>
                <input
                  type="email"
                  class="input-control"
                  [(ngModel)]="email"
                  name="email"
                  autocomplete="email"
                  placeholder="name@example.com"
                  required
                />
              </label>

              <label class="field">
                <span class="field-label">
                  {{ i18n.locale() === 'zh-TW' ? '密碼' : 'Password' }} <em class="req">*</em>
                </span>
                <input
                  type="password"
                  class="input-control"
                  [(ngModel)]="password"
                  name="password"
                  [autocomplete]="authMode() === 'signin' ? 'current-password' : 'new-password'"
                  [placeholder]="
                    i18n.locale() === 'zh-TW' ? '至少 6 個字元' : 'At least 6 characters'
                  "
                  minlength="6"
                  required
                />
              </label>

              @if (error()) {
                <p class="err">{{ error() }}</p>
              }

              <button type="submit" class="primary-btn" [disabled]="signingIn()">
                @if (signingIn()) {
                  <span class="ms-icon sm spin" aria-hidden="true">progress_activity</span>
                  <span>
                    {{ i18n.locale() === 'zh-TW' ? '處理中...' : 'Please wait...' }}
                  </span>
                } @else {
                  <span>
                    {{
                      authMode() === 'signin'
                        ? i18n.locale() === 'zh-TW'
                          ? '以信箱登入'
                          : 'Sign in with Email'
                        : i18n.locale() === 'zh-TW'
                          ? '建立帳號並登入'
                          : 'Create Account'
                    }}
                  </span>
                }
              </button>
            </form>

            <div class="divider">
              <span>{{ i18n.locale() === 'zh-TW' ? '或' : 'or' }}</span>
            </div>

            <button type="button" class="google-btn" [disabled]="signingIn()" (click)="loginGoogle()">
              <svg class="g-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>
                {{ i18n.locale() === 'zh-TW' ? '使用 Google 帳號繼續' : 'Continue with Google' }}
              </span>
            </button>
          } @else {
            <p class="dev-note">
              {{
                i18n.locale() === 'zh-TW'
                  ? '目前為本機開發模式（未啟用 Firebase 登入）。'
                  : 'Local development mode is active (Firebase Auth disabled).'
              }}
            </p>
            <button type="button" class="primary-btn" (click)="goTrips()">
              {{ 'itinerary.goTrips' | t }}
            </button>
          }

          <div class="version-foot">Tripilot · v{{ appVersion }}</div>
        </div>
      </section>
    </div>
  `,
  styles: `
    .login-shell {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      background: var(--color-bg);
    }
    .visual-pane {
      position: relative;
      min-height: 210px;
      background-color: var(--color-primary);
      background-image: url('https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=80');
      background-size: cover;
      background-position: center;
    }
    .visual-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: var(--space-5);
      background: linear-gradient(
        160deg,
        rgba(27, 42, 74, 0.72) 0%,
        rgba(27, 42, 74, 0.45) 45%,
        rgba(15, 23, 42, 0.85) 100%
      );
      color: #ffffff;
    }
    .brand-lockup {
      display: inline-flex;
      align-items: center;
      gap: 9px;
    }
    .logo-svg {
      width: 26px;
      height: 26px;
      color: var(--color-accent);
    }
    .brand-title {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: 0.03em;
    }
    .beta-chip {
      padding: 2px 6px;
      border-radius: 5px;
      border: 1px solid rgba(200, 155, 91, 0.65);
      background: rgba(200, 155, 91, 0.2);
      color: #f3d7a4;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .visual-copy h2 {
      margin: 0 0 6px;
      font-size: 1.35rem;
      font-weight: 800;
      line-height: 1.3;
    }
    .visual-copy p {
      margin: 0;
      font-size: 0.88rem;
      color: rgba(255, 255, 255, 0.86);
    }
    .visual-tags {
      display: none;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .visual-tags > span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 11px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.14);
      backdrop-filter: blur(6px);
      font-size: 0.78rem;
      font-weight: 600;
    }
    .photo-credit {
      display: none;
      font-size: 0.7rem;
      opacity: 0.6;
    }
    .form-pane {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-5) var(--space-4);
      position: relative;
    }
    .form-topbar {
      position: absolute;
      top: 16px;
      right: 16px;
    }
    .lang-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.76rem;
      font-weight: 700;
      cursor: pointer;
    }
    .form-card {
      width: 100%;
      max-width: 400px;
      padding: var(--space-6) var(--space-5);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-float);
    }
    .form-head {
      margin-bottom: var(--space-4);
    }
    .form-head h1 {
      margin: 0 0 4px;
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--color-primary);
    }
    .head-sub {
      margin: 0;
      font-size: 0.84rem;
      color: var(--color-text-secondary);
    }
    .mode-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 3px;
      margin-bottom: var(--space-4);
      border-radius: 10px;
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
    }
    .mode-tab {
      padding: 7px 10px;
      border: none;
      border-radius: 7px;
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
    }
    .mode-tab.active {
      background: var(--color-surface);
      color: var(--color-primary);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    .email-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-label {
      font-size: 0.74rem;
      font-weight: 700;
      color: var(--color-text-secondary);
    }
    .req {
      color: var(--color-alert);
      font-style: normal;
      font-weight: 700;
    }
    .input-control {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.88rem;
    }
    .primary-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 18px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      margin-top: 2px;
    }
    .primary-btn:disabled,
    .google-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 16px 0;
      color: var(--color-text-muted);
      font-size: 0.76rem;
    }
    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border);
    }
    .google-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 10px 18px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: #ffffff;
      color: var(--color-primary);
      font: inherit;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
    }
    .google-btn:hover {
      border-color: var(--color-primary);
      background: var(--color-bg);
    }
    .g-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .dev-note {
      margin: 0 0 var(--space-3);
      text-align: center;
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
    .err {
      margin: 0;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-alert-soft);
      color: var(--color-alert);
      font-size: 0.78rem;
      font-weight: 600;
    }
    .version-foot {
      margin-top: var(--space-5);
      text-align: center;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }
    .spin {
      animation: login-spin 1s linear infinite;
    }
    @keyframes login-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (min-width: 900px) {
      .login-shell {
        grid-template-columns: 1.15fr 0.85fr;
      }
      .visual-pane {
        min-height: 100dvh;
      }
      .visual-overlay {
        padding: var(--space-6) 44px;
      }
      .visual-copy h2 {
        font-size: 2rem;
      }
      .visual-tags {
        display: flex;
      }
      .photo-credit {
        display: block;
      }
    }
  `,
})
export class LoginPageComponent {
  protected readonly session = inject(AuthSessionService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  protected readonly appVersion = APP_VERSION;
  protected readonly isBeta = IS_BETA;
  protected readonly authMode = signal<'signin' | 'signup'>('signin');
  protected readonly signingIn = signal(false);
  protected readonly error = signal<string | null>(null);

  protected email = '';
  protected password = '';

  protected switchMode(mode: 'signin' | 'signup'): void {
    this.authMode.set(mode);
    this.error.set(null);
  }

  protected async submitEmailAuth(): Promise<void> {
    if (!this.email.trim() || this.password.length < 6) {
      return;
    }
    this.signingIn.set(true);
    this.error.set(null);
    try {
      if (this.authMode() === 'signin') {
        await this.session.signInWithEmail(this.email, this.password);
      } else {
        await this.session.signUpWithEmail(this.email, this.password);
      }
      await this.router.navigate(['/trips']);
    } catch (err) {
      this.error.set(this.mapAuthError(err));
    } finally {
      this.signingIn.set(false);
    }
  }

  protected async loginGoogle(): Promise<void> {
    this.signingIn.set(true);
    this.error.set(null);
    try {
      await this.session.signInWithGoogle();
      await this.router.navigate(['/trips']);
    } catch (err) {
      this.error.set(this.mapAuthError(err));
    } finally {
      this.signingIn.set(false);
    }
  }

  protected goTrips(): void {
    void this.router.navigate(['/trips']);
  }

  private mapAuthError(err: unknown): string {
    const code = (err as { code?: string } | null)?.code ?? '';
    const zh = this.i18n.locale() === 'zh-TW';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
      return zh ? '信箱或密碼不正確，請再確認。' : 'Invalid email or password.';
    }
    if (code.includes('email-already-in-use')) {
      return zh ? '此信箱已經註冊過，請直接切換至「登入」。' : 'This email is already registered. Please sign in.';
    }
    if (code.includes('weak-password')) {
      return zh ? '密碼強度不足，請輸入至少 6 個字元。' : 'Password must be at least 6 characters.';
    }
    if (code.includes('popup-closed-by-user')) {
      return zh ? '已取消 Google 登入視窗。' : 'Google sign-in popup was closed.';
    }
    return zh ? '登入失敗，請稍後再試。' : 'Sign-in failed. Please try again.';
  }
}
