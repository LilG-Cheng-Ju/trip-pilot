import { computed, Injectable, signal } from '@angular/core';

import { MESSAGES_EN, TranslationKey } from './messages.en';
import { MESSAGES_ZH_TW } from './messages.zh-tw';

export type SupportedLocale = 'en' | 'zh-TW';

const LOCALE_STORAGE_KEY = 'tripilot.locale';

const DICTIONARIES: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en: MESSAGES_EN,
  'zh-TW': MESSAGES_ZH_TW,
};

/** Signal-based translation service supporting instant bilingual switching. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly activeLocale = signal<SupportedLocale>(this.loadInitialLocale());

  readonly locale = this.activeLocale.asReadonly();
  readonly dictionary = computed(() => DICTIONARIES[this.activeLocale()]);

  constructor() {
    this.syncDocumentLang(this.activeLocale());
  }

  setLocale(locale: SupportedLocale): void {
    this.activeLocale.set(locale);
    this.syncDocumentLang(locale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore storage access errors in restricted browsing modes.
    }
  }

  private syncDocumentLang(locale: SupportedLocale): void {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }

  toggleLocale(): void {
    this.setLocale(this.activeLocale() === 'en' ? 'zh-TW' : 'en');
  }

  t(key: TranslationKey, params?: Record<string, string | number>): string {
    const template = this.dictionary()[key];
    if (!params) {
      return template;
    }
    return Object.entries(params).reduce(
      (result, [paramKey, value]) => result.replaceAll(`{${paramKey}}`, String(value)),
      template,
    );
  }

  private loadInitialLocale(): SupportedLocale {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'en' || saved === 'zh-TW') {
        return saved;
      }
    } catch {
      // Fall back to browser locale when localStorage is unavailable.
    }
    if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
      return 'zh-TW';
    }
    return 'en';
  }
}
