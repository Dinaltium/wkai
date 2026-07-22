# WKAI — Design Audit (Student Web App + Instructor Desktop App)

`$impeccable audit` · 2026-07-03 · register: **product** (design serves the task)

Code-level audit (no running app available in-session; all findings verified from source). Both apps are dark, restrained, Tailwind-based product UIs sharing one visual language.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 / 4 | Student secondary-text contrast failed AA (fixed); focus-visible + reduced-motion were missing (fixed at the base layer; per-button focus still uneven) |
| 2 | Performance | 4 / 4 | Lean. No layout-property animation, no heavy filters, smooth-scroll + capped stagger only |
| 3 | Responsive | 3 / 4 | Sensible `min-w-0`/truncate/`hidden md:` usage; touch targets run under 44px on tabs + icon buttons |
| 4 | Theming | 3 / 4 | Solid token system, but the two apps' tokens drifted (student `text-dim` was wrong; extra `surface2`/`muted` only in student) |
| 5 | Anti-Patterns | 3 / 4 | Genuinely restrained — not AI slop. One landing eyebrow (fixed); uppercase category labels are borderline but functional |
| **Total** | | **16 / 20** | **Good** — address the weak a11y/responsive edges; no overhaul needed |

## Anti-Patterns Verdict — PASS

This does **not** read as AI-generated. It reads as a competent dark product tool. Evidence: semantic color is used for meaning (guide cards tinted by type: step=indigo, tip=yellow, code=emerald, check=purple), not decoration; empty states teach ("Your guide will appear here as your instructor teaches"); form labels sit above inputs; icons are one family (Lucide) at consistent sizes; radii are sane (8–12px, never over-rounded); motion is subtle and state-conveying. No gradient text, no glassmorphism, no hero-metric template, no nested cards, no 3-equal-card grids. The only slop tell was one uppercase-tracked eyebrow on the student landing hero (now removed).

## Fixed in this pass (committed)

- **[P1 a11y] Student secondary-text contrast** — `text-dim`/`muted` was `#6b7280` (~3.9:1 on `#0f1117`, below AA 4.5:1) and drove all dim + placeholder text. Bumped to `#9ca3af` (~7:1), matching the instructor app.
- **[P2 a11y] No keyboard focus rings** — added `focus-visible` ring to the shared `.btn` class in both apps.
- **[P2 a11y] No reduced-motion support** — added the standard `prefers-reduced-motion` reset to both apps (card slide-ups, ping/pulse live dots, `active:scale` now collapse).
- **[P3] Landing eyebrow** — removed the uppercase-tracked "Live Workshops" kicker; balanced the headline.

## Remaining findings

### [P2 a11y] Focus states only on `.btn`, not inline buttons
Many interactive elements are raw `<button>` with hover-only styling and no `focus-visible` ring: `TabBar` tabs, `RoomHeader` Leave, `GuideFeed` copy button, most icon buttons. Keyboard users get the browser default outline (better than nothing) but it's inconsistent with the new `.btn` treatment. **Fix:** a shared `focus-visible` utility applied to these, or route them through `.btn-ghost`. → `$impeccable harden`

### [P2 responsive] Touch targets under 44px
`TabBar` buttons are `py-2.5` (~36px tall); several icon buttons (copy, Leave, header controls) are ~24–28px. Fine for mouse, tight for touch/tablet. WCAG 2.5.5 wants ~44px. **Fix:** raise tab height and pad small icon buttons to a 44px hit area (padding can exceed the visual glyph). → `$impeccable adapt`

### [P2 theming] Cross-app token drift
The two apps redefine the same `wkai` palette separately and had diverged (`text-dim` mismatch, now aligned; student also has `surface2`/`muted` the instructor lacks). **Fix:** extract a single shared token source (or at least keep the two in lockstep) so a color change doesn't have to be made twice. → `$impeccable extract`

### [P3] Redundant copy in GuideFeed empty state
Shows both "Waiting for content" (heading) and "Waiting for session content" (footer pill) — the same message twice. **Fix:** drop or differentiate one. → `$impeccable clarify`

### [P3] Uppercase-tracked category labels
`uppercase tracking-widest` on guide-card type labels (STEP/TIP/CODE) and `uppercase tracking-wide` on SetupPage form labels. Defensible as functional component labels (not section eyebrows), but sentence-case or lighter tracking would feel less templated. Low priority — leave unless polishing. → `$impeccable typeset`

## Positive findings (keep / replicate)

- Semantic color system used for meaning, not decoration.
- Empty states that teach the interface.
- Labels-above-inputs; optional fields marked inline.
- Truncation + `min-w-0` handling in the header (won't overflow on long titles).
- Connection state surfaced ("Live" / "Reconnecting…") with a status dot.
- Copy-to-clipboard with a confirmed state.
- Consistent Lucide icon family and button vocabulary.

## Recommended next actions (priority order)

1. **[P2] `$impeccable harden`** — extend focus-visible to inline/icon buttons across both apps.
2. **[P2] `$impeccable adapt`** — raise touch targets (tabs + icon buttons) to ~44px.
3. **[P2] `$impeccable extract`** — unify the two apps' design tokens into one source.
4. **[P3] `$impeccable clarify`** — de-duplicate the empty-state copy.
5. **[P3] `$impeccable polish`** — final pass once the above land.

Overall: **16/20, Good.** The design is on the right side of the AI-slop line already; the remaining work is a11y/responsive hardening and token unification, not a redesign.
