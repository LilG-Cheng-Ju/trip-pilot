import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { APP_VERSION, IS_BETA } from '../../core/config/app-version';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/** Branded Google Sign-In screen with Cloud Run cold-start friendly feedback. */
@Component({
  selector: 'app-login-page',
  imports: [TranslatePipe],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="hero-band">
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
            @if (isBeta) {
              <span class="beta-chip">BETA</span>
            }
          </div>
          <p class="sub">{{ 'app.tagline' | t }}</p>
        </div>

        <div class="card-body">
          <ul class="feature-list">
            <li>
              <span class="ms-icon sm feat-ico" aria-hidden="true">map</span>
              <span>
                {{
                  i18n.locale() === 'zh-TW'
                    ? '每日行程與互動地圖即時聯動'
                    : 'Day-by-day timeline synced with live map'
                }}
              </span>
            </li>
            <li>
              <span class="ms-icon sm feat-ico" aria-hidden="true">summarize</span>
              <span>
                {{
                  i18n.locale() === 'zh-TW'
                    ? '自動整理住宿、航班、附件與花費摘要'
                    : 'Auto-organized stays, flights, links & spend'
                }}
              </span>
            </li>
            <li>
              <span class="ms-icon sm feat-ico" aria-hidden="true">offline_pin</span>
              <span>
                {{
                  i18n.locale() === 'zh-TW'
                    ? '本機離線快取，出國無網路也能查行程'
                    : 'Offline read-only cache for zero-signal travel'
                }}
              </span>
            </li>
          </ul>

          @if (session.isFirebaseEnabled()) {
            <button type="button" class="google-btn" [disabled]="signingIn()" (click)="login()">
              @if (signingIn()) {
                <span class="ms-icon sm spin" aria-hidden="true">progress_activity</span>
                <span>
                  {{ i18n.locale() === 'zh-TW' ? '登入連線中...' : 'Signing in...' }}
                </span>
              } @else {
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
                  {{ i18n.locale() === 'zh-TW' ? '使用 Google 帳號登入' : 'Continue with Google' }}
                </span>
              }
            </button>
            @if (error()) {
              <p class="err">{{ error() }}</p>
            }
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

          <div class="version-foot">v{{ appVersion }}</div>
        </div>
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
      max-width: 400px;
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-float);
      overflow: hidden;
    }
    .hero-band {
      padding: var(--space-6) var(--space-5) var(--space-5);
      background: var(--color-primary);
      color: #ffffff;
      text-align: center;
    }
    .logo-row {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 6px;
    }
    .logo-svg {
      width: 26px;
      height: 26px;
      color: var(--color-accent);
    }
    .logo-row h1 {
      margin: 0;
      font-size: 1.5rem;
      letter-spacing: 0.02em;
    }
    .beta-chip {
      padding: 2px 6px;
      border-radius: 5px;
      border: 1px solid rgba(200, 155, 91, 0.55);
      background: rgba(200, 155, 91, 0.18);
      color: #f3d7a4;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .sub {
      margin: 0;
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.88rem;
    }
    .card-body {
      padding: var(--space-5);
    }
    .feature-list {
      list-style: none;
      margin: 0 0 var(--space-5);
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .feature-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.84rem;
      color: var(--color-text-secondary);
    }
    .feat-ico {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
    .google-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 11px 18px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: #ffffff;
      color: var(--color-primary);
      font: inherit;
      font-size: 0.92rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: var(--shadow-card);
    }
    .google-btn:hover {
      border-color: var(--color-primary);
      background: var(--color-bg);
    }
    .google-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .g-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .primary-btn {
      width: 100%;
      padding: 11px 18px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.92rem;
      font-weight: 700;
      cursor: pointer;
    }
    .dev-note {
      margin: 0 0 var(--space-3);
      text-align: center;
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
    .err {
      margin: var(--space-3) 0 0;
      text-align: center;
      font-size: 0.8rem;
      color: var(--color-alert);
    }
    .version-foot {
      margin-top: var(--space-4);
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
  `,
})
export class LoginPageComponent {
  protected readonly session = inject(AuthSessionService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  protected readonly appVersion = APP_VERSION;
  protected readonly isBeta = IS_BETA;
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
