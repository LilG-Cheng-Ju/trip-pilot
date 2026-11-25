import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  formatIsoDateString,
  parseIsoDateString,
  provideTripilotDateAdapter,
} from '../core/config/material-date-formats';
import { AppDateInputComponent } from './date-input.component';

@Component({
  imports: [AppDateInputComponent],
  template: `
    <app-date-input
      name="testDate"
      [allowClear]="true"
      [value]="date()"
      (valueChange)="date.set($event)"
    />
  `,
})
class TestHostComponent {
  readonly date = signal('2026-04-02');
}

describe('AppDateInputComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        provideTripilotDateAdapter(),
        {
          provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
          useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
        },
        {
          provide: OVERLAY_DEFAULT_CONFIG,
          useValue: { usePopover: true },
        },
      ],
    }).compileComponents();
  });

  it('parses and formats strict YYYY-MM-DD strings and rejects invalid calendar dates', () => {
    const parsed = parseIsoDateString('2026-04-02');
    expect(parsed).not.toBeNull();
    expect(formatIsoDateString(parsed!)).toBe('2026-04-02');
    expect(parseIsoDateString('2026-02-31')).toBeNull();
    expect(parseIsoDateString('2026-04')).toBeNull();
  });

  it('renders initial ISO date and updates on complete manual keyboard input', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[name="testDate"]') as HTMLInputElement;
    expect(input.value).toBe('2026-04-02');

    // Intermediate typing ("2026-05") must not change the committed date.
    input.value = '2026-05';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.date()).toBe('2026-04-02');

    // Completed ISO date ("2026-05-10") updates cleanly.
    input.value = '2026-05-10';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.date()).toBe('2026-05-10');
  });

  it('clears the date when allowClear is enabled and clear is clicked', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const clearBtn = fixture.nativeElement.querySelector('.clear-btn') as HTMLButtonElement;
    clearBtn.click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[name="testDate"]') as HTMLInputElement;
    expect(fixture.componentInstance.date()).toBe('');
    expect(input.value).toBe('');
  });
});
