# tappStudio brand colors

Single source of truth: [`colors.json`](colors.json). To change the palette, edit it and run:

```bash
python3 brand/build.py          # tokens + all generated images (needs Chrome and macOS sips)
python3 brand/build.py --css-only   # tokens and manifest only
```

Current accent: **deep teal**. Dark theme `#14b8a6`, light theme `#0d9488`
(previously orange `#ff6b2c` / `#d94e12`).

## Files the build script writes

| File | What changes |
| --- | --- |
| `index.css` | `--accent`, `--accent-ink`, `--accent-soft` inside the `brand:dark` and `brand:light` marker comments. Everything on the page (buttons, links, nav wordmark, nav tS logo, glow, highlights) reads these variables. |
| `manifest.json` | `theme_color`, `background_color` (from `dark.bg`) |
| `favicon.png`, `favicon.ico` | tS mark, transparent, tight crop (16/32/48px) |
| `apple-touch-icon.png` | 180px, tS on the dark background |
| `public/images/icon-192.png`, `icon-512.png` | Manifest icons, tS on the dark background |
| `public/images/logo.svg`, `logo.png` | tS, transparent, dark-theme colors (for dark backgrounds; used in JSON-LD) |
| `public/images/logo_dark.svg`, `logo-dark.png` | tS, transparent, light-theme colors (for light backgrounds) |
| `public/images/ts-logo-512-transparent.png` | Same as `logo.png` |
| `public/images/ts-logo-512-white.png` | tS on white, light-theme colors |
| `public/images/og-image.jpg` | 1200x630 link-preview image for WhatsApp / X |

## Templates (edit these to change layout, not color)

- `templates/ts.svg`: the tS glyph paths; `{{T}}` colors the "t", `{{S}}` the "S".
- `templates/og.html`: the Open Graph image layout. Colors are `{{ACCENT}}`, `{{MUTED}}`, `{{BG}}`, `{{TEXT}}`.

## Not covered

- The inline nav logo in `index.html` uses `var(--accent)` and `var(--muted)`, so it follows the CSS tokens.
- App pages with their own styling (`mydeen/`, `splitup/`, `aifunkit/`) and the app screenshots and icons under `public/apps/` are separate products and keep their own colors.
- After deploying, browsers and X/WhatsApp cache favicons and link previews; expect a delay (X Card Validator or `?v=2` refreshes the preview).

## Mascot

`python3 brand/mascot.py` generates the tS mascot (the teal character from the social posts) in eight expressions
(`neutral`, `wave`, `happy`, `thinking`, `surprised`, `sad`, `sleeping`, `wink`) as SVG and transparent 512px PNG
into `public/images/mascot/`. Needs headless Chrome and Pillow.
