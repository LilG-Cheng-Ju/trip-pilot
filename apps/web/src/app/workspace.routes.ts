import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { Routes } from '@angular/router';

import { adminGuard, authGuard } from './core/auth/auth.guard';
import { provideTripilotDateAdapter } from './core/config/material-date-formats';

/** Lazy-loaded authenticated workspace routes that share Angular Material form & date providers. */
export const WORKSPACE_ROUTES: Routes = [
  {
    path: '',
    providers: [
      provideTripilotDateAdapter(),
      {
        provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
        useValue: {
          appearance: 'outline',
          subscriptSizing: 'dynamic',
        },
      },
    ],
    children: [
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
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/admin-page.component').then((m) => m.AdminPageComponent),
      },
    ],
  },
];
