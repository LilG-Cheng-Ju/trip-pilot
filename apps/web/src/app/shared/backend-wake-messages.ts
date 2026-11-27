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
      'zh-TW': 'Cloud Run 剛剛小睡了一下，正在幫它泡杯濃縮咖啡叫它起床，幾秒鐘就好 ☕',
      en: 'Cloud Run just took a quick nap. Brewing an espresso to wake it up, just a few seconds ☕',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '足跡', en: 'Logbook' },
    text: {
      'zh-TW': '點開「足跡」就能回顧歷年累積的飛行與陸路總里程、造訪國家排行，以及旅遊天數統計。',
      en: 'Open Logbook to review your lifetime air and ground mileage, top visited countries, and total travel days.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '足跡', en: 'Logbook' },
    text: {
      'zh-TW': '在「足跡」裡可以自由切換全部、出國或國內旅遊，也能按年份查看花費分類與每月旅行紀錄。',
      en: 'Filter Logbook by All, International, or Domestic trips, or pick any year to inspect category spend and monthly travel footprints.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': 'AI 副駕駛', en: 'AI Copilot' },
    text: {
      'zh-TW':
        '懶得一筆筆手動排行程？到「設定」建立個人 API Token，就能讓 ChatGPT、Claude 或 Gemini CLI 直接幫你排行程跟記帳。',
      en: 'Tired of entering every stop by hand? Create a Personal API Token in Settings so ChatGPT, Claude, or Gemini CLI can plan trips and log expenses for you.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '備案管理', en: 'Plan A & B' },
    text: {
      'zh-TW':
        '怕旅遊當天下雨？每一天都能建立 Plan A 與 Plan B 兩套完整行程，同一時段也能並排多間候選餐廳一鍵切換。',
      en: 'Worried about rainy days? Build full Plan A and Plan B schedules for any day, or line up multiple restaurant choices for the same slot.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '地圖定位', en: 'Smart Maps' },
    text: {
      'zh-TW':
        '新增景點不用自己查座標，直接貼上 Google Maps 網址，Tripilot 會自動解析地點、釘上地圖並計算移動距離。',
      en: 'No need to look up coordinates manually. Paste any Google Maps link and Tripilot automatically pins the spot and calculates route distances.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '搭車救星', en: 'Local Copy' },
    text: {
      'zh-TW': '幫飯店或餐廳填入「當地語言地名」，在國外搭計程車時點一下就能複製原文給司機看。',
      en: 'Add a Local Language Name to hotels or restaurants for one-tap copying when showing addresses to taxi drivers abroad.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '行前摘要', en: 'Trip Brief' },
    text: {
      'zh-TW': '出發前點開「摘要」，續住天數、換飯店提醒、航班訂位代號與雲端票券連結都幫你整理成一頁。',
      en: 'Open Brief before departure to see hotel stay spans, hotel changes, flight booking refs, and cloud tickets on one page.',
    },
  },
  {
    kind: 'tip',
    tag: { 'zh-TW': '離線與分享', en: 'Offline & Share' },
    text: {
      'zh-TW': '搭地鐵或出國沒訊號別緊張，開過的旅程會自動快取在手機裡；分享行程給旅伴時還能一鍵隱藏訂位代號。',
      en: 'Opened trips stay cached offline when you lose signal underground, and public share links can hide booking codes and private notes in one click.',
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
