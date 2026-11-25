import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { ViewportService } from '../../core/utils/viewport.service';
import { PublicSharePageComponent } from './public-share-page.component';

describe('PublicSharePageComponent', () => {
  it('omits desktop map pane on mobile viewports so only one WebGL context can mount', () => {
    TestBed.configureTestingModule({
      imports: [PublicSharePageComponent],
      providers: [provideRouter([]), provideHttpClient()],
    });

    const viewport = TestBed.inject(ViewportService);
    viewport.isDesktop.set(false);

    const fixture = TestBed.createComponent(PublicSharePageComponent);
    fixture.componentInstance['trip'].set({
      title: 'Kyoto',
      destination_summary: 'Kyoto',
      country_codes: ['JP'],
      start_date: '2026-11-24',
      end_date: '2026-11-24',
      default_currency: 'JPY',
      cover_image_url: null,
      notes: null,
      visibility_policy: {
        include_booking_refs: false,
        include_notes: false,
        include_expenses: false,
        include_backup_options: false,
      },
      days: [],
    });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.desktop-map-pane')).toBeNull();

    viewport.isDesktop.set(true);
    fixture.detectChanges();
    expect(host.querySelector('.desktop-map-pane')).not.toBeNull();
  });
});
