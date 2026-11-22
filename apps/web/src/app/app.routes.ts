import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'trips', pathMatch: 'full' },
  {
    path: 'trips',
    loadComponent: () =>
      import('./features/trips/trips-page.component').then((m) => m.TripsPageComponent),
  },
  {
    path: 'trips/:tripId',
    loadComponent: () =>
      import('./features/itinerary/itinerary-page.component').then(
        (m) => m.ItineraryPageComponent,
      ),
  },
  {
    path: 'trips/:tripId/expenses',
    loadComponent: () =>
      import('./features/expenses/expenses-page.component').then(
        (m) => m.ExpensesPageComponent,
      ),
  },
  {
    path: 'stats',
    loadComponent: () =>
      import('./features/stats/stats-page.component').then((m) => m.StatsPageComponent),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile-page.component').then(
        (m) => m.ProfilePageComponent,
      ),
  },
  {
    path: 's/:shareToken',
    loadComponent: () =>
      import('./features/share/public-share-page.component').then(
        (m) => m.PublicSharePageComponent,
      ),
  },
  { path: '**', redirectTo: 'trips' },
];
