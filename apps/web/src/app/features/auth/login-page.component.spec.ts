import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { LoginPageComponent } from './login-page.component';
import { LOGIN_PREVIEW_SLIDES, shufflePreviewSlides } from './login-preview-slides';

describe('LoginPageComponent', () => {
  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: AuthSessionService,
          useValue: {
            isFirebaseEnabled: () => false,
            signInWithEmail: async () => undefined,
            signUpWithEmail: async () => undefined,
            signInWithGoogle: async () => undefined,
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shuffles curated multi-country slides without mutating source order', () => {
    const firstOrder = LOGIN_PREVIEW_SLIDES.map((s) => s.code);
    const reversed = shufflePreviewSlides(LOGIN_PREVIEW_SLIDES, () => 0);

    expect(LOGIN_PREVIEW_SLIDES.map((s) => s.code)).toEqual(firstOrder);
    expect(reversed.map((s) => s.code)).toEqual(['CZ', 'KR', 'IS', 'CH', 'FR', 'JP']);
    expect(reversed.map((s) => s.code).sort()).toEqual(['CH', 'CZ', 'FR', 'IS', 'JP', 'KR']);
  });

  it('renders rotating multi-trip product artifacts without generic AI beacons or stock photos', () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.carto-backdrop')).not.toBeNull();
    expect(host.querySelector('.artifact-stage')).not.toBeNull();
    expect(host.querySelector('.hero-headline')?.classList.contains('font-display')).toBe(true);
    expect(host.innerHTML).not.toContain('unsplash');
    expect(host.querySelector('.beacon-pulse')).toBeNull();
    expect(host.querySelector('.editorial-features')).toBeNull();
    expect(host.querySelector('.photo-credit')).toBeNull();
    expect(host.querySelector('.visual-tags')).toBeNull();

    const switchBtns = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.artifact-switch-btn'),
    );
    expect(switchBtns.map((b) => b.textContent?.trim()).sort()).toEqual([
      'CH',
      'CZ',
      'FR',
      'IS',
      'JP',
      'KR',
    ]);

    const icelandBtn = switchBtns.find((b) => b.textContent?.trim() === 'IS');
    expect(icelandBtn).toBeDefined();
    icelandBtn!.click();
    fixture.detectChanges();

    expect(host.querySelector('.artifact-flight')?.textContent).toContain('FI529');
    expect(host.querySelector('.artifact-flight')?.textContent).toContain('KEF');
    expect(host.querySelector('.artifact-paper')?.textContent).toContain('Hallgrímskirkja');

    const czechBtn = switchBtns.find((b) => b.textContent?.trim() === 'CZ');
    expect(czechBtn).toBeDefined();
    czechBtn!.click();
    fixture.detectChanges();

    expect(host.querySelector('.artifact-flight')?.textContent).toContain('CI067');
    expect(host.querySelector('.artifact-flight')?.textContent).toContain('PRG');
    expect(host.querySelector('.artifact-paper')?.textContent).toContain('Prague Old Town');
  });
});
