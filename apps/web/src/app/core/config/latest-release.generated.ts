// Auto-generated from root releases.json via `node scripts/sync-releases.mjs`.
// Keeps the initial bundle lean by importing only the newest release entry.
// Do not edit manually.

import { ReleaseNoteEntry } from './release-notes.generated';

export const LATEST_RELEASE_NOTE: ReleaseNoteEntry = {
  "version": "0.9.19-beta",
  "date": "2026-11-29",
  "title": {
    "zh-TW": "真實航線地圖、介面減噪與登入預覽",
    "en": "Real Flight Map & Visual Polish"
  },
  "changes": {
    "zh-TW": [
      "足跡頁升級為雙欄寬幅版面，依真實航班繪製單一世界地圖航線",
      "登入頁新增多國行程預覽卡，每次開啟皆隨機輪播不同目的地",
      "統一全站按鈕與標籤圓角並減少邊框雜訊，切換分頁版面更穩定"
    ],
    "en": [
      "Redesigned the Logbook hero with a real-flight single-Earth map beside distance stats",
      "Added randomized multi-country itinerary previews to the login screen across six destinations",
      "Unified control corners, reduced nested card borders, and aligned brief and expense spacing"
    ]
  }
};
