import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  AdminUserItem,
  InviteCodeItem,
  UserRole,
} from '../../core/models/tripilot.models';
import { readInputValue } from '../../core/utils/form-events.utils';
import { AppConfirmModalComponent } from '../../shared/confirm-modal.component';
import { AdminStore, AdminUserSortField, InviteFilterValue } from '../../state/admin.store';
import { AuthStore } from '../../state/auth.store';

interface PendingAdminAction {
  kind: 'suspend' | 'revokeTokens' | 'deleteUser' | 'revokeInvite';
  id: string;
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'danger' | 'primary';
}

/** Lazy-loaded Admin Console for invite-only user governance and invite code management. */
@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AdminStore],
  imports: [TranslatePipe, AppConfirmModalComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h2 class="page-title font-display">{{ 'admin.title' | t }}</h2>
        <button
          type="button"
          class="pill-btn"
          [disabled]="adminStore.loading()"
          (click)="adminStore.loadAll()"
        >
          <span class="ms-icon sm" aria-hidden="true">refresh</span>
          <span>{{ 'admin.refresh' | t }}</span>
        </button>
      </div>

      @if (adminStore.error(); as err) {
        <div class="error-banner" role="alert">
          <span>{{ err }}</span>
          <button
            type="button"
            class="error-dismiss"
            [attr.aria-label]="'common.close' | t"
            (click)="adminStore.clearError()"
          >
            <span class="ms-icon sm" aria-hidden="true">close</span>
          </button>
        </div>
      }

      <div class="kpi-strip">
        <div class="kpi-chip">
          <span class="kpi-label">{{ 'admin.statTotalUsers' | t }}</span>
          <strong class="kpi-val font-mono tabular-nums">{{ adminStore.totalUsers() }}</strong>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">{{ 'admin.statActiveMembers' | t }}</span>
          <strong class="kpi-val font-mono tabular-nums">{{ adminStore.activeMembers() }}</strong>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">{{ 'admin.statAvailableInvites' | t }}</span>
          <strong class="kpi-val font-mono tabular-nums">
            {{ adminStore.availableInvites() }}
          </strong>
        </div>
      </div>

      <div class="seg-row tab-switch">
        <button
          type="button"
          class="seg-btn"
          [class.active]="activeTab() === 'users'"
          (click)="activeTab.set('users')"
        >
          {{ 'admin.tabUsers' | t }}
        </button>
        <button
          type="button"
          class="seg-btn"
          [class.active]="activeTab() === 'invites'"
          (click)="activeTab.set('invites')"
        >
          {{ 'admin.tabInvites' | t }}
        </button>
      </div>

      @if (activeTab() === 'users') {
        <section class="panel">
          <div class="filter-bar">
            <input
              type="search"
              class="search-input"
              [attr.aria-label]="'admin.searchPlaceholder' | t"
              [placeholder]="'admin.searchPlaceholder' | t"
              [value]="adminStore.searchQuery()"
              (input)="onSearchInput($event)"
            />

            <select
              class="filter-select"
              [attr.aria-label]="'admin.filterAllRoles' | t"
              [value]="adminStore.roleFilter()"
              (change)="onRoleFilterChange($event)"
            >
              <option value="">{{ 'admin.filterAllRoles' | t }}</option>
              <option value="OWNER">OWNER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="FRIEND">FRIEND</option>
              <option value="USER">USER</option>
            </select>

            <select
              class="filter-select"
              [attr.aria-label]="'admin.sortCreated' | t"
              [value]="adminStore.sortBy()"
              (change)="onSortChange($event)"
            >
              <option value="created_at">{{ 'admin.sortCreated' | t }}</option>
              <option value="last_login_at">{{ 'admin.sortLastLogin' | t }}</option>
              <option value="role">{{ 'admin.sortRole' | t }}</option>
            </select>
          </div>

          <div class="record-list">
            @for (u of adminStore.users(); track u.id) {
              <article class="record-row" [class.inactive-row]="!u.is_active">
                <div class="record-main">
                  <div class="record-head">
                    <strong class="record-title">
                      {{ u.display_name || u.email || u.id }}
                    </strong>
                    @if (isSelf(u)) {
                      <span class="badge self">{{ 'admin.selfBadge' | t }}</span>
                    }
                    @if (!u.is_active) {
                      <span class="badge alert">{{ 'admin.suspendedBadge' | t }}</span>
                    }
                    @if (!canManageUser(u)) {
                      <span class="badge role">{{ u.role }}</span>
                    }
                  </div>
                  @if (u.email && u.display_name) {
                    <div class="record-sub">{{ u.email }}</div>
                  }
                  <div class="record-meta font-mono tabular-nums">
                    <span>{{ 'admin.tripsMeta' | t:{ count: u.trip_count } }}</span>
                    <span>&middot;</span>
                    <span>{{ 'admin.tokensMeta' | t:{ count: u.active_token_count } }}</span>
                    <span>&middot;</span>
                    <span>
                      @if (u.last_login_at) {
                        {{ 'admin.lastLogin' | t:{ date: formatShortDate(u.last_login_at) } }}
                      } @else {
                        {{ 'admin.neverLoggedIn' | t }}
                      }
                    </span>
                  </div>
                </div>

                @if (canManageUser(u)) {
                  <div class="record-actions">
                    <select
                      class="role-select"
                      [attr.aria-label]="u.email || u.id"
                      [disabled]="adminStore.mutating()"
                      [value]="u.role"
                      (change)="onUserRoleChange(u, $event)"
                    >
                      @for (r of assignableRoles(); track r) {
                        <option [value]="r" [selected]="u.role === r">{{ r }}</option>
                      }
                    </select>

                    @if (u.is_active) {
                      <button
                        type="button"
                        class="pill-btn"
                        [disabled]="adminStore.mutating()"
                        (click)="promptSuspend(u)"
                      >
                        {{ 'admin.suspend' | t }}
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="pill-btn primary-tint"
                        [disabled]="adminStore.mutating()"
                        (click)="adminStore.setUserActive(u.id, true)"
                      >
                        {{ 'admin.reactivate' | t }}
                      </button>
                    }

                    @if (u.active_token_count > 0) {
                      <button
                        type="button"
                        class="pill-btn"
                        [disabled]="adminStore.mutating()"
                        (click)="promptRevokeTokens(u)"
                      >
                        {{ 'admin.revokeTokens' | t }}
                      </button>
                    }

                    @if (authStore.isOwner()) {
                      <button
                        type="button"
                        class="pill-btn danger"
                        [disabled]="adminStore.mutating()"
                        (click)="promptDeleteUser(u)"
                      >
                        {{ 'admin.deleteUser' | t }}
                      </button>
                    }
                  </div>
                }
              </article>
            } @empty {
              <p class="empty-copy">{{ 'admin.emptyUsers' | t }}</p>
            }
          </div>
        </section>
      } @else {
        <section class="panel">
          <form
            class="invite-gen-form"
            (submit)="$event.preventDefault(); generateInvites()"
          >
            <label class="field compact-field">
              <span>{{ 'admin.inviteCount' | t }}</span>
              <select [value]="inviteCount()" (change)="onInviteCountChange($event)">
                @for (n of [1, 3, 5, 10]; track n) {
                  <option [value]="n">{{ n }}</option>
                }
              </select>
            </label>

            <label class="field note-field">
              <span>{{ 'admin.inviteNote' | t }}</span>
              <input
                type="text"
                [placeholder]="'admin.inviteNotePlaceholder' | t"
                [value]="inviteNote()"
                (input)="inviteNote.set(readInputValue($event))"
              />
            </label>

            <label class="field compact-field">
              <span>{{ 'admin.inviteExpiry' | t }}</span>
              <select
                [value]="inviteExpiryDays()"
                (change)="inviteExpiryDays.set(readInputValue($event))"
              >
                <option value="">{{ 'admin.expiryNever' | t }}</option>
                <option value="7">{{ 'admin.expiryDays' | t:{ days: 7 } }}</option>
                <option value="30">{{ 'admin.expiryDays' | t:{ days: 30 } }}</option>
                <option value="90">{{ 'admin.expiryDays' | t:{ days: 90 } }}</option>
              </select>
            </label>

            <button
              type="submit"
              class="btn-primary gen-btn"
              [disabled]="adminStore.mutating()"
            >
              {{ 'admin.generateInvites' | t }}
            </button>
          </form>

          @if (adminStore.lastGeneratedCodes().length > 0) {
            <div class="fresh-batch">
              <span>
                {{
                  'admin.freshBatch'
                    | t:{ count: adminStore.lastGeneratedCodes().length }
                }}
              </span>
              <div class="fresh-actions">
                <button type="button" class="pill-btn" (click)="copyFreshBatch()">
                  {{ copiedId() === '__batch__' ? ('common.copied' | t) : ('admin.copyAll' | t) }}
                </button>
                <button
                  type="button"
                  class="error-dismiss"
                  [attr.aria-label]="'common.close' | t"
                  (click)="adminStore.clearFreshInvites()"
                >
                  <span class="ms-icon sm" aria-hidden="true">close</span>
                </button>
              </div>
            </div>
          }

          <div class="status-pills">
            @for (f of inviteFilters; track f.value) {
              <button
                type="button"
                class="pill-btn"
                [class.active-pill]="adminStore.inviteFilter() === f.value"
                (click)="adminStore.setInviteFilter(f.value)"
              >
                {{ f.labelKey | t }}
              </button>
            }
          </div>

          <div class="record-list">
            @for (inv of adminStore.filteredInvites(); track inv.id) {
              <article class="record-row">
                <div class="record-main">
                  <div class="record-head">
                    <code class="invite-code">{{ inv.code }}</code>
                    <span class="badge" [class]="'status-' + inv.status">
                      {{ statusLabelKey(inv.status) | t }}
                    </span>
                    @if (inv.note) {
                      <span class="invite-note">{{ inv.note }}</span>
                    }
                  </div>
                  <div class="record-meta font-mono tabular-nums">
                    @if (inv.used_by_email) {
                      <span>{{ 'admin.usedBy' | t:{ email: inv.used_by_email } }}</span>
                    } @else if (inv.expires_at) {
                      <span>
                        {{ 'admin.expiresAt' | t:{ date: formatShortDate(inv.expires_at) } }}
                      </span>
                    } @else {
                      <span>{{ formatShortDate(inv.created_at) }}</span>
                    }
                  </div>
                </div>

                <div class="record-actions">
                  @if (inv.status === 'available') {
                    <button
                      type="button"
                      class="pill-btn primary-tint"
                      (click)="copyInviteLink(inv)"
                    >
                      {{
                        copiedId() === inv.id + ':link'
                          ? ('common.copied' | t)
                          : ('admin.copyLink' | t)
                      }}
                    </button>
                    <button
                      type="button"
                      class="pill-btn"
                      (click)="copyCode(inv)"
                    >
                      {{ copiedId() === inv.id ? ('common.copied' | t) : ('common.copy' | t) }}
                    </button>
                    <button
                      type="button"
                      class="pill-btn danger"
                      [disabled]="adminStore.mutating()"
                      (click)="promptRevokeInvite(inv)"
                    >
                      {{ 'admin.revokeInvite' | t }}
                    </button>
                  }
                </div>
              </article>
            } @empty {
              <p class="empty-copy">{{ 'admin.emptyInvites' | t }}</p>
            }
          </div>
        </section>
      }
    </div>

    <app-confirm-modal
      [open]="pendingAction() !== null"
      [title]="pendingAction()?.title ?? ''"
      [message]="pendingAction()?.message ?? ''"
      [confirmLabel]="pendingAction()?.confirmLabel ?? ''"
      [tone]="pendingAction()?.tone ?? 'danger'"
      [busy]="adminStore.mutating()"
      (confirmed)="executePendingAction()"
      (cancelled)="pendingAction.set(null)"
    />
  `,
  styles: `
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .kpi-chip {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }

    .kpi-label {
      font-size: 0.74rem;
      color: var(--color-text-muted);
    }

    .kpi-val {
      font-size: 1.25rem;
      color: var(--color-primary);
    }

    .tab-switch {
      max-width: 320px;
      margin-bottom: var(--space-4);
    }

    .panel {
      padding: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-card);
    }

    .filter-bar,
    .invite-gen-form {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    .search-input,
    .filter-select,
    .role-select {
      padding: 8px 11px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      color: var(--color-text-primary);
      font: inherit;
      font-size: 0.84rem;
    }

    .search-input {
      flex: 1 1 220px;
    }

    .compact-field {
      flex: 0 0 auto;
    }

    .note-field {
      flex: 1 1 200px;
    }

    .gen-btn {
      height: 38px;
    }

    .fresh-batch {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 9px 12px;
      margin-bottom: var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.84rem;
      font-weight: 600;
    }

    .fresh-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: var(--space-3);
    }

    .pill-btn.active-pill,
    .pill-btn.primary-tint {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-weight: 600;
    }

    .record-list {
      display: flex;
      flex-direction: column;
    }

    .record-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px 14px;
      padding: 12px 0;
      border-top: 1px solid var(--color-border);
    }

    .record-row:first-child {
      border-top: 0;
      padding-top: 4px;
    }

    .record-row.inactive-row {
      opacity: 0.72;
    }

    .record-main {
      min-width: 0;
      flex: 1 1 240px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .record-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .record-title {
      font-size: 0.92rem;
      color: var(--color-text-primary);
      word-break: break-word;
    }

    .record-sub {
      font-size: 0.78rem;
      color: var(--color-text-secondary);
      word-break: break-all;
    }

    .record-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .record-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .role-select {
      padding: 5px 8px;
      font-size: 0.78rem;
      font-weight: 600;
    }

    .badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
    }

    .badge.self,
    .badge.status-available {
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }

    .badge.role {
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
    }

    .badge.alert,
    .badge.status-revoked {
      background: var(--color-alert-soft);
      color: var(--color-alert);
    }

    .invite-code {
      font-family: var(--font-mono);
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--color-primary);
    }

    .invite-note {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }

    .empty-copy {
      margin: var(--space-4) 0;
      text-align: center;
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }
  `,
})
export class AdminPageComponent implements OnInit {
  protected readonly adminStore = inject(AdminStore);
  protected readonly authStore = inject(AuthStore);
  protected readonly i18n = inject(I18nService);
  protected readonly readInputValue = readInputValue;

  protected readonly activeTab = signal<'users' | 'invites'>('users');
  protected readonly inviteCount = signal(3);
  protected readonly inviteNote = signal('');
  protected readonly inviteExpiryDays = signal('');
  protected readonly copiedId = signal<string | null>(null);
  protected readonly pendingAction = signal<PendingAdminAction | null>(null);

  protected readonly assignableRoles = computed<readonly UserRole[]>(() =>
    this.authStore.isOwner() ? ['USER', 'FRIEND', 'ADMIN'] : ['USER', 'FRIEND'],
  );

  protected readonly inviteFilters: readonly {
    value: InviteFilterValue;
    labelKey:
      | 'admin.filterAll'
      | 'admin.statusAvailable'
      | 'admin.statusUsed'
      | 'admin.statusExpired'
      | 'admin.statusRevoked';
  }[] = [
    { value: 'all', labelKey: 'admin.filterAll' },
    { value: 'available', labelKey: 'admin.statusAvailable' },
    { value: 'used', labelKey: 'admin.statusUsed' },
    { value: 'expired', labelKey: 'admin.statusExpired' },
    { value: 'revoked', labelKey: 'admin.statusRevoked' },
  ];

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.authStore.ensureProfileLoaded(),
      this.adminStore.loadAll(),
    ]);
  }

  protected isSelf(user: AdminUserItem): boolean {
    return this.authStore.profile()?.id === user.id;
  }

  protected canManageUser(user: AdminUserItem): boolean {
    if (this.isSelf(user) || user.role === 'OWNER') {
      return false;
    }
    if (!this.authStore.isOwner() && user.role === 'ADMIN') {
      return false;
    }
    return true;
  }

  protected statusLabelKey(
    status: InviteCodeItem['status'],
  ):
    | 'admin.statusAvailable'
    | 'admin.statusUsed'
    | 'admin.statusExpired'
    | 'admin.statusRevoked' {
    switch (status) {
      case 'available':
        return 'admin.statusAvailable';
      case 'used':
        return 'admin.statusUsed';
      case 'expired':
        return 'admin.statusExpired';
      case 'revoked':
        return 'admin.statusRevoked';
    }
  }

  protected formatShortDate(iso: string): string {
    return iso.slice(0, 10);
  }

  protected onSearchInput(event: Event): void {
    void this.adminStore.setSearchQuery(readInputValue(event));
  }

  protected onRoleFilterChange(event: Event): void {
    void this.adminStore.setRoleFilter(readInputValue(event) as UserRole | '');
  }

  protected onSortChange(event: Event): void {
    void this.adminStore.setSortBy(readInputValue(event) as AdminUserSortField);
  }

  protected onUserRoleChange(user: AdminUserItem, event: Event): void {
    const nextRole = readInputValue(event) as UserRole;
    if (nextRole !== user.role) {
      void this.adminStore.updateUserRole(user.id, nextRole);
    }
  }

  protected onInviteCountChange(event: Event): void {
    const parsed = Number(readInputValue(event));
    this.inviteCount.set(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  }

  protected async generateInvites(): Promise<void> {
    const expiryRaw = this.inviteExpiryDays();
    await this.adminStore.createInvites({
      count: this.inviteCount(),
      note: this.inviteNote().trim() || null,
      expires_in_days: expiryRaw ? Number(expiryRaw) : null,
    });
    this.inviteNote.set('');
  }

  protected copyCode(inv: InviteCodeItem): void {
    this.copyText(inv.id, inv.code);
  }

  protected copyInviteLink(inv: InviteCodeItem): void {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/login?invite=${encodeURIComponent(inv.code)}`;
    this.copyText(`${inv.id}:link`, link);
  }

  protected copyFreshBatch(): void {
    const codes = this.adminStore
      .lastGeneratedCodes()
      .map((item) => item.code)
      .join('\n');
    this.copyText('__batch__', codes);
  }

  private copyText(id: string, text: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    this.copiedId.set(id);
    setTimeout(() => {
      if (this.copiedId() === id) {
        this.copiedId.set(null);
      }
    }, 1800);
  }

  protected promptSuspend(user: AdminUserItem): void {
    const label = user.email || user.display_name || user.id;
    this.pendingAction.set({
      kind: 'suspend',
      id: user.id,
      title: this.i18n.t('admin.suspendConfirmTitle'),
      message: this.i18n.t('admin.suspendConfirmMsg', { email: label }),
      confirmLabel: this.i18n.t('admin.suspend'),
      tone: 'danger',
    });
  }

  protected promptRevokeTokens(user: AdminUserItem): void {
    const label = user.email || user.display_name || user.id;
    this.pendingAction.set({
      kind: 'revokeTokens',
      id: user.id,
      title: this.i18n.t('admin.revokeTokensTitle'),
      message: this.i18n.t('admin.revokeTokensMsg', {
        email: label,
        count: user.active_token_count,
      }),
      confirmLabel: this.i18n.t('admin.revokeTokens'),
      tone: 'danger',
    });
  }

  protected promptDeleteUser(user: AdminUserItem): void {
    const label = user.email || user.display_name || user.id;
    this.pendingAction.set({
      kind: 'deleteUser',
      id: user.id,
      title: this.i18n.t('admin.deleteConfirmTitle'),
      message: this.i18n.t('admin.deleteConfirmMsg', { email: label }),
      confirmLabel: this.i18n.t('common.delete'),
      tone: 'danger',
    });
  }

  protected promptRevokeInvite(inv: InviteCodeItem): void {
    this.pendingAction.set({
      kind: 'revokeInvite',
      id: inv.id,
      title: this.i18n.t('admin.revokeInvite'),
      message: `${inv.code}${inv.note ? ` (${inv.note})` : ''}`,
      confirmLabel: this.i18n.t('admin.revokeInvite'),
      tone: 'danger',
    });
  }

  protected async executePendingAction(): Promise<void> {
    const action = this.pendingAction();
    if (!action) {
      return;
    }
    this.pendingAction.set(null);
    switch (action.kind) {
      case 'suspend':
        await this.adminStore.setUserActive(action.id, false);
        break;
      case 'revokeTokens':
        await this.adminStore.revokeUserTokens(action.id);
        break;
      case 'deleteUser':
        await this.adminStore.deleteUser(action.id);
        break;
      case 'revokeInvite':
        await this.adminStore.revokeInvite(action.id);
        break;
    }
  }
}
