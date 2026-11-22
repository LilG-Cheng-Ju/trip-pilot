import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { I18nService } from './core/i18n/i18n.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the Tripilot brand heading and switch locales', async () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('en');

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe('Tripilot');
    expect(compiled.querySelector('.tagline')?.textContent?.trim()).toBe(
      'Your pocket travel copilot.',
    );

    i18n.setLocale('zh-TW');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelector('.tagline')?.textContent?.trim()).toBe(
      '你的隨身行程副駕駛。',
    );
  });
});
