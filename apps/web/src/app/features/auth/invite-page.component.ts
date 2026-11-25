import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { SessionCleanupService } from '../../core/auth/session-cleanup.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { readInputValue } from '../../core/utils/form-events.utils';
import { extractApiErrorMessage } from '../../core/utils/http-error.utils';
import { AuthStore } from '../../state/auth.store';

/** Invite-code gate shown to authenticated USER accounts awaiting invite redemption. */
@Component({
  selector: 'app-invite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="invite-shell">
      <header class="invite-topbar">
        <div class="brand-lockup">
          <svg class="brand-svg" viewBox="104 98 302 312" fill="none" aria-hidden="true">
            <circle cx="134" cy="382" r="19" stroke="#C4924C" stroke-width="12" />
            <path
              d="M 127 363 C 134 313, 168 285, 224 280 C 174 295, 152 323, 145 365 Z"
              fill="#C4924C"
            />
            <polygon points="229,278 276,267 254,248" fill="#9F7236" />
            <polygon points="396,108 224,226 229,278 258,252" fill="#C4924C" />
            <polygon points="396,108 172,190 224,226" fill="currentColor" />
            <polygon points="396,108 258,252 310,308" fill="currentColor" />
          </svg>
          <span class="brand-name">{{ 'app.name' | t }}</span>
        </div>

        <div class="topbar-actions">
          <button type="button" class="pill-btn" (click)="i18n.toggleLocale()">
            {{ i18n.locale() === 'en' ? '繁體中文' : 'EN' }}
          </button>
          @if (session.isFirebaseEnabled()) {
            <button type="button" class="pill-btn danger" (click)="signOut()">
              {{ 'account.signOut' | t }}
            </button>
          }
        </div>
      </header>

      <main class="invite-main">
        <section class="invite-card">
          @if (authStore.suspended()) {
            <div class="status-icon alert" aria-hidden="true">
              <span class="ms-icon lg">block</span>
            </div>
            <h2 class="card-title font-display">{{ 'invite.suspendedTitle' | t }}</h2>
            <p class="card-copy">{{ 'invite.suspendedCopy' | t }}</p>
          } @else {
            <div class="status-icon primary" aria-hidden="true">
              <span class="ms-icon lg">vpn_key</span>
            </div>
            <h2 class="card-title font-display">{{ 'invite.title' | t }}</h2>
            <p class="card-copy">{{ 'invite.subtitle' | t }}</p>

            @if (error(); as errMsg) {
              <div class="error-banner" role="alert">
                <span>{{ errMsg }}</span>
              </div>
            }

            <form
              class="invite-form"
              (submit)="$event.preventDefault(); submitInviteCode()"
            >
              <label class="field">
                <span>{{ 'invite.codeLabel' | t }}</span>
                <input
                  type="text"
                  name="inviteCode"
                  autocomplete="off"
                  spellcheck="false"
                  class="code-input"
                  [placeholder]="'invite.codePlaceholder' | t"
                  [value]="code()"
                  (input)="onCodeInput($event)"
                />
              </label>

              <button
                type="submit"
                class="btn-primary submit-btn"
                [disabled]="submitting() || code().trim().length < 4"
              >
                {{ submitting() ? ('invite.submitting' | t) : ('invite.submit' | t) }}
              </button>
            </form>
          }

          @if (displayEmail(); as email) {
            <p class="signed-email">{{ 'invite.signedInAs' | t:{ email } }}</p>
          }
        </section>
      </main>
    </div>
  `,
  styles: `
    .invite-shell {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--color-bg);
    }

    .invite-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }

    .brand-lockup {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--color-primary);
    }

    .brand-svg {
      width: 24px;
      height: 24px;
    }

    .brand-name {
      font-family: var(--font-display);
      font-size: 1.125rem;
      font-weight: 700;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .invite-main {
      flex: 1;
      display: grid;
      place-items: center;
      padding: var(--space-6) var(--space-4);
    }

    .invite-card {
      width: 100%;
      max-width: 440px;
      padding: var(--space-6);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-card);
    }

    .status-icon {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      margin-bottom: var(--space-4);
    }

    .status-icon.primary {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }

    .status-icon.alert {
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }

    .card-title {
      margin: 0 0 8px;
      font-size: 1.4rem;
      color: var(--color-primary);
    }

    .card-copy {
      margin: 0 0 var(--space-4);
      font-size: 0.9rem;
      line-height: 1.55;
      color: var(--color-text-secondary);
    }

    .invite-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .code-input {
      font-family: var(--font-mono);
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .submit-btn {
      width: 100%;
      padding: 11px 18px;
    }

    .signed-email {
      margin: var(--space-4) 0 0;
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-border);
      font-size: 0.78rem;
      color: var(--color-text-muted);
      word-break: break-all;
    }
  `,
})
export class InvitePageComponent {
  protected readonly authStore = inject(AuthStore);
  protected readonly session = inject(AuthSessionService);
  protected readonly i18n = inject(I18nService);
  private readonly sessionCleanup = inject(SessionCleanupService);
  private readonly router = inject(Router);

  protected readonly code = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected displayEmail(): string | null {
    return this.session.userEmail() || this.authStore.profile()?.email || null;
  }

  protected onCodeInput(event: Event): void {
    this.code.set(readInputValue(event).toUpperCase());
    if (this.error()) {
      this.error.set(null);
    }
  }

  protected async submitInviteCode(): Promise<void> {
    const trimmed = this.code().trim();
    if (trimmed.length < 4 || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.authStore.redeemInviteCode(trimmed);
      await this.router.navigate(['/trips']);
    } catch (err) {
      this.error.set(extractApiErrorMessage(err, 'Invalid invite code'));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.sessionCleanup.signOutAndRedirect();
  }
}
