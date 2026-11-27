export type WakeMessageKind = 'fun' | 'tip';

export interface WakeMessage {
  readonly kind: WakeMessageKind;
  readonly tag: {
    readonly 'zh-TW': string;
    readonly en: string;
  };
  readonly text: {
    readonly 'zh-TW': string;
    readonly en: string;
  };
}

/**
 * Bilingual tips and developer cold jokes shown only when the backend takes longer
 * than usual to wake up. Keep every line concise and free of em/en dashes.
 */
export const BACKEND_WAKE_MESSAGES: readonly WakeMessage[] = [
  {
    kind: 'fun',
    tag: { 'zh-TW': '幕後花絮', en: 'Behind the scenes' },
    text: {
      'zh-TW':
        '作者 Clement Lee 最近在公司一直修資安弱點，所以 Tripilot 的資安絕對是旅遊 APP 裡面最強的 Σ(っ °Д °;)っ',
      en: "Author Clement Lee has been patching security vulnerabilities at work nonstop, so Tripilot's security is easily the strongest among travel apps Σ(っ °Д °;)っ",
    },
  },
  {
    kind: 'fun',
    tag: { 'zh-TW': '幕後花絮', en: 'Behind the scenes' },
    text: {
      'zh-TW':
        '後端啟動中，目前後端部署在 GCP Cloud Run 中，如果想要更穩定的後端，歡迎斗內作者 Clement Lee (╯°Д°)╯︵ ┻━┻',
      en: "Backend is waking up on GCP Cloud Run right now. If you'd like an even faster server, donations to Clement Lee are always welcome (╯°Д°)╯︵ ┻━┻",
    },
  },
  {
    kind: 'fun',
    tag: { 'zh-TW': '喚醒彩蛋', en: 'Cold start' },
    text: {
      'zh-TW': 'Cloud Run 剛小睡了一下，正在幫它泡杯咖啡叫起床，幾秒就好 ☕',
      en: 'Cloud Run took a quick nap. Brewing coffee to wake it up, just a moment ☕',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '足跡', en: 'Logbook' },
    text: {
      'zh-TW': '點開「足跡」就能回顧歷年飛行與陸路總里程、造訪國家與旅遊天數。',
      en: 'Open Logbook to see lifetime air and ground mileage, visited countries, and travel days.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '足跡', en: 'Logbook' },
    text: {
      'zh-TW': '在「足跡」可切換出國或國內旅遊，也能按年份查看花費與每月紀錄。',
      en: 'Filter Logbook by International or Domestic trips, or inspect yearly spend and monthly footprints.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': 'AI 副駕駛', en: 'AI Copilot' },
    text: {
      'zh-TW': '到「設定」建立 API 金鑰，就能讓 ChatGPT、Claude 或 Gemini CLI 幫你排行程。',
      en: 'Create an API Token in Settings so ChatGPT, Claude, or Gemini CLI can help plan trips.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '備案管理', en: 'Plan A & B' },
    text: {
      'zh-TW': '怕當天下雨？每天都能建 Plan A 與 Plan B，同個時段也能放多間候選餐廳。',
      en: 'Build Plan A and Plan B schedules for rainy days, or save backup restaurants in one slot.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '地圖定位', en: 'Smart Maps' },
    text: {
      'zh-TW': '新增景點直接貼上 Google Maps 網址，系統會自動定位並計算移動距離。',
      en: 'Paste any Google Maps link when adding a spot to pin it on the map and calculate distance.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '搭車救星', en: 'Local Copy' },
    text: {
      'zh-TW': '填入「當地語言地名」，在國外搭計程車時點一下就能複製原文給司機看。',
      en: 'Add a Local Language Name to copy native addresses in one tap for taxi drivers abroad.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '行前摘要', en: 'Trip Brief' },
    text: {
      'zh-TW': '出發前點開「摘要」，住宿天數、航班代號與雲端票券都整理在同一頁。',
      en: 'Open Brief before departure to view hotel spans, flight refs, and cloud tickets together.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '離線與分享', en: 'Offline & Share' },
    text: {
      'zh-TW': '開過的旅程會自動快取離線可看；分享連結給旅伴時還能一鍵隱藏訂位代號。',
      en: 'Opened trips stay cached offline, and share links can hide booking codes in one tap.',
    },
  },
];

/** Pick a random message index while avoiding immediate back-to-back repeats. */
export function pickNextWakeIndex(
  total: number,
  currentIndex: number | null,
  rng: () => number = Math.random,
): number {
  if (total <= 1) {
    return 0;
  }
  const normalizedCurrent =
    currentIndex !== null && currentIndex >= 0 && currentIndex < total ? currentIndex : null;
  if (normalizedCurrent === null) {
    return Math.min(total - 1, Math.floor(rng() * total));
  }
  const offset = 1 + Math.min(total - 2, Math.floor(rng() * (total - 1)));
  return (normalizedCurrent + offset) % total;
}
