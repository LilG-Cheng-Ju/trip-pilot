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

  beforeEach(async () => {
    writeTextMock = vi.fn(async () => undefined);
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
            listTokens: async () => [activeToken],
          },
        },
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLocale('en');
    TestBed.inject(AuthStore).reset();
  });

  it('switches cleanly between MCP Clients and ChatGPT OpenAPI setup instructions', async () => {
    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
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
});
