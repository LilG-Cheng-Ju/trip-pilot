import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { getApiBaseUrl } from '../../core/config/runtime-config';
import { SUPPORTED_CURRENCIES } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppCountryPickerComponent } from '../../shared/country-picker.component';
import { AuthStore } from '../../state/auth.store';

/** User travel preferences (searchable country & currency dropdowns) and PAT manager. */
@Component({
  selector: 'app-profile-page',
  imports: [FormsModule, TranslatePipe, AppCountryPickerComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <h2 class="page-title">{{ 'profile.title' | t }}</h2>
        @if (session.isFirebaseEnabled()) {
          <button type="button" class="pill-btn danger" (click)="signOut()">
            {{ i18n.locale() === 'zh-TW' ? '登出' : 'Sign Out' }}
          </button>
        }
      </div>

      <section class="panel">
        <div class="panel-head">
          <h3>{{ 'profile.preferences' | t }}</h3>
          <button type="button" class="pill-btn" (click)="i18n.toggleLocale()">
            {{ 'common.language' | t }}: {{ i18n.locale() === 'en' ? 'English' : '繁體中文' }}
          </button>
        </div>

        <form class="pref-form" (ngSubmit)="savePreferences()">
          <div class="field">
            <span>{{ 'profile.homeCountry' | t }}</span>
            <app-country-picker
              [selectedCodes]="[homeCountry]"
              [multiple]="false"
              (selectionChange)="homeCountry = $event[0] || homeCountry"
            />
            <small class="field-hint">{{ 'profile.homeCountryHint' | t }}</small>
          </div>

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

        <form class="token-form" (ngSubmit)="generateToken()" novalidate>
          <input
            type="text"
            [class.has-error]="tokenNameError()"
            [(ngModel)]="newTokenName"
            name="newTokenName"
            (ngModelChange)="tokenNameError.set(false)"
            [placeholder]="'profile.tokenNamePlaceholder' | t"
          />
          <button type="submit" class="btn-primary" [disabled]="generatingToken()">
            {{ 'profile.tokenGenerate' | t }}
          </button>
        </form>
        @if (tokenNameError()) {
          <p class="err-msg">{{ 'profile.tokenNameRequired' | t }}</p>
        }
        @if (tokenApiError()) {
          <p class="err-msg">{{ tokenApiError() }}</p>
        }

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
          @for (tok of activeTokens(); track tok.id) {
            <div class="token-row">
              <div>
                <strong>{{ tok.name }}</strong>
                <p class="token-meta tabular-nums">
                  {{ tok.token_prefix }}… · {{ tok.scopes.join(', ') }}
                </p>
              </div>
              <button type="button" class="pill-btn danger" (click)="authStore.revokeToken(tok.id)">
                {{ 'share.revoke' | t }}
              </button>
            </div>
          }
        </div>

        @if (hasActiveToken()) {
          <div class="mcp-divider"></div>
          <div class="mcp-block">
            <h4 class="mcp-subhead">{{ 'profile.aiConnectTitle' | t }}</h4>
            <div class="connect-row">
              <div class="connect-info">
                <span class="connect-label">{{ 'profile.aiMcpLabel' | t }}</span>
                <code class="connect-url">{{ mcpEndpoint }}</code>
              </div>
              <button
                type="button"
                class="pill-btn"
                (click)="copySnippet('mcp', mcpEndpoint)"
              >
                {{ copiedKey() === 'mcp' ? ('common.copied' | t) : ('common.copy' | t) }}
              </button>
            </div>
            <button
              type="button"
              class="btn-secondary"
              (click)="copySnippet('prompt', quickStartPrompt())"
            >
              <span class="ms-icon sm" aria-hidden="true">content_copy</span>
              <span>
                {{ copiedKey() === 'prompt' ? ('common.copied' | t) : ('profile.aiCopyPrompt' | t) }}
              </span>
            </button>
          </div>
        }
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
    .page-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
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
      border-color: rgba(217, 107, 82, 0.45);
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }
    .pill-btn.danger:hover {
      background: var(--color-alert);
      border-color: var(--color-alert);
      color: #ffffff;
    }
    .token-form input.has-error {
      border-color: var(--color-alert);
      background: var(--color-alert-soft);
    }
    .err-msg {
      margin: -8px 0 var(--space-3);
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-alert);
    }
    .token-form {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: var(--space-4);
    }
    .token-form input {
      flex: 1 1 180px;
      min-width: 0;
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
    .mcp-divider {
      height: 1px;
      background: var(--color-border);
      margin: var(--space-4) 0;
    }
    .mcp-block {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    .mcp-subhead {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-primary);
    }
    .connect-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
    }
    .connect-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .connect-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--color-text-secondary);
    }
    .connect-url {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      color: var(--color-primary);
      word-break: break-all;
    }
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-pill);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-secondary:hover {
      background: var(--color-primary);
      color: #ffffff;
    }
  `,
})
export class ProfilePageComponent implements OnInit {
  protected readonly authStore = inject(AuthStore);
  protected readonly session = inject(AuthSessionService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  protected readonly currencies = SUPPORTED_CURRENCIES;

  protected homeCountry = 'TW';
  protected homeCurrency = 'TWD';
  protected newTokenName = '';
  protected readonly savedNotice = signal(false);
  protected readonly copied = signal(false);
  protected readonly copiedKey = signal<string | null>(null);
  protected readonly tokenNameError = signal(false);
  protected readonly tokenApiError = signal<string | null>(null);
  protected readonly generatingToken = signal(false);

  private readonly apiOrigin =
    getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  protected readonly mcpEndpoint = `${this.apiOrigin}/mcp`;
  protected readonly llmsTxtUrl = `${this.apiOrigin}/llms.txt`;

  protected readonly activeTokens = computed(() =>
    this.authStore.tokens().filter((tok) => !tok.revoked_at),
  );

  protected readonly hasActiveToken = computed(() => this.activeTokens().length > 0);

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
    this.tokenApiError.set(null);
    if (!this.newTokenName.trim()) {
      this.tokenNameError.set(true);
      return;
    }
    this.generatingToken.set(true);
    try {
      await this.authStore.createToken(this.newTokenName.trim());
      this.newTokenName = '';
    } catch {
      this.tokenApiError.set(
        this.i18n.locale() === 'zh-TW'
          ? '產生 Token 失敗，請確認後端服務正常。'
          : 'Failed to generate token. Please check the API server.',
      );
    } finally {
      this.generatingToken.set(false);
    }
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

  protected quickStartPrompt(): string {
    return (
      `Please read the Tripilot API & MCP guide at ${this.llmsTxtUrl} ` +
      `(Remote MCP endpoint: ${this.mcpEndpoint}). ` +
      `I will provide my Personal API Token (tp_pat_...) so you can help me plan and update my trips.`
    );
  }

  protected async copySnippet(key: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedKey.set(key);
      setTimeout(() => {
        if (this.copiedKey() === key) {
          this.copiedKey.set(null);
        }
      }, 1800);
    } catch {
      // Clipboard may be unavailable in non-HTTPS contexts.
    }
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/login']);
  }
}
