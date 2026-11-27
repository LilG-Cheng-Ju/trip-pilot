import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ItineraryItem } from '../../core/models/tripilot.models';
import { ItemExpenseSummary } from '../../state/expense.store';
import { ItineraryFlightCardComponent } from './itinerary-flight-card.component';
import { ItineraryTransitCardComponent } from './itinerary-transit-card.component';
import { ItineraryVenueCardComponent } from './itinerary-venue-card.component';

/** Thin presentational dispatcher routing each ItineraryItem to its specialized card component. */
@Component({
  selector: 'app-itinerary-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ItineraryTransitCardComponent,
    ItineraryFlightCardComponent,
    ItineraryVenueCardComponent,
  ],
  template: `
    @if (item().type === 'LOCAL_TRANSIT') {
      <app-itinerary-transit-card
        [item]="item()"
        [readOnly]="readOnly()"
        [canMoveUp]="canMoveUp()"
        [canMoveDown]="canMoveDown()"
        (moveUp)="moveUp.emit($event)"
        (moveDown)="moveDown.emit($event)"
        (logExpense)="logExpense.emit($event)"
        (edited)="edited.emit($event)"
        (deleted)="deleted.emit($event)"
      />
    } @else if (item().type === 'FLIGHT') {
      <app-itinerary-flight-card
        [item]="item()"
        [tripId]="tripId()"
        [selected]="selected()"
        [readOnly]="readOnly()"
        [canMoveUp]="canMoveUp()"
        [canMoveDown]="canMoveDown()"
        [expenseSummary]="expenseSummary()"
        (cardClicked)="cardClicked.emit($event)"
        (moveUp)="moveUp.emit($event)"
        (moveDown)="moveDown.emit($event)"
        (logExpense)="logExpense.emit($event)"
        (edited)="edited.emit($event)"
        (deleted)="deleted.emit($event)"
      />
    } @else {
      <app-itinerary-venue-card
        [item]="item()"
        [tripId]="tripId()"
        [pinOrder]="pinOrder()"
        [selected]="selected()"
        [readOnly]="readOnly()"
        [canMoveUp]="canMoveUp()"
        [canMoveDown]="canMoveDown()"
        [expenseSummary]="expenseSummary()"
        (cardClicked)="cardClicked.emit($event)"
        (moveUp)="moveUp.emit($event)"
        (moveDown)="moveDown.emit($event)"
        (addAlternative)="addAlternative.emit($event)"
        (logExpense)="logExpense.emit($event)"
        (edited)="edited.emit($event)"
        (deleted)="deleted.emit($event)"
      />
    }
  `,
})
export class ItineraryCardComponent {
  readonly item = input.required<ItineraryItem>();
  readonly tripId = input<string>('');
  readonly pinOrder = input<number | null>(null);
  readonly selected = input(false);
  readonly readOnly = input(false);
  readonly canMoveUp = input(true);
  readonly canMoveDown = input(true);
  readonly expenseSummary = input<ItemExpenseSummary | null>(null);

  readonly cardClicked = output<string>();
  readonly moveUp = output<ItineraryItem>();
  readonly moveDown = output<ItineraryItem>();
  readonly addAlternative = output<ItineraryItem>();
  readonly logExpense = output<ItineraryItem>();
  readonly edited = output<ItineraryItem>();
  readonly deleted = output<string>();
}
