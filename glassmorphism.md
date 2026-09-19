## Glassmorphism Design System — Deep Spec

### Philosophy
Glassmorphism simulates frosted glass as a design material — not as decoration. Every glass surface should feel physically believable: translucent enough to show what's behind it, opaque enough to be legible, with a light-catch edge that makes it feel like it has thickness. The experience should be quiet luxury. Not a nightclub. Not a tech demo. Morning light through a clean window.

The three-layer depth model is the foundation of the whole system:
- **Layer 1 (atmosphere):** The background gradient — warm, airy, without sharp color transitions.
- **Layer 2 (diffusion):** Soft color fields blurred behind glass surfaces — what the glass is reflecting.
- **Layer 3 (surface):** The glass panels themselves — what the user interacts with.

Every design decision should reinforce these three layers. Elements that collapse the depth — stacking heavy blur on blur, using too many glass cards, or using a dark/flat background — break the system.

---

### Background System — The Atmosphere Layer

The background is not a color. It is a field of soft light. The approach:

1. A base gradient (warm cream → soft sage green, or lavender → blush pink) as the page background
2. Radial gradients placed at key positions (top-right for the primary light source, bottom-left for the fill) to create a sense of directional light
3. Optional: a `::before` pseudo-element with a large soft radial-gradient blur for additional depth

```css
/* Warm champagne-to-sage field — calm, premium, not candy */
body {
  background:
    radial-gradient(ellipse 70% 60% at 80% 10%, rgba(180,210,185,0.55) 0%, transparent 60%),
    radial-gradient(ellipse 50% 70% at 15% 85%, rgba(210,195,170,0.4) 0%, transparent 55%),
    linear-gradient(160deg, #F5F0E8 0%, #E8EDE3 45%, #DCE8DC 100%);
}

/* Alternative: cool lavender-to-blush */
body.variant-purple {
  background:
    radial-gradient(circle at 10% 20%, rgba(167,139,250,0.45) 0%, transparent 35%),
    radial-gradient(circle at 85% 75%, rgba(249,168,212,0.38) 0%, transparent 35%),
    linear-gradient(135deg, #C7D2FE 0%, #E9D5FF 35%, #FDE8FF 100%);
}
```

**Rules:**
- Use 2–3 muted tones maximum. Never more than one vivid color.
- Gradients should feel airy and luminous, not saturated or candy-like.
- Backgrounds with warm tones (cream, peach, sage) pair with warm text (#1A2E1F). Cool backgrounds (lavender, blue) pair with cool text (#1E1B4B).
- Never use a flat white or flat dark background — glass has nothing to reflect.
- Avoid animated background orbs in production — they are a tell of AI-generated glassmorphism and add visual noise without depth.

---

### Glass Card Formula — The Surface Layer

Every glass card needs four components working together. Miss any one and it stops reading as glass.

```css
/* Three tiers of glass opacity — use deliberately */

/* Strong glass: hero cards, primary panels */
.glass-strong {
  background: rgba(255,255,255,0.52);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.68);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.9),   /* top edge highlight */
    inset 0 -1px 0 rgba(255,255,255,0.15),  /* subtle bottom edge */
    0 8px 32px rgba(0,0,0,0.06),
    0 2px 8px rgba(0,0,0,0.04);
}

/* Mid glass: feature cards, stat panels */
.glass-mid {
  background: rgba(255,255,255,0.38);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.55);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.8),
    0 8px 24px rgba(0,0,0,0.05);
}

/* Light glass: nested elements, secondary cards */
.glass-light {
  background: rgba(255,255,255,0.26);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.42);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.6),
    0 4px 12px rgba(0,0,0,0.04);
}
```

**The top-edge highlight is the detail that matters most.** `inset 0 1px 0 rgba(255,255,255,0.9)` simulates light hitting the top rim of a glass panel. Without it, glass cards look like semi-transparent boxes. With it, they look like physical objects.

**Depth through blur variation:**
- Hero/foreground cards: `blur(20px)` — stronger blur, lighter fill
- Feature cards: `blur(16px)` — moderate
- Nested/secondary elements: `blur(10px)` — lighter, less fill
- Never exceed `blur(24px)` — it becomes muddy
- Never stack heavy blur on blur — two `blur(20px)` nested cards collapse into fog

**Border-radius:** 20–28px for large panels, 14–18px for medium cards, 10–12px for small elements. Never 0 — sharp edges break the glass metaphor.

---

### Signature Element — The Animated Data Ring

The most distinctive element of a well-executed glassmorphism finance or wellness UI: a circular SVG arc that draws itself on page load, showing a budget percentage, health score, or goal completion.

```html
<svg class="ring-svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Track ring -->
  <circle cx="80" cy="80" r="65" fill="none"
    stroke="rgba(26,46,31,0.08)" stroke-width="8"/>
  <!-- Animated fill ring -->
  <circle cx="80" cy="80" r="65" fill="none"
    stroke="#6B4EFF" stroke-width="8"
    stroke-linecap="round"
    stroke-dasharray="408"
    stroke-dashoffset="408"
    class="ring-fill"/>
</svg>
```

```css
.ring-svg { transform: rotate(-90deg); } /* start from top */
.ring-fill {
  animation: drawRing 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.4s forwards;
}
/* For 76%: dashoffset goes from 408 to 408 * (1 - 0.76) = ~98 */
@keyframes drawRing {
  to { stroke-dashoffset: 98; } /* 408 * (1 - percentage) */
}
```

The ring sits inside the hero glass card. The center shows the percentage in a serif display font. Below it: a spend breakdown with small category rows (dot indicator, label, mini bar, amount).

**Dashoffset formula:** `stroke-dashoffset_end = circumference * (1 - percentage)`
Circumference = `2 * π * r` = `2 * 3.14159 * 65` ≈ `408`

---

### Color System

Two roles: **background palette** (warm neutrals) and **accent** (one vivid color).

```
Background palette (warm):
  Cream base:    #F5F0E8  — page bg start
  Sage light:    #E8EDE3  — page bg mid
  Sage:          #DCE8DC  — page bg end / secondary sections
  These three should feel like one continuous field, not three colors.

Text system:
  Deep green:    #1A2E1F  — primary headings and body
  Mid green:     #3D4F3F  — secondary text, card titles
  Sage muted:    #7A8C7C  — captions, labels, placeholder text
  These are warm-toned near-blacks — never use #000000 or #333333.

Accent (one only):
  Violet:        #6B4EFF  — ALL interactive elements
  Violet dark:   #5038E0  — hover state
  Violet tint:   rgba(107,78,255,0.10)  — tag backgrounds, ghost buttons

Supporting data colors (for charts and category tags only):
  Green:   #3AB07A  — savings, positive
  Amber:   #F59E0B  — warning, secondary category
  Pink:    #E879F9  — tertiary category
```

**Rules:**
- The accent color (`#6B4EFF`) is the only vivid color on the page. Use it on primary CTAs, active states, chart fills, and key numbers.
- Never use warm red (`#EF4444`) or sharp blue (`#2563EB`) as the primary accent — they fight with the warm background.
- Logo gradient text (common in AI glassmorphism) is a cliché — use solid color or italic serif instead.
- Data category colors appear only inside charts and tags, never in structural UI.

---

### Typography

Pair a warm editorial serif for headings with a clean geometric sans for body and UI.

```
Display / Headings:  'DM Serif Display' — warm, editorial, slightly unexpected
                     Alternatives: 'Playfair Display', 'Cormorant Garamond'
Body / UI:           'DM Sans' — clean, geometric, pairs well with DM Serif
                     Alternatives: 'Inter', 'Plus Jakarta Sans'

Scale:
  H1 (hero):          clamp(38px, 5.5vw, 64px) / serif / weight default (400) / leading 1.05 / tracking -0.02em
  H2 (section):       clamp(28px, 4vw, 44px)   / serif / leading 1.15 / tracking -0.02em
  Card title:         18–22px                   / serif / leading 1.25
  Body:               15–16px                   / sans  / weight 400 / leading 1.72 / color muted
  Label / eyebrow:    11px                      / sans  / weight 600 / uppercase / tracking 0.1em / violet
  Caption:            12px                      / sans  / weight 400 / color muted
  Price display:      44–52px                   / serif / weight default / tracking -0.04em
  Numbers in cards:   22–34px                   / serif / tracking -0.02em

Key technique — italic in headings:
  <h1>Your money, <em>in full view.</em></h1>
  The italic creates warmth and distinction without a second typeface.
  The non-italic should be the dominant weight (900 or bold), the italic the accent.
```

**Rules:**
- Never use Inter for headings in glassmorphism — it reads as generic SaaS, not premium consumer.
- Text on glass must use deep-toned near-blacks, not pure `#000` or light-gray. On a warm background, warm near-blacks (`#1A2E1F`) look intentional; cool blacks look like accidents.
- Avoid heavy weights (900) for body paragraphs — the lightness of the aesthetic is broken by dense text.

---

### Navigation

Pill-shaped floating nav, max-width 860px, centered. Slightly more opaque than body cards — it floats clearly above content.

```css
.nav-wrap { position: sticky; top: 18px; z-index: 100; display: flex; justify-content: center; }

nav {
  width: 100%; max-width: 860px;
  padding: 11px 16px; border-radius: 999px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: rgba(255,255,255,0.52);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.7);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 24px rgba(26,46,31,0.06);
}

.nav-logo { font-family: 'DM Serif Display', serif; font-size: 19px; color: #1A2E1F; }
.nav-logo em { font-style: italic; color: #6B4EFF; }

.nav-links a {
  font-size: 13.5px; font-weight: 500; color: #7A8C7C;
  text-decoration: none; padding: 6px 13px; border-radius: 999px;
  transition: color 150ms, background 150ms;
}
.nav-links a:hover { color: #1A2E1F; background: rgba(255,255,255,0.5); }
```

**Do not** use a full-width nav with a solid background — it destroys the layered depth of the page. The pill nav floats visually, reinforcing the glass aesthetic.

---

### Buttons

Three button types, ordered by visual weight:

```css
/* Primary: solid accent — the heaviest element on the page */
.btn-primary {
  background: #6B4EFF; color: #fff;
  padding: 12px 22px; border-radius: 12px; font-size: 14px; font-weight: 500;
  box-shadow: 0 6px 20px rgba(107,78,255,0.32), inset 0 1px 0 rgba(255,255,255,0.2);
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
}
.btn-primary:hover { transform: translateY(-2px); background: #5038E0; box-shadow: 0 12px 32px rgba(107,78,255,0.38); }

/* Ghost: glass treatment, secondary action */
.btn-ghost {
  background: rgba(255,255,255,0.42); color: #1A2E1F;
  padding: 11px 20px; border-radius: 12px; font-size: 14px; font-weight: 500;
  border: 1px solid rgba(255,255,255,0.65);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  transition: transform 180ms ease, background 180ms ease;
}
.btn-ghost:hover { transform: translateY(-2px); background: rgba(255,255,255,0.58); }

/* Accent ghost: tinted violet, tertiary or per-plan action */
.btn-accent-ghost {
  background: rgba(107,78,255,0.10); color: #6B4EFF;
  padding: 11px 20px; border-radius: 12px; font-size: 14px; font-weight: 500;
  border: 1px solid rgba(107,78,255,0.25);
  transition: transform 180ms ease, background 180ms ease;
}
.btn-accent-ghost:hover { transform: translateY(-2px); background: rgba(107,78,255,0.16); }
```

The solid primary button is the **only non-glass element** on the page. It should feel grounded and heavy relative to everything around it — this contrast makes it the clearest CTA.

---

### Feature Bento Grid

An asymmetric bento layout works better than a uniform feature grid in glassmorphism. The size variation creates compositional interest and allows cards to show mini-visualisations, not just text.

```css
.bento {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 16px;
}
.bento-card.tall { grid-row: span 2; }     /* left tall card */
.bento-card.wide { grid-column: span 2; }  /* bottom wide card */
```

Card content hierarchy:
1. Eyebrow label (10px, uppercase, violet, tracking 0.1em)
2. Title (serif, 18–22px)
3. Description (2–3 sentences max, 13px, muted)
4. **Mini-visualisation** — this is what makes the bento feel like a product demo, not a features list

Mini-visualisation types per card:
- **Spending card (tall):** 7-bar mini bar chart + category pill cloud
- **Goals card:** 3 goal progress bars with labels and percentages
- **Alerts card:** 2 notification row items showing real alert examples
- **Insight card (wide):** Text insight on the left + SVG trend line on the right

---

### Pricing Section

The featured plan breaks the glass pattern — it uses the dark text color (`#1A2E1F`) as a solid background, making it visually anchor the pricing grid. Dark card on light background is the highest-contrast treatment possible in a glass system.

```css
/* Non-featured plans: glass treatment */
.plan { background: var(--glass-mid); backdrop-filter: blur(16px); border: 1px solid var(--glass-border-mid); }

/* Featured plan: solid dark — stands apart from all glass elements */
.plan-featured { background: #1A2E1F; border: none; }
.plan-featured .plan-name  { color: rgba(255,255,255,0.5); }
.plan-featured .plan-price { color: #fff; }
.plan-featured .plan-features li { color: rgba(255,255,255,0.75); }
```

Monthly/annual toggle uses a `<div>` toggle (not a native checkbox) styled as a pill with a sliding thumb. The annual state is the default (active) — it shows the lower price, encouraging annual sign-ups.

```css
.toggle { width: 48px; height: 26px; background: rgba(26,46,31,0.1); border-radius: 999px; cursor: pointer; position: relative; transition: background 200ms; }
.toggle.on { background: #6B4EFF; }
.toggle-thumb { width: 20px; height: 20px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 2px; box-shadow: 0 1px 4px rgba(0,0,0,0.15); transition: transform 200ms ease; }
.toggle.on .toggle-thumb { transform: translateX(22px); }
```

---

### Motion Principles

Only three types of animation in this system. Everything else is instant.

**1. On-load data reveals** (the signature moments):
- SVG ring draws itself: `stroke-dashoffset` animates from full circumference to target value
- Bar chart bars scale up from bottom: `transform: scaleY(0) → scaleY(1)`, `transform-origin: bottom`
- Goal progress bars extend from left: `transform: scaleX(0) → scaleX(1)`, `transform-origin: left`
- Timing: 0.9s–1.4s, `cubic-bezier(0.4, 0, 0.2, 1)`, delayed 300–600ms after page load

**2. Hover interactions** (micro-feedback):
- Cards and buttons: `translateY(-2px)` to `-4px` over 180–200ms ease
- Shadow deepens on hover: `box-shadow` transitions to larger offset + slightly higher opacity
- Never use `scale()` on cards — it causes layout shift in complex glass compositions

**3. Billing toggle** (state change):
- Pill slides: `transform: translateX(22px)` over 200ms ease
- Price number updates immediately (no animation needed)
- Background color transition: 200ms

```css
@media (prefers-reduced-motion: reduce) {
  .ring-fill, .mbar, .goal-fill, .spend-bar { animation: none !important; }
  .bento-card, .btn { transition: none !important; }
}
```

---

### What NOT to Do
- ✗ NEVER use animated drifting orbs — they are the most recognisable AI glassmorphism cliché
- ✗ NEVER use a flat white or flat dark background — glass has nothing to reflect
- ✗ NEVER nest heavy blur inside heavy blur — blur on blur creates fog, not depth
- ✗ NEVER use gradient text for the logo — it reads immediately as templated
- ✗ NEVER use emoji as feature card icons — use mini SVG visualisations or solid icon shapes
- ✗ NEVER use Inter for headings — pair a warm serif with the sans instead
- ✗ NEVER use pure black (`#000`) or pure white (`#fff`) as text colors — use warm near-blacks
- ✗ NEVER use a full-width solid nav — the pill nav floating above the page reinforces depth
- ✗ NEVER make every plan a glass card — the featured plan should be solid to anchor the grid
- ✗ NEVER add more than one vivid accent color — the entire system works because one violet grounds it

### Data to Replace (Placeholder Map)
- `[PRODUCT_NAME]` — logo in nav and footer, referenced in copy
- `[TAGLINE]` — hero heading, split across normal and italic lines
- `[HERO_SUB]` — 2–3 sentences, 16px, muted color, max 50 words
- `[RING_PERCENTAGE]` — the primary metric shown in the hero card ring (0–100)
- `[SPEND_CATEGORIES]` — 4 rows: name, percentage, hex color, dollar amount
- `[HERO_STATS]` — 2 mini stat cards: label, value, change string
- `[PROOF_STATS]` — 4–5 social proof numbers: value, label
- `[BENTO_CARDS]` — array of: tag, title, description, visualisation type
- `[GOALS]` — 3 goal progress items: label, percentage
- `[ALERTS]` — 2 notification examples: icon, title, subtitle
- `[INSIGHT_TEXT]` — one sentence data insight + supporting sentence
- `[PRICING_TIERS]` — 3 tiers: name, monthly price, annual price, feature list
- `[CTA_LABEL]` — primary button text
- `[TRUST_TEXT]` — e.g. "No credit card · Cancel anytime"
