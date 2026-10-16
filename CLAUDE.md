# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static site for tappStudio (https://tappstudio.in, served from `www.tappstudio.in` per `CNAME`), an independent app studio that showcases its own products. The site is the studio's home, not a sales or hiring page, so keep copy free of pitches and don't state what the studio does or doesn't take on. It is published directly from the repo with GitHub Pages: no package.json, no bundler, no framework, no test suite. Plain HTML, CSS and vanilla JS. Work happens on `release`; `main` is the default branch for PRs.

## Commands

```bash
python3 -m http.server 8123          # local preview (also the "static-site" entry in .claude/launch.json)
python3 brand/build.py               # regenerate color tokens + favicons/logos/OG image (needs Chrome + macOS sips)
python3 brand/build.py --css-only    # regenerate only tokens in index.css and manifest.json
```

The pricing engine can be exercised from Node without a browser, since `pricing/config.js`, `engine.js` and `rates.js` also set `module.exports`:

```bash
node -e "const c=require('./pricing/config.js'),E=require('./pricing/engine.js');console.log(E.computeQuote({type:'mobile'},c))"
```

## Layout

- `index.html` / `index.css` / `index.js`: the studio home page. Sections in order: hero (`#intro`: rotating word, screenshot deck and app dock, kept in step by the `.dock-btn` data attributes and the `.hero-word` / `.deck-card` order), app ticker, apps bento (`#apps`: each app is an `<article class="tile" id="...">`; grid placement is set per id in `index.css`), the "Now" status board (`#now`: update its rows and the `Last updated` date when the focus changes), the studio note (`#studio`) and "Say hello" (`#hello`, plus the Web3Forms contact dialog for feedback and support). Screenshots live in `public/apps/<app>/` as `-540.webp` / `-1080.webp` srcset pairs. Theme is `data-theme="dark|light"` on `<html>`, persisted in `localStorage.theme`. `privacy-policy.html` and `terms-of-service.html` share `index.css` and `index.js`, so keep their header/footer classes styled.
- Per-app legal/support pages (`mydeen/`, `splitup/`, `nasab/`, `mytasbih/`, `aifunkit/`) are Markdown files rendered by GitHub Pages' default Jekyll (`privacy-policy.md` → `/privacy-policy.html`). Store listings link to these URLs, so don't rename them. These app folders keep their own styling, not the tappStudio brand.
- `kadak/` only holds redirect stubs: Kadak's privacy policy, terms and support pages live in the separate `kadakchai-landing` repo at `https://kadakchai.tappstudio.in/{privacy-policy,terms,support}/`. Keep the stubs (older builds link to them) and don't link Kadak from this site's footer or sitemap; the game isn't announced here yet.
- `pricing/`: passcode-gated internal quote calculator. `config.js` is the rate card (every price number lives there), `engine.js` is pure quote math (no DOM), `rates.js` is the rate-card editor logic (edits are a flat patch like `{"features.payments.hours": 14}` layered over config), `app.js` is the UI. Scripts load in that order as globals (`PRICING_CONFIG`, `PricingEngine`, `PricingRates`). The passcode is a SHA-256 hash in `config.js`; it's only a casual gate, everything is readable in source. User edits persist in `localStorage` under `pq_*` keys.
- `socials/`: social media content calendar (`noindex`, disallowed in `robots.txt`). The passcode gate in `index.html` is a casual SHA-256 check only; `posts.json` and `img/` are public like everything else in this repo. All calendar data is in `socials/posts.json`: `board` (the Firestore board id, derived from the original password; don't change it or live statuses detach), `brands`, `posts`, and a `built` display string (update it when you edit). Each post has `brand`, `platform` (`IG`/`LI`/`X`), `id` (e.g. `IG-01`), `date` (`YYYY-MM-DD`), `time`, `title`, `text` (caption), `alt` (`summary` + per-slide `slides`), `status` (`planned`/`ready`/`scheduled`/`posted`), `note`, `warn`, `carousel`, `reply` (X and LI posts only: the text, with the link, to paste as the first reply/comment; keep the link out of the post body), and `images`: a list of `[full, thumb, download-filename]`, e.g. `["img/<hash>.webp", "img/<hash>-t.webp", "nasab-IG-01.jpg"]`. Full images are 1080x1350 webp, thumbs 216x270 (`-t.webp`). The page overlays live status (`status`/`posted`) from Firestore via REST at load, so those win over the values in `posts.json`. The script that originally generated the images is not in this repo. For new images, render HTML to PNG with headless Chrome (like `brand/build.py` and `brand/linkedin/*.html`), then convert with `cwebp`.
- `socials/` ideastore: the "Ideas" tab keeps post ideas in Firestore at `boards/<board>/ideastore/<id>` (fields `title`, `brief`, `brand`, `platform`, `status` of new/shaping/scheduled/dropped, `notes`, `source`, `created`, `updated`), read and written over REST like the statuses. The Firestore rules must allow that path (the tab shows the rule when they don't). `socials/ideas.seed.json` holds the starter ideas, shown read-only when the collection can't be read and loadable into Firestore with the "Add the 4 starter ideas" button.
- `brand/`: `colors.json` is the single source of truth for the accent palette. `build.py` rewrites the regions between `/* brand:dark:start */ … end */` and `/* brand:light:start */ … end */` in `index.css`, plus `manifest.json` and all icon/logo/OG images. Change colors there, not by hand-editing those generated files. See `brand/README.md` for the full list of outputs.

## When adding or changing an app on the site

Keep these in sync: the app tile in `index.html` (plus its hero dock button, deck card and rotating word, the ticker, the Now board row and the footer links), the JSON-LD block near the top of `index.html`, `llms.txt` (LLM-facing summary of the studio and every app), and `sitemap.xml` if new pages are added.
