import {
  COMMON_CURRENCIES,
  findCountry,
  resolveCountryMapCenter,
  SUPPORTED_COUNTRIES,
  SUPPORTED_CURRENCIES,
} from './travel-options';

describe('travel-options', () => {
  it('defines a canonical 17-currency registry and derives COMMON_CURRENCIES from it', () => {
    expect(SUPPORTED_CURRENCIES).toHaveLength(17);
    expect(new Set(SUPPORTED_CURRENCIES.map((c) => c.code)).size).toBe(17);
    for (const c of SUPPORTED_CURRENCIES) {
      expect(c.labelEn.length).toBeGreaterThan(0);
      expect(c.labelZh.length).toBeGreaterThan(0);
      expect(c.shortLabelEn.length).toBeGreaterThan(0);
      expect(c.shortLabelZh.length).toBeGreaterThan(0);
    }

    expect(COMMON_CURRENCIES).toHaveLength(SUPPORTED_CURRENCIES.length);
    expect(COMMON_CURRENCIES.map((c) => c.code)).toEqual(
      SUPPORTED_CURRENCIES.map((c) => c.code),
    );
    expect(COMMON_CURRENCIES[0]).toEqual({
      code: SUPPORTED_CURRENCIES[0].code,
      labelEn: SUPPORTED_CURRENCIES[0].shortLabelEn,
      labelZh: SUPPORTED_CURRENCIES[0].shortLabelZh,
    });
  });

  it('assigns local default currencies for countries supported in the unified list', () => {
    const supportedCodes = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));
    for (const country of SUPPORTED_COUNTRIES) {
      expect(supportedCodes.has(country.defaultCurrency)).toBe(true);
    }

    expect(findCountry('HK')?.defaultCurrency).toBe('HKD');
    expect(findCountry('SG')?.defaultCurrency).toBe('SGD');
    expect(findCountry('TH')?.defaultCurrency).toBe('THB');
    expect(findCountry('VN')?.defaultCurrency).toBe('VND');
    expect(findCountry('MY')?.defaultCurrency).toBe('MYR');
    expect(findCountry('ID')?.defaultCurrency).toBe('IDR');
    expect(findCountry('PH')?.defaultCurrency).toBe('PHP');
    expect(findCountry('CH')?.defaultCurrency).toBe('CHF');
    expect(findCountry('GB')?.defaultCurrency).toBe('GBP');
    expect(findCountry('CA')?.defaultCurrency).toBe('CAD');
    expect(findCountry('AU')?.defaultCurrency).toBe('AUD');
  });

  it('resolves destination country map centers and falls back to home country', () => {
    expect(resolveCountryMapCenter(['FR'], 'TW')).toEqual([2.3522, 48.8566]);
    expect(resolveCountryMapCenter([], 'KR')).toEqual([126.978, 37.5665]);
    expect(resolveCountryMapCenter(['ZZ'], 'TW')).toEqual([121.5654, 25.033]);
  });
});
