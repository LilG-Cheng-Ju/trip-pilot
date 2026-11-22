export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId?: string;
}

export interface TripilotRuntimeConfig {
  apiBaseUrl?: string;
  firebase?: FirebaseWebConfig;
}

declare global {
  interface Window {
    __TRIPILOT_CONFIG__?: TripilotRuntimeConfig;
  }
}

export function getRuntimeConfig(): TripilotRuntimeConfig {
  if (typeof window === 'undefined') {
    return {};
  }
  return window.__TRIPILOT_CONFIG__ ?? {};
}

export function getApiBaseUrl(): string {
  const configured = getRuntimeConfig().apiBaseUrl?.trim() ?? '';
  return configured.replace(/\/+$/, '');
}
