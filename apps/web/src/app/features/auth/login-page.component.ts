import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { APP_VERSION, IS_BETA } from '../../core/config/app-version';
import { MIN_PASSWORD_LENGTH } from '../../core/constants/app-limits';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { readInputValue } from '../../core/utils/form-events.utils';

/** Split-screen editorial login page with cartographic vector artwork, Email/Password, and Google Sign-In. */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="login-shell">
      <!-- Left Cartographic Editorial Artwork (zero external image dependencies) -->
      <section class="visual-pane" aria-hidden="true">
        <svg
          class="carto-backdrop"
          viewBox="0 0 800 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <!-- Fine meridian and latitude map grid -->
          <g stroke="rgba(248, 247, 244, 0.05)" stroke-width="1">
            <line x1="140" y1="0" x2="140" y2="900" />
            <line x1="320" y1="0" x2="320" y2="900" />
            <line x1="500" y1="0" x2="500" y2="900" />
            <line x1="680" y1="0" x2="680" y2="900" />
            <line x1="0" y1="180" x2="800" y2="180" />
            <line x1="0" y1="380" x2="800" y2="380" />
            <line x1="0" y1="580" x2="800" y2="580" />
            <line x1="0" y1="780" x2="800" y2="780" />
          </g>

          <!-- Organic topographic contours -->
          <g stroke="rgba(196, 146, 76, 0.14)" stroke-width="1.15">
            <path d="M -80 280 C 120 210, 260 320, 440 240 C 600 170, 710 250, 880 180" />
            <path d="M -60 340 C 140 270, 290 385, 470 305 C 625 235, 730 315, 890 250" />
            <path d="M -40 410 C 160 345, 330 455, 515 375 C 660 310, 755 385, 900 325" />
            <circle cx="585" cy="285" r="145" stroke-opacity="0.55" />
            <circle cx="585" cy="285" r="220" stroke-opacity="0.35" />
          </g>

          <!-- Signature Tripilot Bezier route legs (solid flight + schematic transit arc) -->
          <path
            d="M 118 690 C 210 530, 345 480, 470 430"
            stroke="#C4924C"
            stroke-width="2"
            stroke-opacity="0.72"
            stroke-linecap="round"
          />
          <path
            d="M 470 430 C 555 395, 615 310, 678 196"
            stroke="#C4924C"
            stroke-width="1.8"
            stroke-dasharray="5 7"
            stroke-opacity="0.62"
            stroke-linecap="round"
          />

          <!-- Route waypoints -->
          <circle cx="118" cy="690" r="8" fill="#162136" stroke="#C4924C" stroke-width="2.5" />
          <circle cx="470" cy="430" r="5.5" fill="#C4924C" />
          <circle cx="678" cy="196" r="6" fill="#F8F7F4" stroke="#C4924C" stroke-width="2.5" />
        </svg>

        <div class="visual-overlay">
          <div class="brand-lockup">
            <svg class="logo-svg" viewBox="104 98 302 312" fill="none">
              <circle cx="134" cy="382" r="19" stroke="#C4924C" stroke-width="12" />
              <path
                d="M 127 363 C 134 313, 168 285, 224 280 C 174 295, 152 323, 145 365 Z"
                fill="#C4924C"
              />
              <polygon points="229,278 276,267 254,248" fill="#9F7236" />
              <polygon points="396,108 224,226 229,278 258,252" fill="#C4924C" />
              <polygon points="396,108 172,190 224,226" fill="#F8F7F4" />
              <polygon points="396,108 258,252 310,308" fill="#F8F7F4" />
            </svg>
            <span class="brand-title">{{ 'app.name' | t }}</span>
            @if (isBeta) {
              <span class="beta-chip">BETA</span>
            }
          </div>

          <div class="visual-copy">
            <h2 class="hero-headline font-display">{{ 'login.heroHeadline' | t }}</h2>
            <p class="hero-tagline">{{ 'app.tagline' | t }}</p>

            <ol class="editorial-features">
              <li>
                <span class="feat-idx font-mono tabular-nums">01</span>
                <span>{{ 'login.featureMap' | t }}</span>
              </li>
              <li>
                <span class="feat-idx font-mono tabular-nums">02</span>
                <span>{{ 'login.featureBrief' | t }}</span>
              </li>
              <li>
                <span class="feat-idx font-mono tabular-nums">03</span>
                <span>{{ 'login.featureOffline' | t }}</span>
              </li>
            </ol>
          </div>
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
            <h1 class="font-display">
              {{ (authMode() === 'signin' ? 'login.welcomeBack' : 'login.createAccount') | t }}
            </h1>
            <p class="head-sub">
              {{ 'login.subtitle' | t }}
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
                {{ 'login.tabSignIn' | t }}
              </button>
              <button
                type="button"
                class="mode-tab"
                [class.active]="authMode() === 'signup'"
                (click)="switchMode('signup')"
              >
                {{ 'login.tabSignUp' | t }}
              </button>
            </div>

            <form class="email-form" (submit)="$event.preventDefault(); submitEmailAuth()">
              <label class="field">
                <span class="field-label">
                  {{ 'login.emailLabel' | t }} <em class="req">*</em>
                </span>
                <input
                  type="email"
                  class="input-control"
                  [value]="email()"
                  (input)="email.set(readInputValue($event))"
                  name="email"
                  autocomplete="email"
                  placeholder="name@example.com"
                  required
                />
              </label>

              <label class="field">
                <span class="field-label">
                  {{ 'login.passwordLabel' | t }} <em class="req">*</em>
                </span>
                <input
                  type="password"
                  class="input-control"
                  [value]="password()"
                  (input)="password.set(readInputValue($event))"
                  name="password"
                  [autocomplete]="authMode() === 'signin' ? 'current-password' : 'new-password'"
                  [placeholder]="'login.passwordPlaceholder' | t"
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
                  <span>{{ 'login.processing' | t }}</span>
                } @else {
                  <span>
                    {{ (authMode() === 'signin' ? 'login.signInEmail' : 'login.signUpEmail') | t }}
                  </span>
                }
              </button>
            </form>

            <div class="divider">
              <span>{{ 'login.or' | t }}</span>
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
              <span>{{ 'login.continueGoogle' | t }}</span>
            </button>
          } @else {
            <p class="dev-note">{{ 'login.devNotice' | t }}</p>
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
      overflow: hidden;
      min-height: 204px;
      background: var(--color-primary);
    }
    .carto-backdrop {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .visual-overlay {
      position: relative;
      z-index: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: var(--space-5);
      padding: var(--space-5);
      color: var(--color-text-on-primary);
    }
    .brand-lockup {
      display: inline-flex;
      align-items: center;
      gap: 9px;
    }
    .logo-svg {
      width: 26px;
      height: 26px;
      flex-shrink: 0;
    }
    .brand-title {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .beta-chip {
      padding: 2px 6px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-accent-border);
      background: var(--color-accent-tint);
      color: var(--color-accent-light);
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 0.08em;
    }
    .hero-headline {
      margin: 0 0 8px;
      font-size: 1.48rem;
      font-weight: 500;
      line-height: 1.26;
      color: var(--color-text-on-primary);
    }
    .hero-tagline {
      margin: 0;
      font-size: 0.88rem;
      color: rgba(248, 247, 244, 0.78);
    }
    .editorial-features {
      display: none;
      flex-direction: column;
      margin: 26px 0 0;
      padding: 0;
      list-style: none;
      max-width: 380px;
      border-top: 1px solid rgba(248, 247, 244, 0.14);
    }
    .editorial-features li {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(248, 247, 244, 0.14);
      font-size: 0.82rem;
      font-weight: 500;
      color: rgba(248, 247, 244, 0.88);
    }
    .feat-idx {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--color-accent);
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
      font-weight: 600;
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
      font-weight: 600;
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
      border-radius: var(--radius-sm);
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
    }
    .mode-tab {
      padding: 7px 10px;
      border: none;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
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
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .req {
      color: var(--color-alert);
      font-style: normal;
      font-weight: 600;
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
      color: var(--color-text-on-primary);
      font: inherit;
      font-size: 0.9rem;
      font-weight: 600;
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
      font-weight: 600;
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
      .hero-headline {
        font-size: 2.15rem;
      }
      .editorial-features {
        display: flex;
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
  protected readonly readInputValue = readInputValue;

  protected readonly email = signal('');
  protected readonly password = signal('');

  protected switchMode(mode: 'signin' | 'signup'): void {
    this.authMode.set(mode);
    this.error.set(null);
  }

  protected async submitEmailAuth(): Promise<void> {
    const email = this.email();
    const password = this.password();
    if (!email.trim() || password.length < MIN_PASSWORD_LENGTH) {
      return;
    }
    this.signingIn.set(true);
    this.error.set(null);
    try {
      if (this.authMode() === 'signin') {
        await this.session.signInWithEmail(email, password);
      } else {
        await this.session.signUpWithEmail(email, password);
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
    if (
      code.includes('invalid-credential') ||
      code.includes('wrong-password') ||
      code.includes('user-not-found')
    ) {
      return this.i18n.t('login.errInvalid');
    }
    if (code.includes('email-already-in-use')) {
      return this.i18n.t('login.errEmailInUse');
    }
    if (code.includes('weak-password')) {
      return this.i18n.t('login.errWeakPassword');
    }
    if (code.includes('popup-closed-by-user')) {
      return this.i18n.t('login.errPopupClosed');
    }
    return this.i18n.t('login.errGeneric');
  }
}
