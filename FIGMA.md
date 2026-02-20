# Figma design handoff – Risk Game

Use this guide when designing the new look in Figma so that implementation is a simple token swap.

## How the app is built

- **HTML + CSS** for layout, buttons, turn indicator, tooltip, combat log, and modals.
- **SVG** for the hex map (territories, borders, army dots). Territory fill colors are **dynamic** (one per team); everything else uses design tokens.
- **Design tokens** live in `src/design-tokens.css` as CSS custom properties (`:root { --token-name: value; }`). The rest of the UI references them with `var(--token-name)`.

When your design is ready, update the values in `src/design-tokens.css` to match. Optionally, you can define the same token names in Figma (e.g. as variables or in a style guide) for a 1:1 handoff.

---

## Token list (use these names in Figma)

### Background & surface
| Token | Purpose |
|-------|--------|
| `color-bg-page` | Main page background |
| `color-bg-surface` | Map container background |
| `color-bg-panel` | Turn indicator panel |
| `color-bg-overlay` | Modal overlay (victory/defeat/surrender) |
| `color-bg-tooltip` | Territory tooltip background |
| `color-bg-combat-log` | Combat log panel |
| `color-bg-modal` | Modal card background (victory content, game start) |

### Text
| Token | Purpose |
|-------|--------|
| `color-text-primary` | Headings (e.g. "Risk Game") |
| `color-text-secondary` | Body/secondary text |
| `color-text-muted` | Turn number, stats |
| `color-text-inverse` | White text on dark (tooltip, combat log) |
| `color-text-on-button` | Button label color |

### Buttons
| Token | Purpose |
|-------|--------|
| `color-btn-primary` | Default buttons (Small/Medium/Large, modal primary) |
| `color-btn-primary-hover` / `-active` / `-disabled` | States |
| `color-btn-focus-ring` | Focus outline |
| `color-btn-success` | End Turn, Start Game, game start CTA |
| `color-btn-success-hover` | |
| `color-btn-info` / `-hover` | Fast Forward (default) |
| `color-btn-warning` | Fast Forward when active |
| `color-btn-danger` / `-hover` | Surrender, confirm danger |
| `color-btn-cancel` / `-hover` | Modal Cancel |

### Turn indicator
| Token | Purpose |
|-------|--------|
| `color-turn-border` | Default border (also used when game over) |
| `color-turn-border-game-over` | (Currently same as accent danger; border is overridden in code by team color during play) |

### Map (SVG)
| Token | Purpose |
|-------|--------|
| `color-map-empty-hex` | Empty/impassable hex fill |
| `color-map-territory-border` | Default territory outline |
| `color-map-selection-border` | Selected territory (e.g. white) |
| `color-map-valid-target-border` | Valid attack target (e.g. red) |
| `color-map-valid-target-border-pulse` | Pulse animation accent |
| `color-army-dot-fill` | Filled army dot (3D sphere) |
| `color-army-dot-empty-fill` | Empty army dot (dark inset hole) |

### Accent / semantic
| Token | Purpose |
|-------|--------|
| `color-accent-danger` | Defeat, Surrender, “Click to attack!” |
| `color-accent-divider` | Combat log entry divider |

### Spacing
| Token | Typical use |
|-------|-------------|
| `space-xs` … `space-3xl` | Gaps, padding, margins (4px–40px) |

### Border radius
| Token | Use |
|-------|-----|
| `radius-sm` | Buttons, tooltip |
| `radius-md` | Turn indicator, combat log |
| `radius-lg` | Map container |
| `radius-xl` | Modals |

### Typography
| Token | Use |
|-------|-----|
| `font-family` | Body and UI |
| `font-size-xs` … `font-size-3xl` | 0.875rem–2.5rem |
| `font-weight-normal` / `font-weight-bold` | |

### Shadows
| Token | Use |
|-------|-----|
| `shadow-button-active` | Pressed state (size/active buttons) |
| `shadow-map` | Map container |
| `shadow-modal` | Modal cards |

---

## UI inventory (what to design)

1. **Header** – Title “Risk Game” (text primary, large).
2. **Controls** – Row of buttons: Small, Medium, Large (map size), End Turn, Fast Forward, Surrender. States: default, hover, active (size selected / fast-forward on), disabled.
3. **Turn indicator** – Card showing: turn number, current team name (dynamic color), phase text. Border color is set in code to current team color during play.
4. **Map container** – Rounded panel containing the SVG map. Map content is generated in code (hex grid, territory fills, borders, army dots).
5. **Stats** – One line of text under the map (muted).
6. **Combat log** – Scrollable list of combat messages (muted text; first entry emphasized).
7. **Tooltip** – Floating label on hex hover (inverse text on dark background).
8. **Modals** – Overlay + card: Victory, Defeat, Surrender confirmation, Surrendered, Game start (team name in dynamic color). Buttons: primary (e.g. “New game”), cancel, danger (Surrender).

**Dynamic (not tokens)**  
- Territory/team colors: defined in `src/colors.ts` (`TERRITORY_COLORS`) and `src/game.ts` (team names + optional overrides). Change those arrays to match your palette.  
- Turn indicator border and modal team name color are set in code from the current team’s color.

---

## Responsive layouts (iOS Universal)

Design for these breakpoints:

| Device | Width | Category |
|--------|-------|----------|
| iPhone SE | 375pt | Compact |
| iPhone Pro | 393pt | Compact |
| iPhone Pro Max | 430pt | Compact |
| iPad Mini | 744pt | Regular |
| iPad Pro 11" | 834pt | Regular |
| iPad Pro 12.9" | 1024pt | Regular |

### Compact layout (iPhone)

- **Map** – Fills most of screen; pinch to zoom if needed
- **Bottom action bar** – Essential buttons only: `[End Turn]` `[⋯ Menu]`
- **Menu sheet** – Contains: map size, fast forward, surrender
- **Turn indicator** – Minimal top bar (team color accent, turn number)
- **Stats / Combat log** – Bottom sheet (swipe up to reveal)
- **Territory info** – Bottom sheet on tap (replaces hover tooltip)
- **Modals** – Full-screen or large sheet

### Regular layout (iPad)

- Current desktop layout works well
- Optional: sidebar for stats/combat log
- All buttons visible in top controls
- Hover states work with trackpad/Apple Pencil
- Modals as centered cards with overlay

### iOS-specific considerations

| Token | Value | Purpose |
|-------|-------|---------|
| `touch-target-min` | 44px | Minimum tap target (Apple HIG) |
| `safe-area-top` | `env(safe-area-inset-top)` | Notch/Dynamic Island |
| `safe-area-bottom` | `env(safe-area-inset-bottom)` | Home indicator |

**Interaction differences:**
- No hover states on iPhone – use pressed/highlighted states instead
- Tap territory to select (not click)
- Consider haptic feedback for: selection, attack, victory/defeat
- Swipe gestures: swipe up for stats, swipe down to dismiss sheets

---

## Exporting from Figma

- **Colors / spacing / typography** – Copy the values into `src/design-tokens.css` using the token names above. Figma variables or a style guide with the same names make this straightforward.
- **Icons** – If you add icons (e.g. for End Turn, Surrender), export as SVG and we can add them as inline SVG or `<img>` and style with CSS.
- **Backgrounds / imagery** – Export as PNG or WebP; reference in CSS (e.g. `background-image`) or in the HTML. Prefer assets in a single folder (e.g. `assets/`) for the build.
- **Fonts** – If you use a custom font, add the font file and `@font-face` in CSS, then set `--font-family` in `design-tokens.css`.

---

## After updating tokens

1. Edit `src/design-tokens.css` with your new values.
2. If you changed territory/team colors, update `src/colors.ts` and optionally `src/game.ts` (team names/palette).
3. Run the app (e.g. open `index.html` via a local server or your usual build) and check layout on different viewport sizes if you’re also targeting mobile.
