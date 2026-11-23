# Tripilot Design System (`DESIGN.md`)

**Aesthetic Direction**: **Precision Aviation & Editorial Minimalism** (inspired by Flighty, Linear, and Apple Maps).
Every screen prioritizes calm scannability, high-contrast legibility, crisp hairline geometry, and zero visual clutter.

---

## 1. Color Palette & Surface Hierarchy

| Token | Value | Role |
|---|---|---|
| `--color-bg` | `#F5F6F8` | Primary cool-alabaster app canvas |
| `--color-surface` | `#FFFFFF` | Elevated cards, modals, panels |
| `--color-surface-muted` | `#ECEEF2` | Segmented control tracks, subtle chip wells |
| `--color-border` | `#E2E6EC` | 1px hairline dividers & card outlines |
| `--color-primary` | `#0F172A` | Carbon ink for headings, primary CTAs, flight cards |
| `--color-primary-tint` | `#EFF4FF` | Quiet blue-tinted hover/active well |
| `--color-accent` | `#C89246` | Restrained aviation gold for active pins, highlights, spend cues |
| `--color-alert` | `#DC4C3E` | Destructive actions, required asterisks, cancellation warnings |

### Restraint Rule
- **90% neutral canvas + white surfaces + carbon/slate ink.**
- Color is reserved strictly for: active states, flight/map pins, spend cues, and destructive warnings.
- **Never** put thick colored left stripes (`border-left: 4px solid ...`) on cards — use a quiet 7px semantic dot inside the category label instead.

---

## 2. Typography & Weight Ladder

- **Sans**: `'Inter', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, sans-serif`
- **Monospace**: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace` (times, IATA codes, distances, amounts, versions)
- **Weight discipline** (never make everything `700` bold):
  - Page / Card Titles: `600`, tight tracking (`-0.015em` to `-0.02em`)
  - Primary Buttons / Active Tabs: `600`
  - Secondary Buttons / Chips / Labels: `500`
  - Body / Addresses / Metadata: `400` in `--color-text-secondary` / `--color-text-muted`
- Always apply `.tabular-nums` to dates, times, distances, counts, and currency amounts.

---

## 3. Geometry, Elevation & Chrome

- **Radii**: `--radius-sm: 7px`, `--radius-md: 11px`, `--radius-lg: 16px`, `--radius-pill: 9999px`
- **Elevation**: Prefer crisp `1px solid var(--color-border)` + ultra-light shadow (`0 1px 2px rgba(15, 23, 42, 0.04)`) over heavy drop shadows.
- **Sticky / Floating Chrome**: Use translucent frosted glass (`backdrop-filter: blur(12px)`) for sticky headers and mobile bottom navigation.

---

## 4. Microcopy & Voice Rules (Anti-AI-Slop)

1. **Cut filler in half**: Write `尚未新增住宿`, never `尚未新增住宿。在任一天行程加入「住宿」後，系統會自動整理入住區間與換飯店資訊。`
2. **No tutorial parentheses in placeholders**: Write `這一天的主題…`, never `輸入這一天的主軸或主要區域（例如：東釜山體驗日 · 滑車＋天空膠囊）`.
3. **Confident, quiet empty states**: 3–8 words maximum. No exclamation marks unless celebrating a completed action.
4. **No technical jargon in user-facing labels**: Say `設定` (not `設定與 Agent 存取`), `儀表板` (not `旅遊統計儀表板`), `Personal API Tokens` (not `Personal API Tokens（MCP / Agent 用）`).
