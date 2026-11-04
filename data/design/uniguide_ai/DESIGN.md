---
name: UniGuide AI
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#44474f'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#747780'
  outline-variant: '#c4c6d0'
  surface-tint: '#455e90'
  primary: '#00183d'
  on-primary: '#ffffff'
  primary-container: '#0f2d5c'
  on-primary-container: '#7d96cb'
  inverse-primary: '#adc6ff'
  secondary: '#af3017'
  on-secondary: '#ffffff'
  secondary-container: '#fe694a'
  on-secondary-container: '#650d00'
  tertiary: '#001f16'
  on-tertiary: '#ffffff'
  tertiary-container: '#003628'
  on-tertiary-container: '#53a58a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#2c4676'
  secondary-fixed: '#ffdad3'
  secondary-fixed-dim: '#ffb4a4'
  on-secondary-fixed: '#3e0500'
  on-secondary-fixed-variant: '#8d1701'
  tertiary-fixed: '#a0f3d4'
  tertiary-fixed-dim: '#84d6b9'
  on-tertiary-fixed: '#002117'
  on-tertiary-fixed-variant: '#00513e'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  h1-desktop:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h1-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  h2-desktop:
    fontFamily: Playfair Display
    fontSize: 36px
    fontWeight: '600'
    lineHeight: '1.3'
  h3-desktop:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  button-text:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  max-width: 1200px
  gutter: 24px
  margin-mobile: 16px
  section-gap-lg: 80px
  section-gap-md: 48px
  stack-gap: 16px
---

## Brand & Style

This design system is engineered to evoke a sense of prestigious academic heritage combined with modern technological precision. It targets international students and their families who seek a reliable, high-end bridge to global education. 

The visual style is **Corporate / Modern** with a strong leaning toward **Minimalism**. By balancing the editorial authority of high-contrast serif headlines with a clean, functional sans-serif UI, the system establishes immediate trust. The aesthetic is "Academic Premium"—avoiding overly trendy visuals in favor of a structured, timeless layout that suggests stability, intelligence, and success.

## Colors

The palette is rooted in a deep **Primary Navy**, symbolizing tradition and institutional authority. This is punctuated by **Accent Coral**, used sparingly to draw attention to critical calls-to-action and AI-driven insights, providing a warm, human contrast to the scholarly blue. **Success Teal** is reserved for positive outcomes, application milestones, and "verified" statuses.

Neutral tones should favor cool greys and off-whites to maintain a "clean" feel. Backgrounds primarily use white (#FFFFFF) for clarity, with subtle Navy tints for secondary sections to maintain depth without sacrificing readability.

## Typography

The typography strategy employs a "High-Low" pairing. **Playfair Display** is used for all major headings to mirror the typography of elite universities and editorial journals. **Plus Jakarta Sans** handles all functional UI text, navigation, and body copy; its modern, slightly rounded letterforms ensure that the platform feels approachable and legible, even during complex form-filling processes.

For mobile, headline sizes scale down significantly to prevent awkward line breaks, while body text maintains a minimum of 16px to ensure accessibility for non-native English speakers who may rely on high legibility.

## Layout & Spacing

This design system utilizes a **Fixed Grid** model for desktop, centering content within a 1200px container to ensure a focused reading experience on ultra-wide monitors. A 12-column system is used for layout flexibility.

- **Desktop (1200px+):** 12 columns, 24px gutters, auto-margins.
- **Tablet (768px - 1199px):** 8 columns, 24px gutters, 40px side margins.
- **Mobile (Under 768px):** 4 columns, 16px gutters, 16px side margins.

Vertical rhythm is strictly maintained through multiples of 8px. Large sections are separated by 80px gaps to provide "breathing room," reinforcing the premium, unhurried brand feel.

## Elevation & Depth

To maintain a "Clean and Professional" look, this design system avoids heavy shadows in favor of **Tonal Layers** and **Low-contrast Outlines**. 

Depth is primarily achieved by placing cards on a slightly tinted neutral background (#F8F9FA). When shadows are required for interaction (e.g., hovering over a university card), use "Ambient Shadows"—extremely soft, blurred Navy-tinted shadows (Offset: 0, 8px; Blur: 24px; Opacity: 6%) to suggest the element is lifting off the page without creating visual clutter.

## Shapes

The shape language is sophisticated and varied to distinguish between different types of information. **12px rounded corners** are the standard for content containers and cards, providing a modern but structured feel. **8px roundedness** is applied to input fields and text areas to maintain a more "functional" and "precise" appearance. **24px pill-shapes** are reserved exclusively for interactive elements like buttons, tags, and chips, making them instantly recognizable as touchpoints.

## Components

- **Buttons:** Primary buttons use the Pill shape (24px) with the Navy background and white text. Secondary buttons use a Navy outline. Coral is reserved for high-urgency actions like "Submit Application."
- **Cards:** White backgrounds with 12px border-radius and a subtle 1px border (#E5E7EB). On hover, apply a soft ambient shadow.
- **Input Fields:** 8px border-radius with a 1px Grey border. On focus, the border shifts to Primary Navy with a 2px thickness.
- **Chips/Badges:** Small pill-shaped elements used for university rankings or category tags. Use light tinted backgrounds (e.g., 10% opacity of the category color).
- **AI Insight Panels:** Specially designated cards with a very subtle gradient border using the Accent Coral to indicate AI-generated content.
- **Progress Steppers:** Horizontal lines for application tracking, using Success Teal for completed steps and Navy for the current step.