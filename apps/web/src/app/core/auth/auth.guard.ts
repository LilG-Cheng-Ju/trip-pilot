import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSessionService } from './auth-session.service';

/** Protects authenticated routes only when cloud Firebase Auth is enabled. */
export const authGuard: CanActivateFn = () => {
  const session = inject(AuthSessionService);
  const router = inject(Router);
  if (!session.isFirebaseEnabled() || session.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
