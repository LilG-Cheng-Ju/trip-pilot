import { TestBed } from '@angular/core/testing';

import { I18nService } from '../core/i18n/i18n.service';
import { AppConfirmModalComponent } from './confirm-modal.component';

describe('AppConfirmModalComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppConfirmModalComponent],
    }).compileComponents();
    TestBed.inject(I18nService).setLocale('en');
  });

  it('hides modal body when closed and renders title, message, and default labels when open', async () => {
    const fixture = TestBed.createComponent(AppConfirmModalComponent);
    fixture.componentRef.setInput('open', false);
    fixture.componentRef.setInput('title', 'Delete Trip');
    fixture.componentRef.setInput('message', 'Delete "Tokyo 2027"?');
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.modal-panel')).toBeNull();

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('.modal-title')?.textContent?.trim()).toBe('Delete Trip');
    expect(host.querySelector('.confirm-copy')?.textContent?.trim()).toBe('Delete "Tokyo 2027"?');
    const buttons = Array.from(host.querySelectorAll('.modal-actions button')) as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent?.trim()).toBe('Cancel');
    expect(buttons[1].textContent?.trim()).toBe('Delete');
    expect(buttons[1].classList.contains('btn-danger')).toBe(true);
  });

  it('supports primary tone, custom labels, and emits confirmed/cancelled', async () => {
    const fixture = TestBed.createComponent(AppConfirmModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('title', 'Apply Plan B');
    fixture.componentRef.setInput('message', 'Switch active plan?');
    fixture.componentRef.setInput('tone', 'primary');
    fixture.componentRef.setInput('confirmLabel', 'Switch');
    fixture.componentRef.setInput('cancelLabel', 'Keep Current');
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(host.querySelectorAll('.modal-actions button')) as HTMLButtonElement[];
    expect(buttons[0].textContent?.trim()).toBe('Keep Current');
    expect(buttons[1].textContent?.trim()).toBe('Switch');
    expect(buttons[1].classList.contains('btn-primary')).toBe(true);

    let confirmedCount = 0;
    let cancelledCount = 0;
    fixture.componentInstance.confirmed.subscribe(() => (confirmedCount += 1));
    fixture.componentInstance.cancelled.subscribe(() => (cancelledCount += 1));

    buttons[0].click();
    buttons[1].click();
    expect(cancelledCount).toBe(1);
    expect(confirmedCount).toBe(1);
  });

  it('disables actions and ignores events while busy', async () => {
    const fixture = TestBed.createComponent(AppConfirmModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('title', 'Delete Day');
    fixture.componentRef.setInput('message', 'Delete Day 2?');
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(host.querySelectorAll('.modal-actions button')) as HTMLButtonElement[];
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);

    let confirmedCount = 0;
    let cancelledCount = 0;
    fixture.componentInstance.confirmed.subscribe(() => (confirmedCount += 1));
    fixture.componentInstance.cancelled.subscribe(() => (cancelledCount += 1));

    const closeBtn = host.querySelector('.close-btn') as HTMLButtonElement;
    closeBtn.click();
    expect(cancelledCount).toBe(0);
    expect(confirmedCount).toBe(0);
  });
});
