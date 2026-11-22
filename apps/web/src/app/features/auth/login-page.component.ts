import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/** Clean Google Sign-In screen used when cloud Firebase Auth is configured. */
@Component({
  selector: 'app-login-page',
  imports: [TranslatePipe],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="logo-row">
          <svg class="logo-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
          <h1>{{ 'app.name' | t }}</h1>
        </div>
        <p class="sub">{{ 'app.tagline' | t }}</p>

        @if (session.isFirebaseEnabled()) {
          <button type="button" class="google-btn" [disabled]="signingIn()" (click)="login()">
            <span class="ms-icon sm" aria-hidden="true">login</span>
            <span>{{ i18n.locale() === 'zh-TW' ? '使用 Google 帳號登入' : 'Continue with Google' }}</span>
          </button>
          @if (error()) {
            <p class="err">{{ error() }}</p>
          }
        } @else {
          <p class="dev-note">
            {{ i18n.locale() === 'zh-TW' ? '目前為本機開發模式（無需登入）。' : 'Local development mode is active.' }}
          </p>
          <button type="button" class="google-btn" (click)="goTrips()">
            {{ 'itinerary.goTrips' | t }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .login-wrap {
      min-height: calc(100dvh - 56px);
      display: grid;
      place-items: center;
      padding: var(--space-4);
    }
    .login-card {
      width: 100%;
      max-width: 380px;
      padding: var(--space-6);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-float);
      text-align: center;
    }
    .logo-row {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--color-primary);
      margin-bottom: 6px;
    }
    .logo-svg {
      width: 28px;
      height: 28px;
      color: var(--color-accent);
    }
    .logo-row h1 {
      margin: 0;
      font-size: 1.5rem;
    }
    .sub {
      margin: 0 0 var(--space-5);
      color: var(--color-text-secondary);
      font-size: 0.9rem;
    }
    .google-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 18px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
    }
    .dev-note {
      margin: 0 0 var(--space-4);
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }
    .err {
      margin: var(--space-3) 0 0;
      font-size: 0.8125rem;
      color: var(--color-alert);
    }
  `,
})
export class LoginPageComponent {
  protected readonly session = inject(AuthSessionService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  protected readonly signingIn = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async login(): Promise<void> {
    this.signingIn.set(true);
    this.error.set(null);
    try {
      await this.session.signInWithGoogle();
      await this.router.navigate(['/trips']);
    } catch {
      this.error.set(
        this.i18n.locale() === 'zh-TW'
          ? '登入失敗，請稍後再試。'
          : 'Sign-in failed. Please try again.',
      );
    } finally {
      this.signingIn.set(false);
    }
  }

  protected goTrips(): void {
    void this.router.navigate(['/trips']);
  }
}
