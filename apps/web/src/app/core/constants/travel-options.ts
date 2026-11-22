export interface CurrencyOption {
  code: string;
  labelEn: string;
  labelZh: string;
}

export interface CountryOption {
  code: string;
  nameEn: string;
  nameZh: string;
  defaultCurrency: string;
}

/** Curated 6 core currencies for fast dropdown selection. */
export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { code: 'TWD', labelEn: 'TWD — New Taiwan Dollar', labelZh: 'TWD 新台幣' },
  { code: 'JPY', labelEn: 'JPY — Japanese Yen', labelZh: 'JPY 日圓' },
  { code: 'USD', labelEn: 'USD — US Dollar', labelZh: 'USD 美金' },
  { code: 'CNY', labelEn: 'CNY — Chinese Yuan', labelZh: 'CNY 人民幣' },
  { code: 'EUR', labelEn: 'EUR — Euro', labelZh: 'EUR 歐元' },
  { code: 'KRW', labelEn: 'KRW — South Korean Won', labelZh: 'KRW 韓元' },
];

/** Common travel & home countries with automatic default currency mapping. */
export const SUPPORTED_COUNTRIES: readonly CountryOption[] = [
  { code: 'TW', nameEn: 'Taiwan', nameZh: '台灣', defaultCurrency: 'TWD' },
  { code: 'JP', nameEn: 'Japan', nameZh: '日本', defaultCurrency: 'JPY' },
  { code: 'KR', nameEn: 'South Korea', nameZh: '韓國', defaultCurrency: 'KRW' },
  { code: 'HK', nameEn: 'Hong Kong', nameZh: '香港', defaultCurrency: 'USD' },
  { code: 'CN', nameEn: 'China', nameZh: '中國', defaultCurrency: 'CNY' },
  { code: 'SG', nameEn: 'Singapore', nameZh: '新加坡', defaultCurrency: 'USD' },
  { code: 'TH', nameEn: 'Thailand', nameZh: '泰國', defaultCurrency: 'USD' },
  { code: 'VN', nameEn: 'Vietnam', nameZh: '越南', defaultCurrency: 'USD' },
  { code: 'US', nameEn: 'United States', nameZh: '美國', defaultCurrency: 'USD' },
  { code: 'CA', nameEn: 'Canada', nameZh: '加拿大', defaultCurrency: 'USD' },
  { code: 'GB', nameEn: 'United Kingdom', nameZh: '英國', defaultCurrency: 'EUR' },
  { code: 'FR', nameEn: 'France', nameZh: '法國', defaultCurrency: 'EUR' },
  { code: 'DE', nameEn: 'Germany', nameZh: '德國', defaultCurrency: 'EUR' },
  { code: 'IT', nameEn: 'Italy', nameZh: '義大利', defaultCurrency: 'EUR' },
  { code: 'CH', nameEn: 'Switzerland', nameZh: '瑞士', defaultCurrency: 'EUR' },
  { code: 'ES', nameEn: 'Spain', nameZh: '西班牙', defaultCurrency: 'EUR' },
  { code: 'AU', nameEn: 'Australia', nameZh: '澳洲', defaultCurrency: 'USD' },
  { code: 'NZ', nameEn: 'New Zealand', nameZh: '紐西蘭', defaultCurrency: 'USD' },
];

export function findCountry(code: string): CountryOption | undefined {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code.toUpperCase());
}
