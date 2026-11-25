import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { TripilotApiService } from '../../core/api/tripilot-api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { UserProfile } from '../../core/models/tripilot.models';
import { AuthStore } from '../../state/auth.store';
import { InvitePageComponent } from './invite-page.component';

describe('InvitePageComponent', () => {
  const friendProfile: UserProfile = {
    id: 'u-1',
    email: 'buddy@example.com',
    display_name: 'Buddy',
    role: 'FRIEND',
    is_active: true,
    last_login_at: '2026-11-25T10:00:00Z',
    home_country_code: 'TW',
    home_currency: 'TWD',
    created_at: '2026-11-25T09:00:00Z',
  };

  let apiMock: {
    getMe: ReturnType<typeof vi.fn>;
    redeemInviteCode: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    apiMock = {
      getMe: vi.fn().mockResolvedValue({ ...friendProfile, role: 'USER' }),
      redeemInviteCode: vi.fn().mockResolvedValue(friendProfile),
    };

    await TestBed.configureTestingModule({
      imports: [InvitePageComponent],
      providers: [
        provideRouter([{ path: 'trips', component: InvitePageComponent }]),
        provideHttpClient(),
        { provide: TripilotApiService, useValue: apiMock },
      ],
    }).compileComponents();
  });

  it('redeems an uppercase invite code and navigates to /trips', async () => {
    const i18n = TestBed.inject(I18nService);
    const router = TestBed.inject(Router);
    const authStore = TestBed.inject(AuthStore);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    i18n.setLocale('zh-TW');

    const fixture = TestBed.createComponent(InvitePageComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('需要邀請碼才能進入');

    const input = el.querySelector('input[name="inviteCode"]') as HTMLInputElement;
    input.value = 'tp-ab12-cd34';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const form = el.querySelector('form.invite-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(apiMock.redeemInviteCode).toHaveBeenCalledWith('TP-AB12-CD34');
    expect(authStore.isMember()).toBe(true);
    expect(navSpy).toHaveBeenCalledWith(['/trips']);
  });
});
