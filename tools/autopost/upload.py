#!/usr/bin/env python3
"""Uploads built reels (MP4 + cover) to the public R2 bucket and links them in socials/posts.json.

Usage: python3 tools/autopost/upload.py misbaha-R01.mp4 [nasab-R02.mp4 ...] [--from DIR]

DIR defaults to ~/Projects/tappstudio_socials/reels/out, where each reel is out/<brand>/<name>.mp4 with
<name>-cover.png next to it. Every post whose video[2] is that file name (the IG reel and its YT twin) gets
video[0] set to the public link. Commit and push posts.json afterwards: autopost reads it from the release branch.
"""
import os
import sys

from common import R2, env, load_env, load_posts, save_posts

DEFAULT_DIR = os.path.expanduser("~/Projects/tappstudio_socials/reels/out")


def main(args):
    src = DEFAULT_DIR
    if "--from" in args:
        i = args.index("--from")
        src = os.path.expanduser(args[i + 1])
        args = args[:i] + args[i + 2:]
    if not args:
        sys.exit(__doc__)
    r2, base = R2(env("R2_PUBLIC_BUCKET")), env("R2_PUBLIC_BASE").rstrip("/")
    d = load_posts()
    for name in args:
        name = os.path.basename(name)
        path = os.path.join(src, name.split("-")[0], name)
        if not os.path.exists(path):
            path = os.path.join(src, name)
        if not os.path.exists(path):
            sys.exit(f"Can't find {name} in {src}/<brand>/ or {src}/")
        uses = [p for p in d["posts"] if (p.get("video") or ["", "", ""])[2] == name]
        if not uses:
            sys.exit(f"No post in posts.json has {name} as its video. Add the posts first.")
        with open(path, "rb") as f:
            r2.put(f"reels/{name}", f.read(), "video/mp4")
        cover = path[:-4] + "-cover.png"
        if os.path.exists(cover):
            with open(cover, "rb") as f:
                r2.put(f"reels/{name[:-4]}-cover.png", f.read(), "image/png")
        else:
            print(f"  no cover next to {name}, Instagram will pick a frame")
        for p in uses:
            p["video"][0] = f"{base}/reels/{name}"
        print(f"{name}: uploaded, linked in {', '.join(p['platform'] + ' ' + p['id'] for p in uses)}")
    save_posts(d)
    print("posts.json updated. Commit and push it so the next autopost run sees the links.")


if __name__ == "__main__":
    load_env()
    main(sys.argv[1:])
