import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { TripilotApiService } from '../core/api/tripilot-api.service';
import { ApiTokenCreated, ApiTokenItem, UserProfile } from '../core/models/tripilot.models';

interface AuthState {
  profile: UserProfile | null;
  tokens: ApiTokenItem[];
  lastCreatedToken: ApiTokenCreated | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  profile: null,
  tokens: [],
  lastCreatedToken: null,
  loading: false,
  error: null,
};

/** SignalStore managing user profile preferences and Personal API Tokens. */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, api = inject(TripilotApiService)) => ({
    async loadProfile(): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const profile = await api.getMe();
        patchState(store, { profile, loading: false });
      } catch (err) {
        patchState(store, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load profile',
        });
      }
    },

    async updateProfile(
      payload: Partial<Pick<UserProfile, 'display_name' | 'home_country_code' | 'home_currency'>>,
    ): Promise<void> {
      const profile = await api.updateMe(payload);
      patchState(store, { profile });
    },

    async loadTokens(): Promise<void> {
      const tokens = await api.listTokens();
      patchState(store, { tokens });
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
      await api.revokeToken(tokenId);
      await this.loadTokens();
    },
  })),
);
