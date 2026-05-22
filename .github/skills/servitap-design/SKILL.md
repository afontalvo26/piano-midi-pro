---
name: servitap-design
description: 'ServiTap design system — colors, typography, spacing, components, dark mode, and visual rules. USE WHEN: styling components, choosing colors, adjusting spacing, picking typography, building UI, checking dark mode support, creating new screens, or ensuring visual consistency. Triggers: design, style, color, palette, typography, font, spacing, radius, shadow, dark mode, theme, component style, button, card, input, toggle, tab, badge, avatar, icon, elevation, animation, responsive, mobile-first, DESIGN.md.'
---

# ServiTap — Design Skill

This skill points to the full design system reference.

## Primary Reference

**Read `airtech-app/DESIGN.md`** — the single source of truth for all visual decisions.

## Quick Rules (from DESIGN.md)

1. **Primary CTA**: `var(--color-primaryBlue)` bg + `#FFFFFF` text. Never black buttons.
2. **CSS variables only**: `--servitap-*` (static) and `--color-*` (runtime). Never hardcode hex.
3. **Dark mode**: Every color needs light + dark variant. Controlled by `data-theme` attribute.
4. **Mobile-first**: Base 375px. Use `100dvh`, `env(safe-area-inset-*)`.
5. **Cards**: 16px radius, card shadow, `var(--color-cardBg)` background.
6. **Inputs**: 12px radius, `var(--color-primaryBlue)` focus border.
7. **Tab pills**: 999px radius (full pill), blue active, bordered inactive.
8. **Toggle**: 48×28px track, 22px thumb, `var(--color-primaryBlue)` when on.
9. **Fonts**: Space Grotesk (headings), Inter (body), JetBrains Mono (code), Kanit (brand).
10. **Spacing**: 4px base grid. Scale: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.

## Key Files

| File | Contains |
|------|----------|
| `airtech-app/DESIGN.md` | Full design system reference |
| `src/lib/design-tokens.ts` | JS palette, spacing, typography tokens |
| `src/styles/design-system.css` | CSS variables (light + dark themes) |
| `src/styles/mobile-first.css` | Safe area, viewport, iOS fixes |
| `src/contexts/ThemeContext.tsx` | Runtime theme switching logic |
| `src/components/admin/constants/design.ts` | Admin typography overrides |

## When Styling a New Component

1. Read `DESIGN.md` sections 02 (Colors), 03 (Typography), 04 (Components)
2. Use `var(--color-*)` / `var(--servitap-*)` for all colors
3. Pick radius from section 07, shadow from section 06
4. Test at 375px width in both light and dark mode
5. Verify touch targets ≥ 44px
