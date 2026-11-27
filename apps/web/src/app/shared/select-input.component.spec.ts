import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { AppSelectComponent, SelectOption } from './select-input.component';

@Component({
  imports: [AppSelectComponent],
  template: `
    <app-select
      name="currency"
      ariaLabel="Currency"
      [options]="options"
      [value]="selected()"
      [disabled]="disabled()"
      [compact]="compact()"
      [bold]="bold()"
      selectClass="custom-select"
      (valueChange)="selected.set($event)"
    />
  `,
})
class TestHostComponent {
  readonly options: readonly SelectOption[] = [
    { value: 'JPY', label: 'JPY · Japanese Yen' },
    { value: 'TWD', label: 'TWD · Taiwan Dollar' },
  ];
  readonly selected = signal('JPY');
  readonly disabled = signal(false);
  readonly compact = signal(false);
  readonly bold = signal(false);
}

describe('AppSelectComponent', () => {
  it('renders options, forwards attributes, and emits valueChange on selection', async () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const hostEl = fixture.nativeElement as HTMLElement;
    const matSelectDebug = fixture.debugElement.query(By.directive(MatSelect));
    const matSelect = matSelectDebug.componentInstance as MatSelect;

    expect(hostEl.querySelector('mat-select[name="currency"].custom-select')).toBeTruthy();
    expect(matSelect.options.map((opt) => opt.viewValue.trim())).toEqual([
      'JPY · Japanese Yen',
      'TWD · Taiwan Dollar',
    ]);

    matSelect.selectionChange.emit(new MatSelectChange(matSelect, 'TWD'));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe('TWD');
  });

  it('applies compact, bold, and disabled states', async () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.compact.set(true);
    fixture.componentInstance.bold.set(true);
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const hostEl = fixture.nativeElement as HTMLElement;
    const formField = hostEl.querySelector('mat-form-field.select-field');
    const matSelect = fixture.debugElement.query(By.directive(MatSelect))
      .componentInstance as MatSelect;

    expect(formField?.classList.contains('compact')).toBe(true);
    expect(hostEl.querySelector('mat-select.custom-select.bold-trigger')).toBeTruthy();
    expect(matSelect.disabled).toBe(true);
  });
});
