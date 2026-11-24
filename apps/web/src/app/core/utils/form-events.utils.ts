/** Read string value from an HTML input or select DOM event. */
export function readInputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

/** Read checked boolean state from an HTML checkbox change event. */
export function readCheckedValue(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}

/** Return true while browser holds an incomplete numeric entry such as a trailing decimal point. */
export function isIncompleteNumberInput(event: Event): boolean {
  const input = event.target as HTMLInputElement;
  return input.value === '' && Boolean(input.validity?.badInput);
}

/** Read numeric input value, keeping current value while user types incomplete decimals. */
export function readNumberValue(event: Event, current: number | null): number | null {
  const input = event.target as HTMLInputElement;
  if (isIncompleteNumberInput(event)) {
    return current;
  }
  if (input.value === '') {
    return null;
  }
  const parsed = Number(input.value);
  return Number.isFinite(parsed) ? parsed : current;
}
