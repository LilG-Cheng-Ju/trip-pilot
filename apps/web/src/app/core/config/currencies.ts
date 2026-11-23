export interface CurrencyOption {
  code: string;
  label: string;
}

export const COMMON_CURRENCIES: readonly CurrencyOption[] = [
  { code: 'TWD', label: 'TWD · NT$' },
  { code: 'JPY', label: 'JPY · ¥' },
  { code: 'KRW', label: 'KRW · ₩' },
  { code: 'USD', label: 'USD · $' },
  { code: 'EUR', label: 'EUR · €' },
  { code: 'GBP', label: 'GBP · £' },
  { code: 'THB', label: 'THB · ฿' },
  { code: 'SGD', label: 'SGD · S$' },
  { code: 'HKD', label: 'HKD · HK$' },
  { code: 'CNY', label: 'CNY · ¥' },
  { code: 'AUD', label: 'AUD · A$' },
  { code: 'CAD', label: 'CAD · C$' },
  { code: 'CHF', label: 'CHF · Fr' },
  { code: 'VND', label: 'VND · ₫' },
  { code: 'MYR', label: 'MYR · RM' },
  { code: 'PHP', label: 'PHP · ₱' },
  { code: 'IDR', label: 'IDR · Rp' },
];
