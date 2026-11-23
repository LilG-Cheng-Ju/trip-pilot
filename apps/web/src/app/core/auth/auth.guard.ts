import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSessionService } from './auth-session.service';

/** Protects authenticated routes after waiting for Firebase Auth session restoration. */
export const authGuard: CanActivateFn = async () => {
  const session = inject(AuthSessionService);
  const router = inject(Router);
  if (!session.isFirebaseEnabled()) {
    return true;
  }
  await session.waitUntilReady();
  if (session.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
