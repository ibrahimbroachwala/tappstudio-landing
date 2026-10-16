#!/usr/bin/env python3
"""Regenerate every brand-colored file from brand/colors.json.

Usage:  python3 brand/build.py

Updates the accent tokens in index.css, then re-renders the logos, favicons,
app icons and the Open Graph image using headless Chrome + macOS `sips`.
See brand/README.md for the list of files this touches.
"""
import json, os, shutil, struct, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
C = json.loads((BRAND / "colors.json").read_text())
D, L = C["dark"], C["light"]


def rgb(hex_):
    h = hex_.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_str(hex_):
    return ", ".join(str(v) for v in rgb(hex_))


def soft(theme):
    r, g, b = rgb(theme["accent"])
    return f"rgba({r}, {g}, {b}, {theme['accentSoftAlpha']})"


# ---------------------------------------------------------------- CSS tokens
def sync_css():
    css = (ROOT / "index.css").read_text()
    for theme, name in ((D, "dark"), (L, "light")):
        start, end = f"/* brand:{name}:start */", f"/* brand:{name}:end */"
        a, b = css.index(start) + len(start), css.index(end)
        block = (f"\n    --accent: {theme['accent']};\n"
                 f"    --accent-ink: {theme['accentInk']};\n"
                 f"    --accent-soft: {soft(theme)};\n    ")
        css = css[:a] + block + css[b:]
    (ROOT / "index.css").write_text(css)


# ------------------------------------------------------------------ rendering
def template(name, **kw):
    s = (BRAND / "templates" / name).read_text()
    for k, v in kw.items():
        s = s.replace("{{%s}}" % k, v)
    return s


def ts_svg(t, s, viewbox="0 0 512 512", bg=None):
    rect = f'<rect x="-100" y="-100" width="800" height="800" fill="{bg}"/>' if bg else ""
    return template("ts.svg", VIEWBOX=viewbox, T=t, S=s, BG_RECT=rect)


def shot(html, out, size=(512, 512), bg="00000000"):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(html)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=6000",
                    f"--default-background-color={bg}", f"--window-size={size[0]},{size[1]}",
                    f"--screenshot={out}", f"file://{f.name}"],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.unlink(f.name)


def render_svg(svg, out, bg_hex=None):
    bg = (bg_hex or "transparent")
    html = (f"<!doctype html><style>html,body{{margin:0;width:512px;height:512px;background:{bg}}}"
            f"svg{{display:block;width:512px;height:512px}}</style>{svg}")
    shot(html, out, bg="00000000" if not bg_hex else bg_hex.lstrip("#") + "FF")


def sips(src, out, size, fmt=None):
    cmd = ["sips", "-z", str(size), str(size), str(src), "--out", str(out)]
    if fmt:
        cmd[1:1] = ["-s", "format", fmt]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)


def build_assets():
    img = ROOT / "public" / "images"
    tmp = Path(tempfile.mkdtemp())

    # Logos (transparent). logo.* is for dark backgrounds, logo-dark.* for light ones.
    for name, theme in (("logo", D), ("logo_dark", L)):
        svg = ts_svg(theme["accent"], theme["muted"])
        (img / f"{name}.svg").write_text(svg)
        png = img / ("logo.png" if name == "logo" else "logo-dark.png")
        render_svg(svg, png)
    shutil.copy(img / "logo.png", img / "ts-logo-512-transparent.png")
    render_svg(ts_svg(L["accent"], L["muted"], bg="#ffffff"), img / "ts-logo-512-white.png", "#ffffff")

    # Favicon: tight crop, transparent, dark-theme pair (reads on light and dark tabs)
    render_svg(ts_svg(D["accent"], D["muted"], "60 61 390 390"), tmp / "fav.png")
    sips(tmp / "fav.png", ROOT / "favicon.png", 32)
    sips(tmp / "fav.png", tmp / "f16.png", 16)
    sips(tmp / "fav.png", tmp / "f48.png", 48)
    imgs = [(16, (tmp / "f16.png").read_bytes()), (32, (ROOT / "favicon.png").read_bytes()),
            (48, (tmp / "f48.png").read_bytes())]
    out = struct.pack("<HHH", 0, 1, len(imgs)); off = 6 + 16 * len(imgs); data = b""
    for w, d in imgs:
        out += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(d), off + len(data)); data += d
    (ROOT / "favicon.ico").write_bytes(out + data)

    # App icons on the dark brand background
    render_svg(ts_svg(D["accent"], D["muted"], "-20 -20 552 552", bg=D["bg"]), tmp / "icon.png", D["bg"])
    sips(tmp / "icon.png", ROOT / "apple-touch-icon.png", 180)
    sips(tmp / "icon.png", img / "icon-192.png", 192)
    shutil.copy(tmp / "icon.png", img / "icon-512.png")

    # Open Graph image (1200x630 JPEG)
    html = template("og.html", ROOT=f"file://{ROOT}", ACCENT=D["accent"], MUTED=D["muted"],
                    BG=D["bg"], TEXT=D["text"], ACCENT_RGB=rgb_str(D["accent"]),
                    BG_RGB=rgb_str(D["bg"]), LOGO_SVG=ts_svg(D["accent"], D["muted"]))
    shot(html, tmp / "og.png", (1200, 630), D["bg"].lstrip("#") + "FF")
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85",
                    str(tmp / "og.png"), "--out", str(img / "og-image.jpg")],
                   check=True, stdout=subprocess.DEVNULL)
    shutil.rmtree(tmp)


def sync_manifest():
    p = ROOT / "manifest.json"
    m = json.loads(p.read_text())
    m["theme_color"] = m["background_color"] = D["bg"]
    p.write_text(json.dumps(m, indent=4) + "\n")


if __name__ == "__main__":
    sync_css()
    sync_manifest()
    if "--css-only" not in sys.argv:
        build_assets()
    print("Brand build done.")
