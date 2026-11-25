# Changelog

<!-- Auto-generated from releases.json. Run `node scripts/sync-releases.mjs` after editing releases.json. -->

## v0.9.1-beta (2026-11-25) — 邀請連結自動開通、新手引導與轉乘卡片修正
*Direct Invite Links, Empty-State Guide & Transit Card Fix*

- 管理後台的邀請碼新增「複製連結」，朋友點擊連結登入後會自動帶入並兌換邀請碼，免手動輸入
- 新帳號首次進入空的旅程總覽時，顯示三步驟快速上手引導與建立旅程按鈕
- 修正「在地轉乘」卡片外露重複的上下移箭頭造成文字被壓縮的問題，排序操作統一收在右側選單內
- 修正正式環境因嚴格 CSP 阻擋內嵌樣式切換腳本導致全站樣式未套用的問題

## v0.9.0-beta (2026-11-25) — 親友邀請制、邀請碼兌換與管理後台
*Invite-Only Access, Invite Codes & Admin Console*

- 改為親友邀請制：未經開通的帳號登入後會導向邀請碼兌換頁，輸入邀請碼即可啟用功能
- 新增角色分級（OWNER / ADMIN / FRIEND / USER）與停權機制，停權後同步阻擋網頁與 API Token
- 頭像選單為管理員提供管理後台入口，支援使用者搜尋與角色調整、撤銷 Token、刪除帳號，以及批次產生與撤銷邀請碼

## v0.8.4-beta (2026-11-25) — 站內更新紀錄與版本同步
*In-App Changelog & Version Sync*

- 點擊頭像選單底部的版本號即可查看各版本更新紀錄
- 有新版本時會在頭像與版本號旁顯示未讀小點，點開後清除
- 站內更新紀錄與 GitHub CHANGELOG.md 改由同一份來源自動產生

## v0.8.3-beta (2026-11-25) — AI 助手工具統一與自動帶入匯率
*Unified AI Tools & Auto-FX Expenses*

- AI 助手記帳若未指定匯率，會自動帶入即時匯率換算
- 統一本機與遠端 AI 助手的工具參數與行為

## v0.8.2-beta (2026-11-25) — 存取防護與手機地圖資源最佳化
*Access Guards & Mobile Map Optimization*

- 加入 API 呼叫頻率限制、外部連結檢查與登入存取控管
- 手機版切換清單與地圖時只保留單一地圖實例，降低記憶體佔用

## v0.8.1-beta (2026-11-25) — 跨日住宿路線更新與計算效率改善
*Multi-Day Stay Routing & FX Performance*

- 調整跨日續住飯店或景點後，自動更新後續天數的路線與距離
- 改善多幣別花費換算速度與資料寫入穩定度

## v0.8.0-beta (2026-11-25) — 行程頁、行前總覽與登入頁版面調整
*Itinerary, Trip Brief & Login Layout Update*

- 調整每日行程章節、行前總覽（Trip Brief）與儀表板卡片排版
- 儀表板數據加入數字遞增動畫，登入頁改為地圖背景樣式

## v0.7.3-beta (2026-11-25) — 自訂 Logo、時間排序與編輯流程補齊
*Custom Logo, Time Sorting & Complete Editing*

- 換上 Tripilot 自訂 Logo、瀏覽器圖示與手機主畫面圖示
- 新增依時間自動排序、拖曳調整順序、卡片與地圖連動，以及機場搜尋
- 補齊旅程與花費的編輯／刪除確認視窗，並統一幣別選項

## v0.6.7-beta (2026-11-24) — 離線快取、曲線路線與公開分享頁調整
*Offline Cache, Curved Routes & Share View*

- 支援加入手機主畫面（PWA）與離線快取，無網路時可查閱已載入行程
- 地圖預設顯示曲線路線並可切換行車路線，涵蓋機場接送與續住飯店
- 精簡公開分享頁上方導覽與手機天數切換版面

## v0.5.3-beta (2026-11-24) — 中文地標地圖與 Plan A/B 備案管理
*CJK Map Labels & Plan A/B Management*

- 更換為支援中文地標顯示的地圖樣式
- 補強每日 Plan A / Plan B 備案建立、複製、更名與切換，並改善手機地圖載入速度

## v0.4.3-beta (2026-11-24) — AI 助手連線設定與手機地圖預覽卡
*AI Connect Settings & Mobile Map Preview*

- 設定頁新增 AI 助手連線說明與個人 API Token 管理
- 手機版地圖點擊地標後，於底部顯示地點與時間預覽卡

## v0.3.1-beta (2026-11-24) — 帳號登入與單一時段多選切換
*Account Sign-In & Slot Choice Switching*

- 支援 Google 與 Email 帳號登入，可跨裝置同步行程
- 固定行程頁頂部天數列、加入手機版滑動地圖，以及同一時段多候選項目即時切換

## v0.2.3-beta (2026-11-23) — 旅遊統計儀表板與手機版版面修正
*Travel Stats Dashboard & Mobile Layout Fixes*

- 改版旅遊儀表板：新增全部／國際／國內篩選、花費分類統計與國家排行
- 修正手機版頁面水平溢出問題與右上角地圖開關

## v0.1.5-beta (2026-11-23) — 初期版本：行程規劃、行前總覽與即時匯率記帳
*Initial Beta: Itinerary, Trip Brief & Live FX*

- 提供行程規劃、卡片快速記帳與即時匯率自動帶入
- 新增行前總覽（Trip Brief）分頁，彙整住宿日期、交通訂位與雲端附件
