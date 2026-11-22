import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthSessionService } from '../auth/auth-session.service';

/** Attaches Bearer authentication (Firebase ID Token or local DEV token) to /api/v1 calls. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/v1/') || req.url.includes('/api/v1/public/')) {
    return next(req);
  }

  const token = inject(AuthSessionService).getBearerToken();
  if (!token) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
};
