import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  SUPPORTED_COUNTRIES,
  SUPPORTED_CURRENCIES,
} from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AuthStore } from '../../state/auth.store';

/** User travel preferences (dropdowns), bilingual switcher, and PAT manager. */
@Component({
  selector: 'app-profile-page',
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="page">
      <h2 class="page-title">{{ 'profile.title' | t }}</h2>

      <section class="panel">
        <div class="panel-head">
          <h3>{{ 'profile.preferences' | t }}</h3>
          <button type="button" class="pill-btn" (click)="i18n.toggleLocale()">
            {{ 'common.language' | t }}: {{ i18n.locale() === 'en' ? 'English' : '繁體中文' }}
          </button>
        </div>

        <form class="pref-form" (ngSubmit)="savePreferences()">
          <label class="field">
            <span>{{ 'profile.homeCountry' | t }}</span>
            <select [(ngModel)]="homeCountry" name="homeCountry">
              @for (c of countries; track c.code) {
                <option [value]="c.code">
                  {{ i18n.locale() === 'zh-TW' ? c.nameZh : c.nameEn }} ({{ c.code }})
                </option>
              }
            </select>
            <small class="field-hint">{{ 'profile.homeCountryHint' | t }}</small>
          </label>

          <label class="field">
            <span>{{ 'profile.homeCurrency' | t }}</span>
            <select [(ngModel)]="homeCurrency" name="homeCurrency">
              @for (cur of currencies; track cur.code) {
                <option [value]="cur.code">
                  {{ i18n.locale() === 'zh-TW' ? cur.labelZh : cur.labelEn }}
                </option>
              }
            </select>
          </label>

          <div class="pref-actions">
            <button type="submit" class="btn-primary">{{ 'common.save' | t }}</button>
            @if (savedNotice()) {
              <span class="saved-badge">{{ 'profile.saved' | t }}</span>
            }
          </div>
        </form>
      </section>

      <section class="panel">
        <h3>{{ 'profile.tokensTitle' | t }}</h3>
        <p class="hint">{{ 'profile.tokensHint' | t }}</p>

        <form class="token-form" (ngSubmit)="generateToken()">
          <input
            type="text"
            [(ngModel)]="newTokenName"
            name="newTokenName"
            [placeholder]="'profile.tokenNamePlaceholder' | t"
            required
          />
          <button type="submit" class="btn-primary">{{ 'profile.tokenGenerate' | t }}</button>
        </form>

        @if (authStore.lastCreatedToken(); as created) {
          <div class="created-box">
            <p class="warn-text">{{ 'profile.tokenOnceWarning' | t }}</p>
            <div class="token-secret-row">
              <code>{{ created.plaintext_token }}</code>
              <button type="button" class="pill-btn" (click)="copyToken(created.plaintext_token)">
                {{ copied() ? ('common.copied' | t) : ('common.copy' | t) }}
              </button>
            </div>
          </div>
        }

        <div class="token-list">
          @for (tok of authStore.tokens(); track tok.id) {
            <div class="token-row" [class.revoked]="tok.revoked_at">
              <div>
                <strong>{{ tok.name }}</strong>
                <p class="token-meta tabular-nums">
                  {{ tok.token_prefix }}… · {{ tok.scopes.join(', ') }}
                </p>
              </div>
              @if (tok.revoked_at) {
                <span class="revoked-tag">{{ 'profile.tokenRevoked' | t }}</span>
              } @else {
                <button type="button" class="pill-btn danger" (click)="authStore.revokeToken(tok.id)">
                  {{ 'share.revoke' | t }}
                </button>
              }
            </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .page {
      max-width: 720px;
      margin: 0 auto;
      padding: var(--space-5) var(--space-4) calc(var(--nav-bottom-height) + var(--space-6));
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .page-title {
      margin: 0;
      font-size: 1.375rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .panel {
      padding: var(--space-5);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
    .panel h3 {
      margin: 0 0 8px;
      font-size: 1rem;
      color: var(--color-primary);
    }
    .hint {
      margin: 0 0 var(--space-4);
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }
    .pref-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .field select,
    .token-form input {
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
    }
    .field-hint {
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--color-text-muted);
    }
    .pref-actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .saved-badge {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--item-spot);
    }
    .btn-primary {
      padding: 10px 18px;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: #ffffff;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .pill-btn {
      padding: 7px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-bg);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .pill-btn.danger {
      color: var(--color-alert);
    }
    .token-form {
      display: flex;
      gap: 8px;
      margin-bottom: var(--space-4);
    }
    .token-form input {
      flex: 1;
    }
    .created-box {
      padding: var(--space-3);
      margin-bottom: var(--space-4);
      border-radius: var(--radius-sm);
      background: var(--color-accent-soft);
      border: 1px solid var(--color-accent);
    }
    .warn-text {
      margin: 0 0 6px;
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .token-secret-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .token-secret-row code {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      word-break: break-all;
    }
    .token-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .token-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: var(--color-bg);
    }
    .token-row.revoked {
      opacity: 0.55;
    }
    .token-meta {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    .revoked-tag {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-muted);
    }
  `,
})
export class ProfilePageComponent implements OnInit {
  protected readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(I18nService);
  protected readonly countries = SUPPORTED_COUNTRIES;
  protected readonly currencies = SUPPORTED_CURRENCIES;

  protected homeCountry = 'TW';
  protected homeCurrency = 'TWD';
  protected newTokenName = '';
  protected readonly savedNotice = signal(false);
  protected readonly copied = signal(false);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.authStore.loadProfile(), this.authStore.loadTokens()]);
    const profile = this.authStore.profile();
    if (profile) {
      this.homeCountry = profile.home_country_code;
      this.homeCurrency = profile.home_currency;
    }
  }

  protected async savePreferences(): Promise<void> {
    await this.authStore.updateProfile({
      home_country_code: this.homeCountry,
      home_currency: this.homeCurrency,
    });
    this.savedNotice.set(true);
    setTimeout(() => this.savedNotice.set(false), 2000);
  }

  protected async generateToken(): Promise<void> {
    if (!this.newTokenName.trim()) return;
    await this.authStore.createToken(this.newTokenName.trim());
    this.newTokenName = '';
  }

  protected async copyToken(plaintext: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(plaintext);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      // Clipboard may be unavailable in non-HTTPS contexts.
    }
  }
}
