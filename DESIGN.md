# Tripilot Design System (`DESIGN.md`)

**Aesthetic Direction**: **Editorial Travel & Precision Aviation** (calm warm-alabaster paper canvas, crisp hairline borders, matte deep ink-navy topbar with burnished champagne gold accents, and high-contrast editorial typography).

All visual tokens live in [`apps/web/src/styles/tokens.css`](apps/web/src/styles/tokens.css), and reusable UI primitives live in [`apps/web/src/styles/components.css`](apps/web/src/styles/components.css).

---

## 1. Color Palette & Surface Hierarchy

| Token | Value | Role |
|---|---|---|
| `--color-bg` | `#F8F7F4` | Primary warm-alabaster app canvas |
| `--color-surface` | `#FFFFFF` | Elevated cards, modals, panels |
| `--color-surface-muted` | `#EEECE6` | Segmented control tracks, subtle chip wells |
| `--color-border` | `rgba(20, 24, 31, 0.09)` | 1px hairline dividers & card outlines |
| `--color-primary` | `#162136` | Deep ink-navy for primary CTAs, headings, flight boarding passes |
| `--color-primary-tint` | `#EEF3FA` | Quiet blue-tinted hover/active well |
| `--color-topbar-bg` | `rgba(20, 29, 46, 0.94)` | Matte translucent deep-navy top navigation bar |
| `--color-accent` | `#C4924C` | Burnished champagne gold for active highlights & spend cues |
| `--color-accent-ink` | `#8B652D` | High-contrast gold ink on light surfaces |
| `--color-alert` | `#C84B3B` | Destructive actions, required asterisks, free-cancel warnings |

### Semantic Item & Map Colors (1:1 Card Dot ↔ Map Pin Sync)
| Token | Value | Item / Category |
|---|---|---|
| `--item-flight` | `#162136` | `FLIGHT` |
| `--item-reserved` | `#2F5FB3` | `RESERVED_TRANSIT` / `TRANSIT` |
| `--item-stay` | `#C4924C` | `STAY` / `LODGING` |
| `--item-food` | `#D45D42` | `FOOD` |
| `--item-spot` | `#2E7D62` | `SPOT` / `ACTIVITY` |
| `--category-shopping` | `#7C5CBF` | `SHOPPING` |
| `--category-other` | `#8B93A1` | `OTHER` |

### Restraint Rule
- **90% warm neutral canvas + white surfaces + deep ink.**
- Never use thick colored left stripes on cards — pair a quiet 7px semantic dot on each card with the matching colored pin on the interactive map.

---

## 2. Typography & Type Scale

- **Display / Editorial Serif (`--font-display`)**: `'Newsreader', 'Noto Serif TC', Georgia, serif` — page titles, trip card titles, dashboard hero KPI numerals, expenses hero total.
- **UI Sans (`--font-sans`)**: `'Inter', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` — body copy, controls, itinerary items.
- **Monospace (`--font-mono`)**: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace` — IATA codes, versions, API tokens.

### Centralized Card Type Scale
- `--text-card-hero: 1.3rem` (Trip card serif title)
- `--text-card-title: 0.98rem` (Itinerary card title)
- `--text-card-body: 0.79rem` (Notes & body copy, `line-height: 1.55`)
- `--text-card-meta: 0.78rem` (Unified size for destinations, dates, addresses)
- `--text-badge: 0.71rem` (Compact category, country, day, and countdown pills)

### Weight Discipline
- Prefer `600` for headings, card titles, primary CTAs, and active tabs (avoid heavy `700`/`800` walls of bold text).
- Use `500` for secondary buttons, form labels, and metadata chips; `400` for body/addresses.
- Always apply `.tabular-nums` to dates, times, distances, counts, and currency amounts.

---

## 3. Geometry, Elevation & Chrome

- **Unified Radii Grammar**: `--radius-xs: 5px`, `--radius-sm: 7px`, `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-pill: 9999px`
  - **Containers (`--radius-md` / `--radius-lg`)**: Cards, panels, modals, dropdown menus.
  - **Controls & Chips (`--radius-sm`)**: All rectangular buttons, segmented control tracks, form inputs, day ticks, and selectable chips.
  - **Thumbs & Badges (`--radius-xs`)**: Active thumbs inside segmented controls and compact inline metadata badges.
  - **Circles & Floating Map Chrome (`--radius-pill` / `50%`)**: Map pins/overlays, circular avatars/icon buttons, status dots, and progress bars.
- **Elevation**: Crisp `1px solid var(--color-border)` + ultra-light shadow (`var(--shadow-card)`) over heavy drop shadows.
- **Chrome**: Translucent frosted glass (`backdrop-filter: blur(14px)`) for the matte navy topbar and mobile bottom navigation.

---

## 4. Microcopy & Voice Rules

1. **Cut filler in half**: Write `尚未新增住宿`, never multi-sentence instructional walls.
2. **No tutorial parentheses in placeholders**: Keep placeholders concise and natural.
3. **Confident, quiet empty states**: 3–8 words maximum.
4. **No technical jargon in user-facing labels**: Use `設定`, `儀表板`, `Personal API Tokens`.
