// Auto-generated from root releases.json via `node scripts/sync-releases.mjs`.
// Keeps the initial bundle lean by importing only the newest release entry.
// Do not edit manually.

import { ReleaseNoteEntry } from './release-notes.generated';

export const LATEST_RELEASE_NOTE: ReleaseNoteEntry = {
  "version": "0.9.17-beta",
  "date": "2026-11-28",
  "title": {
    "zh-TW": "快速新增行程與選單體驗優化",
    "en": "Faster Item Entry & Menu Polish"
  },
  "changes": {
    "zh-TW": [
      "點新增項目可直接選擇類別開啟表單，並支援儲存後連續新增下一筆",
      "貼上 Google Maps 連結會自動解析定位，不用再多點一次解析",
      "行動版滑動頁面時會自動收起已展開的浮動選單，瀏覽行程更俐落"
    ],
    "en": [
      "Added a category dropdown to Add Item and Save & Add Another for rapid planning",
      "Auto-resolved pasted Google Maps links into map pins without clicking a separate button",
      "Dismissed open action menus automatically when scrolling so mobile browsing stays unobstructed"
    ]
  }
};
