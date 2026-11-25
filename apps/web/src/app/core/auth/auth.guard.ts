import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../../state/auth.store';
import { AuthSessionService } from './auth-session.service';

async function hasAuthenticatedSession(session: AuthSessionService): Promise<boolean> {
  if (!session.isFirebaseEnabled()) {
    return true;
  }
  await session.waitUntilReady();
  return session.isAuthenticated();
}

/** Protects member routes by waiting for auth session and verifying invite approval. */
export const authGuard: CanActivateFn = async () => {
  const session = inject(AuthSessionService);
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (!(await hasAuthenticatedSession(session))) {
    return router.createUrlTree(['/login']);
  }

  const profile = await authStore.ensureProfileLoaded();
  if (authStore.suspended() || profile?.role === 'USER') {
    return router.createUrlTree(['/invite']);
  }
  return true;
};

/** Keeps the invite redemption gate restricted to unapproved or suspended accounts. */
export const inviteGuard: CanActivateFn = async () => {
  const session = inject(AuthSessionService);
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (!(await hasAuthenticatedSession(session))) {
    return router.createUrlTree(['/login']);
  }

  await authStore.ensureProfileLoaded();
  if (!authStore.suspended() && authStore.isMember()) {
    return router.createUrlTree(['/trips']);
  }
  return true;
};

/** Restricts lazy /admin routes to interactive OWNER or ADMIN accounts. */
export const adminGuard: CanActivateFn = async () => {
  const session = inject(AuthSessionService);
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (!(await hasAuthenticatedSession(session))) {
    return router.createUrlTree(['/login']);
  }

  const profile = await authStore.ensureProfileLoaded();
  if (authStore.isAdmin()) {
    return true;
  }
  if (authStore.suspended() || profile?.role === 'USER') {
    return router.createUrlTree(['/invite']);
  }
  return router.createUrlTree(['/trips']);
};
