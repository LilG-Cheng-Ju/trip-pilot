export interface CurrencyOption {
  code: string;
  labelEn: string;
  labelZh: string;
  shortLabelEn: string;
  shortLabelZh: string;
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

/** Canonical 17-currency registry shared across trip settings and expense logging. */
export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  {
    code: 'TWD',
    labelEn: 'TWD — New Taiwan Dollar',
    labelZh: 'TWD 新台幣',
    shortLabelEn: 'TWD · NT$',
    shortLabelZh: '台幣 (TWD)',
  },
  {
    code: 'JPY',
    labelEn: 'JPY — Japanese Yen',
    labelZh: 'JPY 日圓',
    shortLabelEn: 'JPY · ¥',
    shortLabelZh: '日圓 (JPY)',
  },
  {
    code: 'KRW',
    labelEn: 'KRW — South Korean Won',
    labelZh: 'KRW 韓元',
    shortLabelEn: 'KRW · ₩',
    shortLabelZh: '韓元 (KRW)',
  },
  {
    code: 'USD',
    labelEn: 'USD — US Dollar',
    labelZh: 'USD 美金',
    shortLabelEn: 'USD · $',
    shortLabelZh: '美金 (USD)',
  },
  {
    code: 'EUR',
    labelEn: 'EUR — Euro',
    labelZh: 'EUR 歐元',
    shortLabelEn: 'EUR · €',
    shortLabelZh: '歐元 (EUR)',
  },
  {
    code: 'GBP',
    labelEn: 'GBP — British Pound',
    labelZh: 'GBP 英鎊',
    shortLabelEn: 'GBP · £',
    shortLabelZh: '英鎊 (GBP)',
  },
  {
    code: 'THB',
    labelEn: 'THB — Thai Baht',
    labelZh: 'THB 泰銖',
    shortLabelEn: 'THB · ฿',
    shortLabelZh: '泰銖 (THB)',
  },
  {
    code: 'SGD',
    labelEn: 'SGD — Singapore Dollar',
    labelZh: 'SGD 新幣',
    shortLabelEn: 'SGD · S$',
    shortLabelZh: '新幣 (SGD)',
  },
  {
    code: 'HKD',
    labelEn: 'HKD — Hong Kong Dollar',
    labelZh: 'HKD 港幣',
    shortLabelEn: 'HKD · HK$',
    shortLabelZh: '港幣 (HKD)',
  },
  {
    code: 'CNY',
    labelEn: 'CNY — Chinese Yuan',
    labelZh: 'CNY 人民幣',
    shortLabelEn: 'CNY · ¥',
    shortLabelZh: '人民幣 (CNY)',
  },
  {
    code: 'AUD',
    labelEn: 'AUD — Australian Dollar',
    labelZh: 'AUD 澳幣',
    shortLabelEn: 'AUD · A$',
    shortLabelZh: '澳幣 (AUD)',
  },
  {
    code: 'CAD',
    labelEn: 'CAD — Canadian Dollar',
    labelZh: 'CAD 加幣',
    shortLabelEn: 'CAD · C$',
    shortLabelZh: '加幣 (CAD)',
  },
  {
    code: 'CHF',
    labelEn: 'CHF — Swiss Franc',
    labelZh: 'CHF 瑞郎',
    shortLabelEn: 'CHF · Fr',
    shortLabelZh: '瑞郎 (CHF)',
  },
  {
    code: 'VND',
    labelEn: 'VND — Vietnamese Dong',
    labelZh: 'VND 越南盾',
    shortLabelEn: 'VND · ₫',
    shortLabelZh: '越南盾 (VND)',
  },
  {
    code: 'MYR',
    labelEn: 'MYR — Malaysian Ringgit',
    labelZh: 'MYR 馬幣',
    shortLabelEn: 'MYR · RM',
    shortLabelZh: '馬幣 (MYR)',
  },
  {
    code: 'PHP',
    labelEn: 'PHP — Philippine Peso',
    labelZh: 'PHP 菲幣',
    shortLabelEn: 'PHP · ₱',
    shortLabelZh: '菲幣 (PHP)',
  },
  {
    code: 'IDR',
    labelEn: 'IDR — Indonesian Rupiah',
    labelZh: 'IDR 印尼盾',
    shortLabelEn: 'IDR · Rp',
    shortLabelZh: '印尼盾 (IDR)',
  },
];

/** Compact currency labels derived from SUPPORTED_CURRENCIES for expense selectors. */
export const COMMON_CURRENCIES: readonly QuickCurrencyOption[] = SUPPORTED_CURRENCIES.map(
  (currency) => ({
    code: currency.code,
    labelEn: currency.shortLabelEn,
    labelZh: currency.shortLabelZh,
  }),
);

/** Build quick-select currency options, prepending any unrecognized 3-letter codes. */
export function buildQuickCurrencyOptions(
  extras: readonly (string | undefined | null)[],
): QuickCurrencyOption[] {
  const list: QuickCurrencyOption[] = [...COMMON_CURRENCIES];
  for (const code of extras) {
    const upper = code?.trim().toUpperCase();
    if (upper && upper.length === 3 && !list.some((c) => c.code === upper)) {
      list.unshift({ code: upper, labelEn: upper, labelZh: upper });
    }
  }
  return list;
}

/** Broad global travel country list with bilingual labels and default currency. */
export const SUPPORTED_COUNTRIES: readonly CountryOption[] = [
  // East & Southeast Asia
  { code: 'TW', nameEn: 'Taiwan', nameZh: '台灣', defaultCurrency: 'TWD' },
  { code: 'JP', nameEn: 'Japan', nameZh: '日本', defaultCurrency: 'JPY' },
  { code: 'KR', nameEn: 'South Korea', nameZh: '韓國', defaultCurrency: 'KRW' },
  { code: 'HK', nameEn: 'Hong Kong', nameZh: '香港', defaultCurrency: 'HKD' },
  { code: 'MO', nameEn: 'Macau', nameZh: '澳門', defaultCurrency: 'USD' },
  { code: 'CN', nameEn: 'China', nameZh: '中國', defaultCurrency: 'CNY' },
  { code: 'SG', nameEn: 'Singapore', nameZh: '新加坡', defaultCurrency: 'SGD' },
  { code: 'TH', nameEn: 'Thailand', nameZh: '泰國', defaultCurrency: 'THB' },
  { code: 'VN', nameEn: 'Vietnam', nameZh: '越南', defaultCurrency: 'VND' },
  { code: 'MY', nameEn: 'Malaysia', nameZh: '馬來西亞', defaultCurrency: 'MYR' },
  { code: 'ID', nameEn: 'Indonesia', nameZh: '印尼', defaultCurrency: 'IDR' },
  { code: 'PH', nameEn: 'Philippines', nameZh: '菲律賓', defaultCurrency: 'PHP' },
  { code: 'KH', nameEn: 'Cambodia', nameZh: '柬埔寨', defaultCurrency: 'USD' },
  { code: 'IN', nameEn: 'India', nameZh: '印度', defaultCurrency: 'USD' },
  // Central, Western, Southern & Northern Europe
  { code: 'CZ', nameEn: 'Czechia', nameZh: '捷克', defaultCurrency: 'EUR' },
  { code: 'AT', nameEn: 'Austria', nameZh: '奧地利', defaultCurrency: 'EUR' },
  { code: 'HU', nameEn: 'Hungary', nameZh: '匈牙利', defaultCurrency: 'EUR' },
  { code: 'DE', nameEn: 'Germany', nameZh: '德國', defaultCurrency: 'EUR' },
  { code: 'CH', nameEn: 'Switzerland', nameZh: '瑞士', defaultCurrency: 'CHF' },
  { code: 'FR', nameEn: 'France', nameZh: '法國', defaultCurrency: 'EUR' },
  { code: 'IT', nameEn: 'Italy', nameZh: '義大利', defaultCurrency: 'EUR' },
  { code: 'ES', nameEn: 'Spain', nameZh: '西班牙', defaultCurrency: 'EUR' },
  { code: 'PT', nameEn: 'Portugal', nameZh: '葡萄牙', defaultCurrency: 'EUR' },
  { code: 'GB', nameEn: 'United Kingdom', nameZh: '英國', defaultCurrency: 'GBP' },
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
  { code: 'CA', nameEn: 'Canada', nameZh: '加拿大', defaultCurrency: 'CAD' },
  { code: 'MX', nameEn: 'Mexico', nameZh: '墨西哥', defaultCurrency: 'USD' },
  { code: 'PE', nameEn: 'Peru', nameZh: '秘魯', defaultCurrency: 'USD' },
  { code: 'BR', nameEn: 'Brazil', nameZh: '巴西', defaultCurrency: 'USD' },
  { code: 'AR', nameEn: 'Argentina', nameZh: '阿根廷', defaultCurrency: 'USD' },
  { code: 'CL', nameEn: 'Chile', nameZh: '智利', defaultCurrency: 'USD' },
  { code: 'AU', nameEn: 'Australia', nameZh: '澳洲', defaultCurrency: 'AUD' },
  { code: 'NZ', nameEn: 'New Zealand', nameZh: '紐西蘭', defaultCurrency: 'USD' },
];

const COUNTRY_BY_CODE = new Map<string, CountryOption>(
  SUPPORTED_COUNTRIES.map((country) => [country.code, country]),
);

const COUNTRY_MAP_CENTERS: Readonly<Record<string, readonly [number, number]>> = {
  TW: [121.5654, 25.033],
  JP: [139.7671, 35.6812],
  KR: [126.978, 37.5665],
  HK: [114.1694, 22.3193],
  MO: [113.5439, 22.1987],
  CN: [121.4737, 31.2304],
  SG: [103.8198, 1.3521],
  TH: [100.5018, 13.7563],
  VN: [105.8342, 21.0278],
  MY: [101.6869, 3.139],
  ID: [115.1889, -8.4095],
  PH: [120.9842, 14.5995],
  KH: [104.9282, 11.5564],
  IN: [77.209, 28.6139],
  CZ: [14.4378, 50.0755],
  AT: [16.3738, 48.2082],
  HU: [19.0402, 47.4979],
  DE: [13.405, 52.52],
  CH: [8.5417, 47.3769],
  FR: [2.3522, 48.8566],
  IT: [12.4964, 41.9028],
  ES: [-3.7038, 40.4168],
  PT: [-9.1393, 38.7223],
  GB: [-0.1276, 51.5072],
  IE: [-6.2603, 53.3498],
  NL: [4.9041, 52.3676],
  BE: [4.3517, 50.8503],
  LU: [6.1296, 49.6116],
  PL: [21.0122, 52.2297],
  SK: [17.1077, 48.1486],
  SI: [14.5058, 46.0569],
  HR: [15.9819, 45.815],
  GR: [23.7275, 37.9838],
  IS: [-21.9426, 64.1466],
  NO: [10.7522, 59.9139],
  SE: [18.0686, 59.3293],
  DK: [12.5683, 55.6761],
  FI: [24.9384, 60.1699],
  TR: [28.9784, 41.0082],
  AE: [55.2708, 25.2048],
  EG: [31.2357, 30.0444],
  MA: [-7.9811, 31.6295],
  ZA: [18.4241, -33.9249],
  US: [-74.006, 40.7128],
  CA: [-79.3832, 43.6532],
  MX: [-99.1332, 19.4326],
  PE: [-77.0428, -12.0464],
  BR: [-43.1729, -22.9068],
  AR: [-58.3816, -34.6037],
  CL: [-70.6693, -33.4489],
  AU: [151.2093, -33.8688],
  NZ: [174.7633, -36.8485],
};

export function findCountry(code: string): CountryOption | undefined {
  return COUNTRY_BY_CODE.get(code.toUpperCase());
}

/** Resolves a destination-appropriate [lng, lat] center when a day has no pinned coordinates yet. */
export function resolveCountryMapCenter(
  countryCodes: readonly string[],
  fallbackCountryCode = 'TW',
): readonly [number, number] {
  for (const code of countryCodes) {
    const match = COUNTRY_MAP_CENTERS[code.toUpperCase()];
    if (match) {
      return match;
    }
  }
  return COUNTRY_MAP_CENTERS[fallbackCountryCode.toUpperCase()] ?? COUNTRY_MAP_CENTERS['TW'];
}
