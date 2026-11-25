import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_NATIVE_DATE_FORMATS,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';

const FULL_DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

/** Parse a complete YYYY-MM-DD (or YYYY/M/D) string into local midnight without UTC drift. */
export function parseIsoDateString(raw: string): Date | null {
  const match = FULL_DATE_RE.exec(raw.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Format a valid Date as YYYY-MM-DD using local calendar fields. */
export function formatIsoDateString(date: Date): string {
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** NativeDateAdapter extension enforcing local ISO YYYY-MM-DD input/display consistency. */
@Injectable()
export class TripilotDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      // Require full year-month-day separators so intermediate typing like "2026-04" never commits Apr 1.
      const iso = parseIsoDateString(trimmed);
      return iso ?? this.invalid();
    }
    return super.parse(value);
  }

  override format(date: Date, displayFormat: object | string): string {
    if (displayFormat === 'iso') {
      if (!this.isValid(date)) {
        throw new Error('TripilotDateAdapter: Cannot format invalid date.');
      }
      return formatIsoDateString(date);
    }
    return super.format(date, displayFormat);
  }
}

/** Explicit ISO date + 24-hour time formats shared across Material pickers regardless of browser locale. */
export const TRIPILOT_DATE_FORMATS: MatDateFormats = {
  ...MAT_NATIVE_DATE_FORMATS,
  display: {
    ...MAT_NATIVE_DATE_FORMATS.display,
    dateInput: 'iso',
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

/** Provide Tripilot's ISO-consistent date adapter and formats for Material pickers. */
export function provideTripilotDateAdapter(): Provider[] {
  return [
    { provide: DateAdapter, useClass: TripilotDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: TRIPILOT_DATE_FORMATS },
  ];
}
