import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { I18nService } from './core/i18n/i18n.service';
import { TranslatePipe } from './core/i18n/translate.pipe';
import { TripStore } from './state/trip.store';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly i18n = inject(I18nService);
  protected readonly tripStore = inject(TripStore);
  private readonly router = inject(Router);

  protected readonly isPublicShareRoute = computed(() =>
    this.router.url.startsWith('/s/'),
  );

  protected readonly itineraryRoute = computed(() => {
    const id = this.tripStore.lastSelectedTripId();
    return id ? ['/trips', id] : ['/trips'];
  });
}
