# Design

Source: IKEA.com tokens (design-extractor.com/gallery/ikea) + the IKEA paper manual.

## Colour
| Token | Value | Use |
| --- | --- | --- |
| canvas | #FFFEFB | page and 3D background |
| ink | #111111 | text, part outlines, dark buttons |
| ink-soft | #484848 | secondary text |
| hairline | #DADADA | 1 px dividers, control outlines |
| hover | #F5F5F5 | ghost button hover |
| blue | #0058A3 | primary action (Next), active parts, arrows |
| yellow | #FFDB00 | warnings, finished (glossy) face, current step marker |
| yellow-hover | #FFF094 | |

Yellow never carries body text on white; text on yellow is ink.

## Type
Noto Sans (stand-in for proprietary Noto IKEA), 400 and 700 only. Display uses negative tracking (-0.04em at 64 px+). Step numeral is the largest thing on screen.

## Shape and elevation
Flat. No box-shadows, no blur. Separation by hairlines and colour blocks. Buttons are 56 px pills; icon buttons are 56 px circles; panels 8 px radius. Focus ring: inset 1 px ink / 3 px canvas / 4 px ink.

## 3D
Manual line-drawing look: parts are canvas-white with ink edges. Active parts get blue edges, inactive parts fade to light grey edges. Glossy face is a yellow wash with a yellow label. Arrows are blue. No visible floor edge; only soft contact shadow.
