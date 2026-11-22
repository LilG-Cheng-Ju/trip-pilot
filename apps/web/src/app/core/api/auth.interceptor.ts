import { HttpInterceptorFn } from '@angular/common/http';

const AUTH_TOKEN_STORAGE_KEY = 'tripilot.authToken';
const DEFAULT_DEV_TOKEN = 'dev-local-user';

export function getStoredAuthToken(): string {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || DEFAULT_DEV_TOKEN;
  } catch {
    return DEFAULT_DEV_TOKEN;
  }
}

export function setStoredAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token.trim() || DEFAULT_DEV_TOKEN);
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

/** Attaches Bearer authentication to /api/v1 requests (excluding public share links). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/v1/') || req.url.startsWith('/api/v1/public/')) {
    return next(req);
  }

  const token = getStoredAuthToken();
  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
};
