import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { OfflineCacheService } from '../cache/offline-cache.service';
import { AuthStore } from '../../state/auth.store';
import { ExpenseStore } from '../../state/expense.store';
import { ItineraryStore } from '../../state/itinerary.store';
import { StatsStore } from '../../state/stats.store';
import { TripStore } from '../../state/trip.store';
import { AuthSessionService } from './auth-session.service';

/** Signs out of Firebase, clears local cached user data, and resets all SignalStores. */
@Injectable({ providedIn: 'root' })
export class SessionCleanupService {
  private readonly session = inject(AuthSessionService);
  private readonly offlineCache = inject(OfflineCacheService);
  private readonly authStore = inject(AuthStore);
  private readonly tripStore = inject(TripStore);
  private readonly itineraryStore = inject(ItineraryStore);
  private readonly expenseStore = inject(ExpenseStore);
  private readonly statsStore = inject(StatsStore);
  private readonly router = inject(Router);

  async signOutAndRedirect(): Promise<void> {
    await this.session.signOut();
    this.offlineCache.clearAll();
    this.authStore.reset();
    this.tripStore.reset();
    this.itineraryStore.reset();
    this.expenseStore.reset();
    this.statsStore.reset();
    await this.router.navigateByUrl('/login');
  }
}
