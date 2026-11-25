import { MAT_NATIVE_DATE_FORMATS, MatDateFormats } from '@angular/material/core';

/** Explicit 24-hour time formats shared across Material timepickers regardless of browser locale. */
export const TRIPILOT_DATE_FORMATS: MatDateFormats = {
  ...MAT_NATIVE_DATE_FORMATS,
  display: {
    ...MAT_NATIVE_DATE_FORMATS.display,
    timeInput: {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    },
    timeOptionLabel: {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    },
  },
};
