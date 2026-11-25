import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthSessionService } from '../../core/auth/auth-session.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { LoginPageComponent } from './login-page.component';

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

  it('renders bespoke cartographic vector pane without external Unsplash assets or glass pills', () => {
    const fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.carto-backdrop')).not.toBeNull();
    expect(host.querySelector('.editorial-features')?.querySelectorAll('li').length).toBe(3);
    expect(host.querySelector('.hero-headline')?.classList.contains('font-display')).toBe(true);
    expect(host.innerHTML).not.toContain('unsplash');
    expect(host.querySelector('.photo-credit')).toBeNull();
    expect(host.querySelector('.visual-tags')).toBeNull();
  });
});
