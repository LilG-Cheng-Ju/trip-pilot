import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ApiTokenItem, UserProfile } from '../../core/models/tripilot.models';
import { AuthStore } from '../../state/auth.store';
import { ProfilePageComponent } from './profile-page.component';

describe('ProfilePageComponent', () => {
  const profile: UserProfile = {
    id: 'u-1',
    email: 'traveler@example.com',
    display_name: 'Traveler',
    role: 'FRIEND',
    is_active: true,
    last_login_at: '2026-11-27T00:00:00Z',
    home_country_code: 'TW',
    home_currency: 'TWD',
    created_at: '2026-11-01T00:00:00Z',
  };

  const activeToken: ApiTokenItem = {
    id: 'tok-1',
    name: 'Gemini CLI',
    token_prefix: 'tp_pat_abc',
    scopes: ['trips:read', 'trips:write'],
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: '2026-11-20T00:00:00Z',
  };

  let writeTextMock: ReturnType<typeof vi.fn>;
  let tokensResponse: ApiTokenItem[];
  let updateMeSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tokensResponse = [activeToken];
    writeTextMock = vi.fn(async () => undefined);
    updateMeSpy = vi.fn(
      async (payload: Partial<Pick<UserProfile, 'home_country_code' | 'home_currency'>>) => ({
        ...profile,
        ...payload,
      }),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    await TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: TripilotApiService,
          useValue: {
            getMe: async () => profile,
            updateMe: updateMeSpy,
            listTokens: async () => tokensResponse,
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
    TestBed.inject(AuthStore).reset();
  });

  it('shows AI Assistant Setup before Access Tokens even with zero active tokens, and switches setup tabs cleanly', async () => {
    tokensResponse = [];
    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const panelHeadings = Array.from(host.querySelectorAll('.panel h3')).map((el) =>
      el.textContent?.trim(),
    );
    expect(panelHeadings).toContain('AI Assistant Setup');
    expect(host.querySelector('.tokens-subpanel .mcp-subhead')?.textContent?.trim()).toBe(
      'Access Tokens',
    );
    expect(host.querySelector('.token-list')).toBeNull();

    const tabs = Array.from(host.querySelectorAll('.ai-tabs .ai-tab')) as HTMLButtonElement[];
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.connect-url')?.textContent?.trim()).toContain('/mcp');

    const copyJsonBtn = host.querySelector('.ai-action-btn.primary') as HTMLButtonElement;
    copyJsonBtn.click();
    await Promise.resolve();
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedJson = writeTextMock.mock.calls[0][0] as string;
    expect(copiedJson).toContain('"mcpServers"');
    expect(copiedJson).toContain('/mcp');
    expect(copiedJson).toContain('Bearer <YOUR_TRIPILOT_TOKEN>');

    // Switch to ChatGPT Custom GPT tab.
    tabs[1].click();
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.connect-url')?.textContent?.trim()).toContain(
      '/gpt-openapi.json',
    );
    expect(host.querySelectorAll('.ai-steps li')).toHaveLength(2);

    const copyGptBtn = host.querySelector('.ai-action-btn.primary') as HTMLButtonElement;
    copyGptBtn.click();
    await Promise.resolve();
    expect(writeTextMock).toHaveBeenCalledTimes(2);
    expect(writeTextMock.mock.calls[1][0]).toContain('search_places');
    expect(host.querySelector('.ai-footnote')?.textContent).toContain('Gemini');
  });

  it('lists active tokens cleanly with created date instead of internal permission scopes', async () => {
    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.token-count')?.textContent?.trim()).toBe('1');
    const meta = host.querySelector('.token-meta')?.textContent?.trim() ?? '';
    expect(meta).toContain('tp_pat_abc… · 2026-11-20');
    expect(meta).not.toContain('trips:read');
  });

  it('auto-saves travel preferences silently and rolls back with error banner on failure', async () => {
    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.pref-actions')).toBeNull();
    expect(host.querySelector('.saved-badge')).toBeNull();
    expect(host.querySelector('app-country-picker .single-value')?.textContent?.trim()).toBe(
      'Taiwan (TW)',
    );
    expect(host.querySelector('app-country-picker .chip')).toBeNull();

    const component = fixture.componentInstance as unknown as {
      homeCurrency: () => string;
      homeCountry: () => string;
      onHomeCurrencyChange: (currency: string) => Promise<void>;
      onHomeCountryChange: (code: string | undefined) => Promise<void>;
    };

    await component.onHomeCurrencyChange('JPY');
    fixture.detectChanges();

    expect(updateMeSpy).toHaveBeenCalledWith({ home_currency: 'JPY' });
    expect(component.homeCurrency()).toBe('JPY');
    expect(host.querySelector('.saved-badge')).toBeNull();

    updateMeSpy.mockRejectedValueOnce(new Error('Network offline'));
    await component.onHomeCountryChange('JP');
    fixture.detectChanges();

    expect(component.homeCountry()).toBe('TW');
    expect(host.querySelector('.error-banner')?.textContent).toContain('Network offline');
  });
});
