/** Centralized frontend thresholds, validation bounds, and UI timing constants. */

export const MS_PER_DAY = 86_400_000;

/**
 * Maximum days in advance to display the "Starts in X days" countdown badge.
 * Trips starting further out omit the countdown pill to reduce noise.
 */
export const TRIP_COUNTDOWN_MAX_DAYS: number | null = 180;

export const MIN_TRIP_DURATION_DAYS = 1;
export const MAX_TRIP_DURATION_DAYS = 60;
export const DEFAULT_TRIP_DURATION_DAYS = 4;

export const MIN_PASSWORD_LENGTH = 6;
export const ISO_CURRENCY_CODE_LENGTH = 3;

export const COPY_FEEDBACK_DURATION_MS = 1600;
export const SHARE_COPY_FEEDBACK_DURATION_MS = 1800;
export const SAVE_NOTICE_DURATION_MS = 2000;

export const DAY_STRIP_SCROLL_STEP_PX = 200;
export const COORDINATE_EPSILON = 1e-5;
