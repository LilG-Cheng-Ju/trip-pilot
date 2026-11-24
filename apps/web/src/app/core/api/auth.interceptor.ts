import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';

import { AuthSessionService } from '../auth/auth-session.service';
import { getApiBaseUrl } from '../config/runtime-config';

function isProtectedApiRequest(url: string): boolean {
  const apiBase = getApiBaseUrl();
  const isRelativeApi = url.startsWith('/api/v1/');
  const isConfiguredApi = Boolean(apiBase) && url.startsWith(`${apiBase}/api/v1/`);
  if (!isRelativeApi && !isConfiguredApi) {
    return false;
  }
  const publicPrefix = isRelativeApi ? '/api/v1/public/' : `${apiBase}/api/v1/public/`;
  return !url.startsWith(publicPrefix);
}

/** Attaches Bearer authentication (Firebase ID Token or local DEV token) to configured /api/v1 calls. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isProtectedApiRequest(req.url)) {
    return next(req);
  }

  const session = inject(AuthSessionService);
  if (!session.isFirebaseEnabled()) {
    const token = session.getBearerToken();
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
  }

  return from(session.getFreshBearerToken()).pipe(
    switchMap((token) => {
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
    }),
  );
};
