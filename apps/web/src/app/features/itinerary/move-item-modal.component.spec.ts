import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ItineraryItem, TripDay } from '../../core/models/tripilot.models';
import { MoveItemConfirmEvent, MoveItemModalComponent } from './move-item-modal.component';

function buildDay(
  id: string,
  dayIndex: number,
  date: string,
  optionIds: string[],
  title: string | null = null,
): TripDay {
  return {
    id,
    trip_id: 'trip-1',
    day_index: dayIndex,
    date,
    title,
    active_option_id: optionIds[0],
    notes: null,
    options: optionIds.map((optId, idx) => ({
      id: optId,
      trip_day_id: id,
      label: idx === 0 ? 'Plan A' : 'Plan B',
      sort_order: idx,
      summary_notes: null,
      cached_ground_distance_km: 0,
      cached_distance_is_approx: false,
      items: [],
      route_segments: [],
    })),
  };
}

@Component({
  imports: [MoveItemModalComponent],
  template: `
    <app-move-item-modal
      [open]="open()"
      [item]="item()"
      [days]="days"
      [currentOptionId]="currentOptionId"
      (confirmed)="lastConfirm = $event"
    />
  `,
})
class TestHostComponent {
  readonly open = signal(true);
  readonly item = signal<ItineraryItem | null>({
    id: 'item-1',
    day_option_id: 'opt-1',
    type: 'SPOT',
    sort_order: 0,
    title: 'Senso-ji',
    start_time: '09:30',
    end_time: null,
    timezone: null,
    address: null,
    latitude: null,
    longitude: null,
    google_maps_url: null,
    notes: null,
    details: {},
    choice_group_id: null,
    is_selected: true,
  });
  readonly days: readonly TripDay[] = [
    buildDay('day-1', 1, '2026-10-01', ['opt-1'], 'Asakusa'),
    buildDay('day-2', 2, '2026-10-02', ['opt-2a', 'opt-2b'], 'Shibuya'),
  ];
  readonly currentOptionId = 'opt-1';
  lastConfirm: MoveItemConfirmEvent | null = null;
}

describe('MoveItemModalComponent', () => {
  it('disables current option and emits confirmed target option on selection', async () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const currentBtn = el.querySelector('.day-card.current') as HTMLButtonElement;
    expect(currentBtn.disabled).toBe(true);

    const confirmBtn = el.querySelector('.modal-actions .btn-primary') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    const planPills = el.querySelectorAll('.plan-chip');
    expect(planPills.length).toBe(2);
    (planPills[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(confirmBtn.disabled).toBe(false);
    confirmBtn.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.lastConfirm).toEqual({
      itemId: 'item-1',
      targetOptionId: 'opt-2b',
    });
  });
});
