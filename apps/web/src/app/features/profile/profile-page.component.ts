import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  OnInit,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { SessionCleanupService } from '../../core/auth/session-cleanup.service';
import { getApiBaseUrl } from '../../core/config/runtime-config';
import {
  SAVE_NOTICE_DURATION_MS,
  SHARE_COPY_FEEDBACK_DURATION_MS,
} from '../../core/constants/app-limits';
import { SUPPORTED_CURRENCIES } from '../../core/constants/travel-options';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { readInputValue } from '../../core/utils/form-events.utils';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { AppCountryPickerComponent } from '../../shared/country-picker.component';
import { AuthStore } from '../../state/auth.store';

/** User travel preferences (searchable country & currency dropdowns) and PAT manager. */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    MatFormFieldModule,
    MatSelectModule,
    AppCountryPickerComponent,
    AppConfirmModalComponent,
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <h2 class="page-title font-display">{{ 'profile.title' | t }}</h2>
        @if (session.isFirebaseEnabled()) {
          <button type="button" class="pill-btn danger" (click)="signOut()">
            {{ 'profile.signOut' | t }}
          </button>
        }
      </div>

      @if (authStore.error(); as err) {
        <div class="error-banner" role="alert">
          <span>{{ err }}</span>
          <button
            type="button"
            class="error-dismiss"
            [attr.aria-label]="'common.close' | t"
            (click)="authStore.clearError()"
          >
            <span class="ms-icon sm" aria-hidden="true">close</span>
          </button>
        </div>
      }

      <section class="panel">
        <div class="panel-head">
          <h3>{{ 'profile.preferences' | t }}</h3>
          <button type="button" class="pill-btn" (click)="i18n.toggleLocale()">
            {{ 'common.language' | t }}: {{ i18n.locale() === 'en' ? 'English' : '繁體中文' }}
          </button>
        </div>

        <form class="pref-form" (submit)="$event.preventDefault(); savePreferences()">
          <div class="field">
            <span>{{ 'profile.homeCountry' | t }}</span>
            <app-country-picker
              [selectedCodes]="[homeCountry()]"
              [multiple]="false"
              (selectionChange)="homeCountry.set($event[0] || homeCountry())"
            />
            <small class="field-hint">{{ 'profile.homeCountryHint' | t }}</small>
          </div>

          <div class="field">
            <span>{{ 'profile.homeCurrency' | t }}</span>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-select
                [value]="homeCurrency()"
                (selectionChange)="homeCurrency.set($event.value)"
                name="homeCurrency"
                [aria-label]="'profile.homeCurrency' | t"
              >
                @for (cur of currencies; track cur.code) {
                  <mat-option [value]="cur.code">
                    {{ i18n.locale() === 'zh-TW' ? cur.labelZh : cur.labelEn }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

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

        <form class="token-form" (submit)="$event.preventDefault(); generateToken()" novalidate>
          <input
            type="text"
            [class.has-error]="tokenNameError()"
            [value]="newTokenName()"
            (input)="newTokenName.set(readInputValue($event)); tokenNameError.set(false)"
            name="newTokenName"
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
              <button
                type="button"
                class="pill-btn danger"
                (click)="pendingRevokeToken.set({ id: tok.id, name: tok.name })"
              >
                {{ 'share.revoke' | t }}
              </button>
            </div>
          }
        </div>

        @if (hasActiveToken()) {
          <div class="mcp-divider"></div>
          <div class="mcp-block">
            <h4 class="mcp-subhead">{{ 'profile.aiConnectTitle' | t }}</h4>

            <div class="ai-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                class="ai-tab"
                [class.active]="aiSurfaceTab() === 'mcp'"
                [attr.aria-selected]="aiSurfaceTab() === 'mcp'"
                (click)="aiSurfaceTab.set('mcp')"
              >
                {{ 'profile.aiTabMcp' | t }}
              </button>
              <button
                type="button"
                role="tab"
                class="ai-tab"
                [class.active]="aiSurfaceTab() === 'chatgpt'"
                [attr.aria-selected]="aiSurfaceTab() === 'chatgpt'"
                (click)="aiSurfaceTab.set('chatgpt')"
              >
                {{ 'profile.aiTabChatgpt' | t }}
              </button>
            </div>

            @if (aiSurfaceTab() === 'mcp') {
              <p class="ai-support-line">{{ 'profile.aiMcpSupported' | t }}</p>

              <div class="connect-row">
                <div class="connect-info">
                  <span class="connect-label">{{ 'profile.aiMcpLabel' | t }}</span>
                  <code class="connect-url">{{ mcpEndpoint }}</code>
                </div>
                <button
                  type="button"
                  class="copy-inline-btn"
                  (click)="copySnippet('mcp', mcpEndpoint)"
                >
                  {{ copiedKey() === 'mcp' ? ('common.copied' | t) : ('common.copy' | t) }}
                </button>
              </div>

              <div class="ai-actions-row">
                <button
                  type="button"
                  class="ai-action-btn primary"
                  (click)="copySnippet('mcpJson', mcpConfigSnippet())"
                >
                  {{ copiedKey() === 'mcpJson' ? ('common.copied' | t) : ('profile.aiCopyMcpJson' | t) }}
                </button>
                <button
                  type="button"
                  class="ai-action-btn"
                  (click)="copySnippet('prompt', quickStartPrompt())"
                >
                  {{ copiedKey() === 'prompt' ? ('common.copied' | t) : ('profile.aiCopyPrompt' | t) }}
                </button>
              </div>
            } @else {
              <div class="connect-row">
                <div class="connect-info">
                  <span class="connect-label">{{ 'profile.aiOpenApiLabel' | t }}</span>
                  <code class="connect-url">{{ gptOpenApiUrl }}</code>
                </div>
                <button
                  type="button"
                  class="copy-inline-btn"
                  (click)="copySnippet('openapi', gptOpenApiUrl)"
                >
                  {{ copiedKey() === 'openapi' ? ('common.copied' | t) : ('common.copy' | t) }}
                </button>
              </div>

              <ol class="ai-steps">
                <li>{{ 'profile.aiChatgptStep1' | t }}</li>
                <li>{{ 'profile.aiChatgptStep2' | t }}</li>
              </ol>

              <div class="ai-actions-row">
                <button
                  type="button"
                  class="ai-action-btn primary"
                  (click)="copySnippet('gptPrompt', customGptInstructions())"
                >
                  {{ copiedKey() === 'gptPrompt' ? ('common.copied' | t) : ('profile.aiCopyGptPrompt' | t) }}
                </button>
              </div>
            }

            <p class="ai-footnote">{{ 'profile.aiWebLimitNote' | t }}</p>
          </div>
        }
      </section>

      <app-confirm-modal
        [open]="pendingRevokeToken() !== null"
        [title]="'confirm.revokeTokenTitle' | t"
        [message]="
          pendingRevokeToken()
            ? ('confirm.revokeTokenBody' | t: { name: pendingRevokeToken()!.name })
            : ''
        "
        [confirmLabel]="'share.revoke' | t"
        [busy]="revokingToken()"
        (confirmed)="executeRevokeToken()"
        (cancelled)="pendingRevokeToken.set(null)"
      />
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
      font-weight: 600;
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
    .token-form input {
      height: 40px;
      padding: 9px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background-color: var(--color-surface);
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
      color: var(--color-text-on-primary);
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
      font-weight: 600;
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
      align-items: stretch;
      gap: 12px;
    }
    .mcp-subhead {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-primary);
    }
    .ai-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      border-bottom: 1px solid var(--color-border);
    }
    .ai-tab {
      padding: 7px 12px;
      margin-bottom: -1px;
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: var(--radius-xs) var(--radius-xs) 0 0;
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: color 140ms ease, border-color 140ms ease;
    }
    .ai-tab:hover:not(.active) {
      color: var(--color-primary);
    }
    .ai-tab.active {
      color: var(--color-primary);
      border-bottom-color: var(--color-primary);
    }
    .ai-support-line {
      margin: 0;
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      line-height: 1.45;
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
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .connect-url {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      color: var(--color-primary);
      word-break: break-all;
    }
    .copy-inline-btn {
      padding: 5px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xs);
      background: var(--color-surface);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      flex-shrink: 0;
    }
    .copy-inline-btn:hover {
      border-color: var(--color-primary);
    }
    .ai-steps {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--color-text-secondary);
    }
    .ai-actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .ai-action-btn {
      padding: 7px 13px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-primary);
      font: inherit;
      font-size: 0.79rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
    }
    .ai-action-btn:hover {
      border-color: var(--color-primary);
      background: var(--color-surface-alt);
    }
    .ai-action-btn.primary {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
    }
    .ai-action-btn.primary:hover {
      background: var(--color-primary);
      color: var(--color-text-on-primary);
    }
    .ai-footnote {
      margin: 2px 0 0;
      padding-top: 10px;
      border-top: 1px solid var(--color-border-soft);
      font-size: 0.75rem;
      line-height: 1.45;
      color: var(--color-text-muted);
    }
  `,
})
export class ProfilePageComponent implements OnInit {
  protected readonly authStore = inject(AuthStore);
  protected readonly session = inject(AuthSessionService);
  protected readonly i18n = inject(I18nService);
  private readonly sessionCleanup = inject(SessionCleanupService);
  protected readonly currencies = SUPPORTED_CURRENCIES;
  protected readonly readInputValue = readInputValue;

  protected readonly homeCountry = linkedSignal(
    () => this.authStore.profile()?.home_country_code ?? 'TW',
  );
  protected readonly homeCurrency = linkedSignal(
    () => this.authStore.profile()?.home_currency ?? 'TWD',
  );
  protected readonly newTokenName = signal('');
  protected readonly savedNotice = signal(false);
  protected readonly copied = signal(false);
  protected readonly copiedKey = signal<string | null>(null);
  protected readonly pendingRevokeToken = signal<{ id: string; name: string } | null>(null);
  protected readonly revokingToken = signal(false);
  protected readonly tokenNameError = signal(false);
  protected readonly tokenApiError = signal<string | null>(null);
  protected readonly generatingToken = signal(false);
  protected readonly aiSurfaceTab = signal<'mcp' | 'chatgpt'>('mcp');

  private readonly apiOrigin =
    getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  protected readonly mcpEndpoint = `${this.apiOrigin}/mcp`;
  protected readonly llmsTxtUrl = `${this.apiOrigin}/llms.txt`;
  protected readonly gptOpenApiUrl = `${this.apiOrigin}/gpt-openapi.json`;

  protected readonly activeTokens = computed(() =>
    this.authStore.tokens().filter((tok) => !tok.revoked_at),
  );

  protected readonly hasActiveToken = computed(() => this.activeTokens().length > 0);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.authStore.loadProfile(), this.authStore.loadTokens()]);
  }

  protected async executeRevokeToken(): Promise<void> {
    const target = this.pendingRevokeToken();
    if (!target) {
      return;
    }
    this.revokingToken.set(true);
    try {
      await this.authStore.revokeToken(target.id);
      this.pendingRevokeToken.set(null);
    } catch {
      // Error state is recorded on AuthStore and shown in the error banner.
      this.pendingRevokeToken.set(null);
    } finally {
      this.revokingToken.set(false);
    }
  }

  protected async savePreferences(): Promise<void> {
    try {
      await this.authStore.updateProfile({
        home_country_code: this.homeCountry(),
        home_currency: this.homeCurrency(),
      });
      this.savedNotice.set(true);
      setTimeout(() => this.savedNotice.set(false), SAVE_NOTICE_DURATION_MS);
    } catch {
      // Error state is recorded on AuthStore and shown in the error banner.
    }
  }

  protected async generateToken(): Promise<void> {
    this.tokenApiError.set(null);
    const tokenName = this.newTokenName().trim();
    if (!tokenName) {
      this.tokenNameError.set(true);
      return;
    }
    this.generatingToken.set(true);
    try {
      await this.authStore.createToken(tokenName);
      this.newTokenName.set('');
    } catch {
      this.tokenApiError.set(this.i18n.t('profile.tokenCreateError'));
    } finally {
      this.generatingToken.set(false);
    }
  }

  protected async copyToken(plaintext: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(plaintext);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), SHARE_COPY_FEEDBACK_DURATION_MS);
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

  protected mcpConfigSnippet(): string {
    return JSON.stringify(
      {
        mcpServers: {
          tripilot: {
            url: this.mcpEndpoint,
            headers: {
              Authorization: 'Bearer <YOUR_TRIPILOT_TOKEN>',
            },
          },
        },
      },
      null,
      2,
    );
  }

  protected customGptInstructions(): string {
    return [
      "You are the user's Tripilot travel planner.",
      '1. Call search_places or resolve_place_url before adding STAY, SPOT, FOOD, or RESERVED_TRANSIT items so map coordinates render.',
      '2. For non-English destinations (e.g. Japan, Korea, Europe), set details.local_name to the native venue name for taxi copy.',
      '3. When logging expenses, omit exchange_rate unless overriding so Tripilot resolves the live FX rate automatically.',
      '4. Keep Day Themes (TripDay.title) concise and scannable.',
    ].join('\n');
  }

  protected async copySnippet(key: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedKey.set(key);
      setTimeout(() => {
        if (this.copiedKey() === key) {
          this.copiedKey.set(null);
        }
      }, SHARE_COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Clipboard may be unavailable in non-HTTPS contexts.
    }
  }

  protected async signOut(): Promise<void> {
    await this.sessionCleanup.signOutAndRedirect();
  }
}
