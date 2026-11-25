import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import {
  AdminUserItem,
  InviteCodeItem,
  InviteStatus,
  UserRole,
} from '../core/models/tripilot.models';
import { extractApiErrorMessage } from '../core/utils/http-error.utils';

export type AdminUserSortField = 'created_at' | 'last_login_at' | 'role';
export type InviteFilterValue = 'all' | InviteStatus;

interface AdminState {
  users: AdminUserItem[];
  totalUsers: number;
  activeMembers: number;
  availableInvites: number;
  invites: InviteCodeItem[];
  lastGeneratedCodes: InviteCodeItem[];
  searchQuery: string;
  roleFilter: UserRole | '';
  sortBy: AdminUserSortField;
  inviteFilter: InviteFilterValue;
  loading: boolean;
  mutating: boolean;
  error: string | null;
}

const initialState: AdminState = {
  users: [],
  totalUsers: 0,
  activeMembers: 0,
  availableInvites: 0,
  invites: [],
  lastGeneratedCodes: [],
  searchQuery: '',
  roleFilter: '',
  sortBy: 'created_at',
  inviteFilter: 'all',
  loading: false,
  mutating: false,
  error: null,
};

/** Route-scoped SignalStore for Admin Console user governance and invite management. */
export const AdminStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    filteredInvites: computed(() => {
      const filter = store.inviteFilter();
      const all = store.invites();
      return filter === 'all' ? all : all.filter((item) => item.status === filter);
    }),
  })),
  withMethods((store, api = inject(TripilotApiService)) => {
    async function refreshUsers(): Promise<void> {
      const sortBy = store.sortBy();
      const res = await api.listAdminUsers({
        q: store.searchQuery(),
        role: store.roleFilter(),
        sort_by: sortBy,
        order: sortBy === 'role' ? 'asc' : 'desc',
      });
      patchState(store, {
        users: res.items,
        totalUsers: res.total,
        activeMembers: res.active_friends_count,
        availableInvites: res.available_invites_count,
      });
    }

    async function refreshInvites(): Promise<void> {
      const invites = await api.listAdminInvites();
      patchState(store, { invites });
    }

    return {
      clearError(): void {
        patchState(store, { error: null });
      },

      clearFreshInvites(): void {
        patchState(store, { lastGeneratedCodes: [] });
      },

      setInviteFilter(inviteFilter: InviteFilterValue): void {
        patchState(store, { inviteFilter });
      },

      async loadAll(): Promise<void> {
        patchState(store, { loading: true, error: null });
        try {
          await Promise.all([refreshUsers(), refreshInvites()]);
          patchState(store, { loading: false });
        } catch (err) {
          patchState(store, {
            loading: false,
            error: extractApiErrorMessage(err, 'Failed to load admin console data'),
          });
        }
      },

      async loadUsers(): Promise<void> {
        patchState(store, { loading: true, error: null });
        try {
          await refreshUsers();
          patchState(store, { loading: false });
        } catch (err) {
          patchState(store, {
            loading: false,
            error: extractApiErrorMessage(err, 'Failed to load user list'),
          });
        }
      },

      async setSearchQuery(searchQuery: string): Promise<void> {
        patchState(store, { searchQuery });
        await this.loadUsers();
      },

      async setRoleFilter(roleFilter: UserRole | ''): Promise<void> {
        patchState(store, { roleFilter });
        await this.loadUsers();
      },

      async setSortBy(sortBy: AdminUserSortField): Promise<void> {
        patchState(store, { sortBy });
        await this.loadUsers();
      },

      async updateUserRole(userId: string, role: UserRole): Promise<void> {
        patchState(store, { mutating: true, error: null });
        try {
          await api.updateAdminUser(userId, { role });
          await refreshUsers();
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to update user role'),
          });
        } finally {
          patchState(store, { mutating: false });
        }
      },

      async setUserActive(userId: string, isActive: boolean): Promise<void> {
        patchState(store, { mutating: true, error: null });
        try {
          await api.updateAdminUser(userId, { is_active: isActive });
          await refreshUsers();
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to update user status'),
          });
        } finally {
          patchState(store, { mutating: false });
        }
      },

      async revokeUserTokens(userId: string): Promise<void> {
        patchState(store, { mutating: true, error: null });
        try {
          await api.revokeAdminUserTokens(userId);
          await refreshUsers();
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to revoke user tokens'),
          });
        } finally {
          patchState(store, { mutating: false });
        }
      },

      async deleteUser(userId: string): Promise<void> {
        patchState(store, { mutating: true, error: null });
        try {
          await api.deleteAdminUser(userId);
          await Promise.all([refreshUsers(), refreshInvites()]);
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to delete user account'),
          });
        } finally {
          patchState(store, { mutating: false });
        }
      },

      async createInvites(payload: {
        count: number;
        note?: string | null;
        expires_in_days?: number | null;
      }): Promise<void> {
        patchState(store, { mutating: true, error: null });
        try {
          const generated = await api.createAdminInvites(payload);
          patchState(store, { lastGeneratedCodes: generated });
          await Promise.all([refreshUsers(), refreshInvites()]);
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to generate invite codes'),
          });
        } finally {
          patchState(store, { mutating: false });
        }
      },

      async revokeInvite(inviteId: string): Promise<void> {
        patchState(store, { mutating: true, error: null });
        try {
          await api.revokeAdminInvite(inviteId);
          await Promise.all([refreshUsers(), refreshInvites()]);
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to revoke invite code'),
          });
        } finally {
          patchState(store, { mutating: false });
        }
      },
    };
  }),
);
