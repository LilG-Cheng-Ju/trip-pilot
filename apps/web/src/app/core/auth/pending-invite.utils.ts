const PENDING_INVITE_STORAGE_KEY = 'tripilot:pending_invite_code';

/** Persist a pending invite code across the login -> /invite redirect flow. */
export function savePendingInviteCode(raw: string | null | undefined): string | null {
  const normalized = raw?.trim().toUpperCase() ?? '';
  if (normalized.length < 4) {
    return null;
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, normalized);
    }
  } catch {
    // Ignore restricted storage environments.
  }
  return normalized;
}

/** Read any pending invite code saved prior to sign-in. */
export function readPendingInviteCode(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    const val = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)?.trim().toUpperCase() ?? '';
    return val.length >= 4 ? val : null;
  } catch {
    return null;
  }
}

/** Clear the pending invite code once consumed or rejected. */
export function clearPendingInviteCode(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    }
  } catch {
    // Ignore restricted storage environments.
  }
}
