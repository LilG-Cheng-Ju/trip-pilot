import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TRIPILOT_DATE_FORMATS } from '../core/config/material-date-formats';
import { AppTimeInputComponent, formatTimeString, parseTimeString } from './time-input.component';

@Component({
  imports: [AppTimeInputComponent],
  template: `<app-time-input [value]="time()" (valueChange)="time.set($event)" />`,
})
class TestHostComponent {
  readonly time = signal('09:30');
}

describe('AppTimeInputComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        provideNativeDateAdapter(TRIPILOT_DATE_FORMATS),
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

  it('parses and formats 24-hour HH:MM strings accurately', () => {
    const parsed = parseTimeString('14:05');
    expect(parsed).not.toBeNull();
    expect(formatTimeString(parsed!)).toBe('14:05');
    expect(parseTimeString('')).toBeNull();
    expect(parseTimeString('25:99')).toBeNull();
  });

  it('renders an initial 24-hour time value and shows the clear button', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const clearBtn = fixture.nativeElement.querySelector('.clear-btn') as HTMLButtonElement | null;

    expect(input.value).toBe('09:30');
    expect(clearBtn).not.toBeNull();
  });

  it('updates bound value on valid manual keyboard input and ignores partial keystrokes', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    // Intermediate typing ("14:") should not erase the committed value.
    input.value = '14:';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.time()).toBe('09:30');

    // Completed valid time ("14:45") commits cleanly.
    input.value = '14:45';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.time()).toBe('14:45');
  });

  it('clears the time input and emits an empty string when clear is clicked', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const clearBtn = fixture.nativeElement.querySelector('.clear-btn') as HTMLButtonElement;
    clearBtn.click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(fixture.componentInstance.time()).toBe('');
    expect(input.value).toBe('');
    expect(fixture.nativeElement.querySelector('.clear-btn')).toBeNull();
  });
});
