import { HttpErrorResponse, HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, tap } from 'rxjs';

import { getApiBaseUrl } from '../config/runtime-config';
import { BackendWakeService } from '../network/backend-wake.service';

function isTripilotApiRequest(url: string): boolean {
  const apiBase = getApiBaseUrl();
  if (url.startsWith('/api/v1/')) {
    return true;
  }
  return Boolean(apiBase) && url.startsWith(`${apiBase}/api/v1/`);
}

/** Reports Tripilot API latency so BackendWakeService reveals the cold-start overlay when needed. */
export const backendWakeInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isTripilotApiRequest(req.url)) {
    return next(req);
  }

  const wake = inject(BackendWakeService);
  wake.beginRequest();

  let settled = false;
  const finish = (responded: boolean): void => {
    if (settled) {
      return;
    }
    settled = true;
    wake.endRequest(responded);
  };

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          finish(true);
        }
      },
      error: (err: unknown) => {
        const responded = err instanceof HttpErrorResponse && err.status > 0;
        finish(responded);
      },
    }),
    finalize(() => {
      finish(false);
    }),
  );
};
