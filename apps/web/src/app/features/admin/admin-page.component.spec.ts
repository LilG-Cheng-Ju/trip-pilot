import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import {
  AdminUserItem,
  InviteCodeItem,
  UserProfile,
} from '../../core/models/tripilot.models';
import { AdminPageComponent } from './admin-page.component';

describe('AdminPageComponent', () => {
  const ownerProfile: UserProfile = {
    id: 'owner-1',
    email: 'billlcj104@gmail.com',
    display_name: 'Owner',
    role: 'OWNER',
    is_active: true,
    last_login_at: '2026-11-25T10:00:00Z',
    home_country_code: 'TW',
    home_currency: 'TWD',
    created_at: '2026-11-25T08:00:00Z',
  };

  const buddyUser: AdminUserItem = {
    id: 'user-2',
    email: 'friend@example.test',
    display_name: 'Travel Buddy',
    role: 'USER',
    is_active: true,
    trip_count: 2,
    active_token_count: 1,
    last_login_at: '2026-11-25T09:30:00Z',
    created_at: '2026-11-25T09:00:00Z',
  };

  const sampleInvite: InviteCodeItem = {
    id: 'inv-1',
    code: 'TP-K7M9-X2P4',
    note: 'College group',
    is_used: false,
    used_by_user_id: null,
    used_by_email: null,
    used_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: '2026-11-25T09:00:00Z',
    status: 'available',
  };

  let apiMock: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    apiMock = {
      getMe: vi.fn().mockResolvedValue(ownerProfile),
      listAdminUsers: vi.fn().mockResolvedValue({
        total: 2,
        active_friends_count: 1,
        available_invites_count: 1,
        items: [
          {
            ...ownerProfile,
            trip_count: 3,
            active_token_count: 1,
          },
          buddyUser,
        ],
      }),
      listAdminInvites: vi.fn().mockResolvedValue([sampleInvite]),
      updateAdminUser: vi.fn().mockResolvedValue({ ...buddyUser, role: 'FRIEND' }),
      createAdminInvites: vi.fn().mockResolvedValue([sampleInvite]),
      revokeAdminUserTokens: vi.fn().mockResolvedValue({ revoked_count: 1 }),
      deleteAdminUser: vi.fn().mockResolvedValue(undefined),
      revokeAdminInvite: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AdminPageComponent],
      providers: [
        provideHttpClient(),
        { provide: TripilotApiService, useValue: apiMock },
      ],
    }).compileComponents();
  });

  it('loads users and switches cleanly to Invite Codes tab to generate batches', async () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('zh-TW');

    const fixture = TestBed.createComponent(AdminPageComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('管理後台');
    expect(el.textContent).toContain('Travel Buddy');

    // Role select is hidden on self OWNER row and present on manageable user row.
    const roleSelects = el.querySelectorAll('select.role-select');
    expect(roleSelects.length).toBe(1);

    const tabs = el.querySelectorAll('.tab-switch button.seg-btn');
    (tabs[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el.textContent).toContain('TP-K7M9-X2P4');

    const genForm = el.querySelector('form.invite-gen-form') as HTMLFormElement;
    genForm.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(apiMock['createAdminInvites']).toHaveBeenCalledWith({
      count: 3,
      note: null,
      expires_in_days: null,
    });
  });
});
