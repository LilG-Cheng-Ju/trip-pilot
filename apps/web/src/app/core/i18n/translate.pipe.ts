import { inject, Pipe, PipeTransform } from '@angular/core';

import { I18nService, SupportedLocale } from './i18n.service';
import { TranslationKey } from './messages.en';

/** Template pipe that resolves and memoizes a typed translation key via I18nService. */
@Pipe({
  name: 't',
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  private lastLocale: SupportedLocale | null = null;
  private lastKey: TranslationKey | null = null;
  private lastParamsKey = '';
  private lastValue = '';

  transform(key: TranslationKey, params?: Record<string, string | number>): string {
    const locale = this.i18n.locale();
    const paramsKey = params ? JSON.stringify(params) : '';
    if (locale === this.lastLocale && key === this.lastKey && paramsKey === this.lastParamsKey) {
      return this.lastValue;
    }
    this.lastLocale = locale;
    this.lastKey = key;
    this.lastParamsKey = paramsKey;
    this.lastValue = this.i18n.t(key, params);
    return this.lastValue;
  }
}
