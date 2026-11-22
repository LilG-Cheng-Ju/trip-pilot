import { Routes } from '@angular/router';

import { TripsPageComponent } from './features/trips/trips-page.component';

export const routes: Routes = [
  { path: '', redirectTo: 'trips', pathMatch: 'full' },
  { path: 'trips', component: TripsPageComponent },
  { path: '**', redirectTo: 'trips' },
];
