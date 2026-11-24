export interface CurrencyOption {
  code: string;
  labelEn: string;
  labelZh: string;
}

export interface QuickCurrencyOption {
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

/** Common currency choices for multi-currency expense logging. */
export const COMMON_CURRENCIES: readonly QuickCurrencyOption[] = [
  { code: 'TWD', labelEn: 'TWD · NT$', labelZh: '台幣 (TWD)' },
  { code: 'JPY', labelEn: 'JPY · ¥', labelZh: '日圓 (JPY)' },
  { code: 'KRW', labelEn: 'KRW · ₩', labelZh: '韓元 (KRW)' },
  { code: 'USD', labelEn: 'USD · $', labelZh: '美金 (USD)' },
  { code: 'EUR', labelEn: 'EUR · €', labelZh: '歐元 (EUR)' },
  { code: 'GBP', labelEn: 'GBP · £', labelZh: '英鎊 (GBP)' },
  { code: 'THB', labelEn: 'THB · ฿', labelZh: '泰銖 (THB)' },
  { code: 'SGD', labelEn: 'SGD · S$', labelZh: '新幣 (SGD)' },
  { code: 'HKD', labelEn: 'HKD · HK$', labelZh: '港幣 (HKD)' },
  { code: 'CNY', labelEn: 'CNY · ¥', labelZh: '人民幣 (CNY)' },
  { code: 'AUD', labelEn: 'AUD · A$', labelZh: '澳幣 (AUD)' },
  { code: 'CAD', labelEn: 'CAD · C$', labelZh: '加幣 (CAD)' },
  { code: 'CHF', labelEn: 'CHF · Fr', labelZh: '瑞郎 (CHF)' },
  { code: 'VND', labelEn: 'VND · ₫', labelZh: '越南盾 (VND)' },
  { code: 'MYR', labelEn: 'MYR · RM', labelZh: '馬幣 (MYR)' },
  { code: 'PHP', labelEn: 'PHP · ₱', labelZh: '菲幣 (PHP)' },
  { code: 'IDR', labelEn: 'IDR · Rp', labelZh: '印尼盾 (IDR)' },
];

/** Broad global travel country list with bilingual labels and default currency. */
export const SUPPORTED_COUNTRIES: readonly CountryOption[] = [
  // East & Southeast Asia
  { code: 'TW', nameEn: 'Taiwan', nameZh: '台灣', defaultCurrency: 'TWD' },
  { code: 'JP', nameEn: 'Japan', nameZh: '日本', defaultCurrency: 'JPY' },
  { code: 'KR', nameEn: 'South Korea', nameZh: '韓國', defaultCurrency: 'KRW' },
  { code: 'HK', nameEn: 'Hong Kong', nameZh: '香港', defaultCurrency: 'USD' },
  { code: 'MO', nameEn: 'Macau', nameZh: '澳門', defaultCurrency: 'USD' },
  { code: 'CN', nameEn: 'China', nameZh: '中國', defaultCurrency: 'CNY' },
  { code: 'SG', nameEn: 'Singapore', nameZh: '新加坡', defaultCurrency: 'USD' },
  { code: 'TH', nameEn: 'Thailand', nameZh: '泰國', defaultCurrency: 'USD' },
  { code: 'VN', nameEn: 'Vietnam', nameZh: '越南', defaultCurrency: 'USD' },
  { code: 'MY', nameEn: 'Malaysia', nameZh: '馬來西亞', defaultCurrency: 'USD' },
  { code: 'ID', nameEn: 'Indonesia', nameZh: '印尼', defaultCurrency: 'USD' },
  { code: 'PH', nameEn: 'Philippines', nameZh: '菲律賓', defaultCurrency: 'USD' },
  { code: 'KH', nameEn: 'Cambodia', nameZh: '柬埔寨', defaultCurrency: 'USD' },
  { code: 'IN', nameEn: 'India', nameZh: '印度', defaultCurrency: 'USD' },
  // Central, Western, Southern & Northern Europe
  { code: 'CZ', nameEn: 'Czechia', nameZh: '捷克', defaultCurrency: 'EUR' },
  { code: 'AT', nameEn: 'Austria', nameZh: '奧地利', defaultCurrency: 'EUR' },
  { code: 'HU', nameEn: 'Hungary', nameZh: '匈牙利', defaultCurrency: 'EUR' },
  { code: 'DE', nameEn: 'Germany', nameZh: '德國', defaultCurrency: 'EUR' },
  { code: 'CH', nameEn: 'Switzerland', nameZh: '瑞士', defaultCurrency: 'EUR' },
  { code: 'FR', nameEn: 'France', nameZh: '法國', defaultCurrency: 'EUR' },
  { code: 'IT', nameEn: 'Italy', nameZh: '義大利', defaultCurrency: 'EUR' },
  { code: 'ES', nameEn: 'Spain', nameZh: '西班牙', defaultCurrency: 'EUR' },
  { code: 'PT', nameEn: 'Portugal', nameZh: '葡萄牙', defaultCurrency: 'EUR' },
  { code: 'GB', nameEn: 'United Kingdom', nameZh: '英國', defaultCurrency: 'EUR' },
  { code: 'IE', nameEn: 'Ireland', nameZh: '愛爾蘭', defaultCurrency: 'EUR' },
  { code: 'NL', nameEn: 'Netherlands', nameZh: '荷蘭', defaultCurrency: 'EUR' },
  { code: 'BE', nameEn: 'Belgium', nameZh: '比利時', defaultCurrency: 'EUR' },
  { code: 'LU', nameEn: 'Luxembourg', nameZh: '盧森堡', defaultCurrency: 'EUR' },
  { code: 'PL', nameEn: 'Poland', nameZh: '波蘭', defaultCurrency: 'EUR' },
  { code: 'SK', nameEn: 'Slovakia', nameZh: '斯洛伐克', defaultCurrency: 'EUR' },
  { code: 'SI', nameEn: 'Slovenia', nameZh: '斯洛維尼亞', defaultCurrency: 'EUR' },
  { code: 'HR', nameEn: 'Croatia', nameZh: '克羅埃西亞', defaultCurrency: 'EUR' },
  { code: 'GR', nameEn: 'Greece', nameZh: '希臘', defaultCurrency: 'EUR' },
  { code: 'IS', nameEn: 'Iceland', nameZh: '冰島', defaultCurrency: 'EUR' },
  { code: 'NO', nameEn: 'Norway', nameZh: '挪威', defaultCurrency: 'EUR' },
  { code: 'SE', nameEn: 'Sweden', nameZh: '瑞典', defaultCurrency: 'EUR' },
  { code: 'DK', nameEn: 'Denmark', nameZh: '丹麥', defaultCurrency: 'EUR' },
  { code: 'FI', nameEn: 'Finland', nameZh: '芬蘭', defaultCurrency: 'EUR' },
  // Middle East & Africa
  { code: 'TR', nameEn: 'Turkey', nameZh: '土耳其', defaultCurrency: 'EUR' },
  { code: 'AE', nameEn: 'United Arab Emirates', nameZh: '阿聯酋', defaultCurrency: 'USD' },
  { code: 'EG', nameEn: 'Egypt', nameZh: '埃及', defaultCurrency: 'USD' },
  { code: 'MA', nameEn: 'Morocco', nameZh: '摩洛哥', defaultCurrency: 'EUR' },
  { code: 'ZA', nameEn: 'South Africa', nameZh: '南非', defaultCurrency: 'USD' },
  // Americas & Oceania
  { code: 'US', nameEn: 'United States', nameZh: '美國', defaultCurrency: 'USD' },
  { code: 'CA', nameEn: 'Canada', nameZh: '加拿大', defaultCurrency: 'USD' },
  { code: 'MX', nameEn: 'Mexico', nameZh: '墨西哥', defaultCurrency: 'USD' },
  { code: 'PE', nameEn: 'Peru', nameZh: '秘魯', defaultCurrency: 'USD' },
  { code: 'BR', nameEn: 'Brazil', nameZh: '巴西', defaultCurrency: 'USD' },
  { code: 'AR', nameEn: 'Argentina', nameZh: '阿根廷', defaultCurrency: 'USD' },
  { code: 'CL', nameEn: 'Chile', nameZh: '智利', defaultCurrency: 'USD' },
  { code: 'AU', nameEn: 'Australia', nameZh: '澳洲', defaultCurrency: 'USD' },
  { code: 'NZ', nameEn: 'New Zealand', nameZh: '紐西蘭', defaultCurrency: 'USD' },
];

const COUNTRY_BY_CODE = new Map<string, CountryOption>(
  SUPPORTED_COUNTRIES.map((country) => [country.code, country]),
);

export function findCountry(code: string): CountryOption | undefined {
  return COUNTRY_BY_CODE.get(code.toUpperCase());
}
