#!/usr/bin/env python3
"""Generate the tS mascot in several expressions.

Writes public/images/mascot/<name>.svg and <name>.png (transparent, 512x512 by
default). Rendering uses headless Chrome (set CHROME to override the path).

    python3 brand/mascot.py
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "images" / "mascot"
SIZE = 512
CHROME = os.environ.get("CHROME") or next(
    (p for p in (
        "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ) if os.path.exists(p)), "chrome")

BODY = "#13b8a7"
LEG = "#0f9b8e"
INK = "#0e0e0c"
EYE = "#f3f0e8"
# Marks outside the body (sparkles, thought bubbles, zzz): a mid grey between the
# dark and light theme muted colors so they read on both page backgrounds.
FX = "#8a867c"
GOLD = "#f6b04a"

# Geometry (viewBox 0 0 360 380)
BX, BY, BW, BH = 112, 44, 136, 232


def arm(d, hand=None, color=BODY):
    s = f'<path d="{d}" stroke="{color}" stroke-width="18" stroke-linecap="round" fill="none"/>'
    if hand:
        s += f'<circle cx="{hand[0]}" cy="{hand[1]}" r="11" fill="{color}"/>'
    return s


def star(x, y, r, color):
    k = r * 0.28
    return (f'<path d="M{x} {y-r} Q{x+k} {y-k} {x+r} {y} Q{x+k} {y+k} {x} {y+r} '
            f'Q{x-k} {y+k} {x-r} {y} Q{x-k} {y-k} {x} {y-r}Z" fill="{color}"/>')


def eyes(dx=0, dy=0, rx=19, ry=23, pr=9.5, pdx=0, pdy=0):
    out = ""
    for cx, cy in ((156, 128), (204, 130)):
        out += f'<ellipse cx="{cx+dx}" cy="{cy+dy}" rx="{rx}" ry="{ry}" fill="{EYE}"/>'
        out += f'<circle cx="{cx+dx+pdx}" cy="{cy+dy+pdy}" r="{pr}" fill="{INK}"/>'
    return out


def stroke(d, w=5):
    return f'<path d="{d}" stroke="{INK}" stroke-width="{w}" stroke-linecap="round" fill="none"/>'


SMILE = stroke("M160 178 Q180 195 200 178")
OPEN_SMILE = f'<path d="M158 176 Q180 178 202 176 Q198 198 180 198 Q162 198 158 176Z" fill="{INK}"/>'
FLAT = stroke("M164 184 L196 184")
FROWN = stroke("M160 192 Q180 176 200 192")
O_MOUTH = f'<ellipse cx="180" cy="188" rx="9" ry="12" fill="{INK}"/>'

LEFT_DOWN = arm("M112 178 Q88 192 82 230")
LEFT_DOWN_DROOP = arm("M112 190 Q96 220 98 262")
RIGHT_DOWN = arm("M248 178 Q272 192 278 230")
RIGHT_DOWN_DROOP = arm("M248 190 Q264 220 262 262")
RIGHT_WAVE = arm("M248 170 Q282 150 292 95", hand=(292, 95))
UP_L = arm("M112 175 Q80 150 72 106", hand=(72, 106))
UP_R = arm("M248 175 Q280 150 288 106", hand=(288, 106))
OUT_L = arm("M112 168 Q74 150 58 160")
OUT_R = arm("M248 168 Q286 150 302 160")

EXPRESSIONS = {
    # name: (arms, eyes, mouth, extras)
    "neutral": (LEFT_DOWN + RIGHT_DOWN, eyes(), SMILE, ""),
    "wave": (LEFT_DOWN + RIGHT_WAVE, eyes(), SMILE, ""),
    "happy": (UP_L + UP_R, eyes(), OPEN_SMILE,
              star(62, 82, 17, FX) + star(300, 84, 13, BODY) +
              f'<circle cx="104" cy="40" r="5" fill="{GOLD}"/><circle cx="270" cy="36" r="4.5" fill="{FX}"/>'),
    "thinking": (LEFT_DOWN, eyes(pdx=-5, pdy=-6), FLAT,
                 arm("M252 232 Q232 236 214 204", hand=(212, 202), color="#0c8f82") +
                 f'<circle cx="274" cy="60" r="5" fill="{FX}"/>'
                 f'<circle cx="292" cy="40" r="7" fill="{FX}"/>'
                 f'<circle cx="316" cy="16" r="10" fill="{FX}"/>'),
    "surprised": (OUT_L + OUT_R, eyes(rx=22, ry=27, pr=7), O_MOUTH,
                  stroke("M150 82 L142 66", 5).replace(INK, EYE) +
                  stroke("M180 74 L180 56", 5).replace(INK, EYE) +
                  stroke("M210 82 L218 66", 5).replace(INK, EYE)),
    "sad": (LEFT_DOWN_DROOP + RIGHT_DOWN_DROOP, eyes(pdy=7), FROWN,
            f'<path d="M222 164 Q230 180 222 190 Q214 180 222 164Z" fill="#7dd3fc"/>'),
    "sleeping": (LEFT_DOWN + RIGHT_DOWN,
                 stroke("M138 130 Q156 146 174 130", 6) + stroke("M186 130 Q204 146 222 130", 6),
                 stroke("M166 184 Q180 192 194 184"),
                 f'<g fill="{FX}" font-family="Geist Mono, monospace" font-weight="700">'
                 f'<text x="262" y="70" font-size="30">Z</text><text x="286" y="42" font-size="22">z</text>'
                 f'<text x="304" y="22" font-size="16">z</text></g>'),
    "wink": (LEFT_DOWN + RIGHT_WAVE,
             f'<ellipse cx="156" cy="128" rx="19" ry="23" fill="{EYE}"/><circle cx="156" cy="128" r="9.5" fill="{INK}"/>'
             + stroke("M186 132 Q204 118 222 132", 6),
             OPEN_SMILE, ""),
}


def svg(name):
    arms, eye, mouth, extra = EXPRESSIONS[name]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 380" width="360" height="380" fill="none">'
        '<title>tappStudio mascot, %s</title>'
        '<ellipse cx="180" cy="338" rx="72" ry="9" fill="#000" opacity=".25"/>'
        f'<path d="M150 270 L148 330 M208 270 L210 330" stroke="{LEG}" stroke-width="17" stroke-linecap="round"/>'
        f'{arms}'
        f'<rect x="{BX}" y="{BY}" width="{BW}" height="{BH}" rx="30" fill="{BODY}"/>'
        '<rect x="128" y="64" width="18" height="114" rx="9" fill="#fff" opacity=".22"/>'
        f'{eye}{mouth}{extra}</svg>'
    ) % name


def render(svg_path, png_path):
    html = (f'<html><body style="margin:0;background:transparent">'
            f'<img src="file://{svg_path}" style="width:{SIZE}px;height:{SIZE}px;object-fit:contain;display:block">'
            f'</body></html>')
    with tempfile.TemporaryDirectory() as t:
        h = Path(t) / "m.html"
        h.write_text(html)
        subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                        "--default-background-color=00000000", f"--window-size={SIZE},{SIZE + 300}",
                        f"--screenshot={png_path}", f"file://{h}"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from PIL import Image  # viewport can be shorter than the window; crop to the square
    im = Image.open(png_path)
    im.crop((0, 0, SIZE, SIZE)).save(png_path)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name in EXPRESSIONS:
        s = OUT / f"{name}.svg"
        s.write_text(svg(name))
        render(s, OUT / f"{name}.png")
        print("wrote", name)


if __name__ == "__main__":
    sys.exit(main())
