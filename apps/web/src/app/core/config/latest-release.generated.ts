// Auto-generated from root releases.json via `node scripts/sync-releases.mjs`.
// Keeps the initial bundle lean by importing only the newest release entry.
// Do not edit manually.

import { ReleaseNoteEntry } from './release-notes.generated';

export const LATEST_RELEASE_NOTE: ReleaseNoteEntry = {
  "version": "0.9.18-beta",
  "date": "2026-11-28",
  "title": {
    "zh-TW": "介面視覺與字型載入優化",
    "en": "Visual Polish & Faster Font Loads"
  },
  "changes": {
    "zh-TW": [
      "更新登入頁航圖視覺與品牌文案，新手空狀態改為精簡引導",
      "足跡主視覺航線改依真實飛行與旅程資料呈現，並統一卡片標籤樣式",
      "精簡中文字型下載並縮小首屏檔案，行動漫遊開啟更省流量"
    ],
    "en": [
      "Refined the login artwork, brand copy, and empty-state onboarding across the app",
      "Updated the Logbook route graphic to reflect real travel records and unified card chips",
      "Reduced font downloads and initial bundle size for quicker loading on mobile roaming"
    ]
  }
};
