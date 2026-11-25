import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import { ApiTokenCreated, ApiTokenItem, UserProfile } from '../core/models/tripilot.models';
import { extractApiErrorMessage } from '../core/utils/http-error.utils';

interface AuthState {
  profile: UserProfile | null;
  tokens: ApiTokenItem[];
  lastCreatedToken: ApiTokenCreated | null;
  suspended: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  profile: null,
  tokens: [],
  lastCreatedToken: null,
  suspended: false,
  loading: false,
  error: null,
};

/** SignalStore managing user profile, RBAC role state, and Personal API Tokens. */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    role: computed(() => store.profile()?.role ?? null),
    isOwner: computed(() => store.profile()?.role === 'OWNER'),
    isAdmin: computed(() => {
      const role = store.profile()?.role;
      return role === 'OWNER' || role === 'ADMIN';
    }),
    isMember: computed(() => {
      const role = store.profile()?.role;
      return role === 'OWNER' || role === 'ADMIN' || role === 'FRIEND';
    }),
  })),
  withMethods((store, api = inject(TripilotApiService)) => {
    let inflightProfile: Promise<UserProfile | null> | null = null;

    return {
      clearError(): void {
        patchState(store, { error: null });
      },

      async ensureProfileLoaded(): Promise<UserProfile | null> {
        const existing = store.profile();
        if (existing) {
          return existing;
        }
        if (inflightProfile) {
          return await inflightProfile;
        }
        inflightProfile = (async () => {
          try {
            const profile = await api.getMe();
            patchState(store, {
              profile,
              suspended: !profile.is_active,
            });
            return profile;
          } catch (err) {
            if (
              err instanceof HttpErrorResponse &&
              err.status === 403 &&
              String((err.error as { detail?: unknown } | null)?.detail ?? '')
                .toLowerCase()
                .includes('suspend')
            ) {
              patchState(store, { profile: null, suspended: true });
            }
            return store.profile();
          } finally {
            inflightProfile = null;
          }
        })();
        return await inflightProfile;
      },

      async loadProfile(): Promise<void> {
        patchState(store, { loading: true, error: null });
        try {
          const profile = await api.getMe();
          patchState(store, {
            profile,
            suspended: !profile.is_active,
            loading: false,
          });
        } catch (err) {
          patchState(store, {
            loading: false,
            error: extractApiErrorMessage(err, 'Failed to load profile'),
          });
        }
      },

      async updateProfile(
        payload: Partial<
          Pick<UserProfile, 'display_name' | 'home_country_code' | 'home_currency'>
        >,
      ): Promise<void> {
        patchState(store, { error: null });
        try {
          const profile = await api.updateMe(payload);
          patchState(store, { profile });
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to save preferences'),
          });
          throw err;
        }
      },

      async redeemInviteCode(code: string): Promise<UserProfile> {
        patchState(store, { error: null });
        try {
          const profile = await api.redeemInviteCode(code);
          patchState(store, { profile, suspended: false, error: null });
          return profile;
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to redeem invite code'),
          });
          throw err;
        }
      },

      async loadTokens(): Promise<void> {
        try {
          const tokens = await api.listTokens();
          patchState(store, { tokens });
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to load API tokens'),
          });
        }
      },

      async createToken(name: string): Promise<ApiTokenCreated> {
        const created = await api.createToken(name);
        patchState(store, {
          lastCreatedToken: created,
          tokens: [created, ...store.tokens()],
        });
        return created;
      },

      clearLastCreatedToken(): void {
        patchState(store, { lastCreatedToken: null });
      },

      async revokeToken(tokenId: string): Promise<void> {
        patchState(store, { error: null });
        try {
          await api.revokeToken(tokenId);
          await this.loadTokens();
        } catch (err) {
          patchState(store, {
            error: extractApiErrorMessage(err, 'Failed to revoke API token'),
          });
          throw err;
        }
      },

      reset(): void {
        inflightProfile = null;
        patchState(store, initialState);
      },
    };
  }),
);
