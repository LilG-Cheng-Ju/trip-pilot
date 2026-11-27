import { Routes } from '@angular/router';

import { inviteGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'trips', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'invite',
    canActivate: [inviteGuard],
    loadComponent: () =>
      import('./features/auth/invite-page.component').then((m) => m.InvitePageComponent),
  },
  {
    path: 's/:shareToken',
    loadComponent: () =>
      import('./features/share/public-share-page.component').then(
        (m) => m.PublicSharePageComponent,
      ),
  },
  {
    path: '',
    loadChildren: () => import('./workspace.routes').then((m) => m.WORKSPACE_ROUTES),
  },
  { path: '**', redirectTo: 'trips' },
];
