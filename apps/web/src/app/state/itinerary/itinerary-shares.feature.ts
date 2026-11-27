import { inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { ShareVisibilityPolicy, TripShare } from '../../core/models/tripilot.models';
import { ItineraryBaseFeature } from './itinerary-base.feature';
import { recordItineraryError } from './itinerary.state';

/** Read-only share link management methods for ItineraryStore. */
export function withItineraryShares() {
  return signalStoreFeature(
    type<ItineraryBaseFeature>(),
    withMethods((store, api = inject(TripilotApiService)) => ({
      async loadShares(tripId: string): Promise<void> {
        try {
          const shares = await api.listShares(tripId);
          patchState(store, { shares });
        } catch (err) {
          recordItineraryError(store, err, 'Failed to load share links');
        }
      },

      async createShare(
        tripId: string,
        label: string,
        policy: ShareVisibilityPolicy,
      ): Promise<TripShare> {
        const share = await api.createShare(tripId, label, policy);
        patchState(store, { shares: [share, ...store.shares()] });
        return share;
      },

      async revokeShare(tripId: string, shareId: string): Promise<void> {
        try {
          await api.revokeShare(tripId, shareId);
          patchState(store, {
            shares: store.shares().filter((s) => s.id !== shareId),
          });
        } catch (err) {
          recordItineraryError(store, err, 'Failed to revoke share link');
        }
      },
    })),
  );
}
