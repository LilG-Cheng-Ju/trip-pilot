import { MESSAGES_EN } from './messages.en';
import { MESSAGES_ZH_TW } from './messages.zh-tw';

describe('i18n message dictionaries', () => {
  it('keeps identical key sets across English and Traditional Chinese', () => {
    const enKeys = Object.keys(MESSAGES_EN).sort();
    const zhKeys = Object.keys(MESSAGES_ZH_TW).sort();
    expect(zhKeys).toEqual(enKeys);
  });
});
