import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'trips', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'trips',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trips/trips-page.component').then((m) => m.TripsPageComponent),
  },
  {
    path: 'trips/:tripId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/itinerary/itinerary-page.component').then(
        (m) => m.ItineraryPageComponent,
      ),
  },
  {
    path: 'trips/:tripId/brief',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/itinerary/trip-brief-page.component').then(
        (m) => m.TripBriefPageComponent,
      ),
  },
  {
    path: 'trips/:tripId/expenses',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/expenses/expenses-page.component').then(
        (m) => m.ExpensesPageComponent,
      ),
  },
  {
    path: 'stats',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/stats/stats-page.component').then((m) => m.StatsPageComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
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
