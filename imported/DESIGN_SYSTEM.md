---
name: Vibrant Social
source: projects/10373134342697745559
font: Rubik
colorMode: LIGHT
colorVariant: FIDELITY
customColor: "#ff6b6b"
roundness: ROUND_FULL
---

## Brand & Style

The design system is built to facilitate face-to-face connection through a digital medium. The brand personality is grounded in "improv energy"—unpredictable and high-spirited, yet anchored by a professional, reliable underlying structure.

The visual style follows a **Modern Tactile** approach. It avoids the aggressive, neon-soaked tropes of traditional mobile gaming in favor of a warm, inviting atmosphere that feels like a premium physical board game. We use generous whitespace to allow the "chaos" of the game content to breathe, ensuring that even in the heat of a timed round, the interface remains a calm, functional partner to the players. The emotional response should be one of safety, excitement, and clarity.

## Colors

- **Primary (Coral) `#ff6b6b`:** Action states — primary buttons, timers, critical UI feedback.
- **Secondary (Teal) `#4ecdc4`:** Success / secondary active states.
- **Background `#fbfaee`:** Soft cream — reduces eye strain, feels organic.
- **On-Surface `#1b1c15`:** Primary text.
- **On-Surface-Variant `#584140`:** Secondary/muted text.
- **Surface-Container `#efeee3`:** Card backgrounds.
- **Outline `#8c706f`:** Borders / dividers.

## Typography — Rubik throughout

| Token | Size | Weight | Line Height |
|-------|------|--------|-------------|
| display-lg | 48px | 700 | 56px, -0.02em |
| headline-lg | 32px | 600 | 40px |
| headline-lg-mobile | 28px | 600 | 36px |
| body-lg | 20px | 400 | 30px |
| body-md | 16px | 400 | 24px |
| label-xl | 18px | 500 | 22px, +0.05em |

## Spacing (8px base unit)

| Token | Value |
|-------|-------|
| unit | 8px |
| container-margin | 24px |
| gutter | 16px |
| stack-sm | 8px |
| stack-md | 16px |
| stack-lg | 32px |

## Roundness

- Primary buttons: full pill
- Cards / containers: 2rem (32px)
- Input fields: 1.5rem (24px)

## Key Components

- **Timer Bar:** 12px thick pill track, teal→coral color transition as time depletes
- **Turn Indicator:** Circular avatar with breathing scale animation on active player
- **Game Cards:** 32px radius, subtle 1px border, soft diffused shadow (blur 20px, opacity 8%)
- **Primary Button:** 60px height, coral fill, Rubik 600 white text, inner-glow border
- **Selection Chips:** Pill shape, 5% primary tint unselected → solid primary active
- **Feedback Toasts:** Slide from top, deep charcoal background for contrast
