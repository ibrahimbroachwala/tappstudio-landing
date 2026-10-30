#!/usr/bin/env python3
"""Publishes due Instagram reels and YouTube Shorts from socials/posts.json, then marks them posted in the calendar.

Usage:
  python3 tools/autopost/autopost.py check          verify every account, then list what is queued for the next 7 days
  python3 tools/autopost/autopost.py run            dry run: print what would be posted now
  python3 tools/autopost/autopost.py run --live     post for real

A post is picked up only when all of these hold:
  - platform IG or YT, kind "reel", and video[0] is an R2 link (tools/autopost/upload.py sets it)
  - its live status is "ready" ("scheduled" means you scheduled it by hand, so it is left alone)
  - it is due (date + time, IST, after any move on the calendar page) and at most LOOKBACK old
"""
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse

from common import (ACCOUNTS, IST, R2, HttpError, env, http, http_json, live_statuses, load_env, load_posts,
                    set_status, due_at)

GRAPH = "https://graph.instagram.com/v23.0"
LOOKBACK = dt.timedelta(hours=36)   # older than this and it waits for you instead of going out late
MAX_PER_RUN = 4
STATE_KEY = "state.json"            # in the private R2 bucket: what went out, plus refreshed Instagram tokens
TOKEN_REFRESH = dt.timedelta(days=7)
q = urllib.parse.quote


def queue(d, statuses, now, horizon):
    base = (os.environ.get("R2_PUBLIC_BASE") or "").rstrip("/") + "/"
    out = []
    for p in d["posts"]:
        if p["platform"] not in ("IG", "YT") or p.get("kind") != "reel":
            continue
        s = statuses.get((p["brand"], p["id"]), {})
        meta = s.get("meta", {})
        if meta.get("a") or s.get("status", p["status"]) != "ready":
            continue
        due = due_at(meta.get("d") or p["date"], p.get("time"))
        if now - due > LOOKBACK or due > now + horizon:
            continue
        link = (p.get("video") or [""])[0]
        out.append({"due": due, "post": p, "meta": meta, "linked": base != "/" and link.startswith(base)})
    return sorted(out, key=lambda x: x["due"])


# ---------- Instagram ----------

def ig_token(brand, acct, state, refresh):
    """The GitHub secret seeds the token; refreshed ones live in R2 state until you set a new secret."""
    seed = os.environ.get(acct.get("token_env", ""), "")
    if not seed:
        return ""
    fp = hashlib.sha256(seed.encode()).hexdigest()[:12]
    saved = state.setdefault("ig_tokens", {}).get(brand)
    if not saved or saved.get("seed") != fp:
        saved = state["ig_tokens"][brand] = {"seed": fp, "token": seed, "refreshed": ""}
    last = dt.datetime.fromisoformat(saved["refreshed"]) if saved["refreshed"] else None
    if refresh and (not last or dt.datetime.now(IST) - last > TOKEN_REFRESH):
        try:
            r = http_json("GET", f"https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token"
                                 f"&access_token={q(saved['token'])}")
            saved["token"], saved["refreshed"] = r["access_token"], dt.datetime.now(IST).isoformat()
            print(f"  refreshed the {brand} Instagram token")
        except HttpError as e:  # a token under 24 hours old can't be refreshed yet; the next run tries again
            print(f"  could not refresh the {brand} Instagram token yet: {e}")
    return saved["token"]


def post_ig(p, acct, token):
    video = p["video"][0]
    form = {"media_type": "REELS", "video_url": video, "caption": p["text"], "share_to_feed": "true",
            "access_token": token}
    cover = video[:-4] + "-cover.png" if video.endswith(".mp4") else ""
    if cover:
        try:
            http("HEAD", cover, timeout=30)
            form["cover_url"] = cover
        except HttpError:
            print("  no cover in R2, Instagram will pick a frame")
    container = http_json("POST", f"{GRAPH}/{acct['ig_id']}/media", form=form)["id"]
    for _ in range(90):  # Instagram usually finishes a short reel in under a minute
        s = http_json("GET", f"{GRAPH}/{container}?fields=status_code,status&access_token={q(token)}")
        if s.get("status_code") == "FINISHED":
            break
        if s.get("status_code") in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"Instagram could not process the video: {s.get('status')}")
        time.sleep(10)
    else:
        raise RuntimeError("Instagram was still processing the video after 15 minutes")
    media = http_json("POST", f"{GRAPH}/{acct['ig_id']}/media_publish",
                      form={"creation_id": container, "access_token": token})["id"]
    link = http_json("GET", f"{GRAPH}/{media}?fields=permalink&access_token={q(token)}").get("permalink", "")
    return media, link


# ---------- YouTube ----------

def yt_token():
    if not os.environ.get("YT_REFRESH_TOKEN"):
        return ""
    return http_json("POST", "https://oauth2.googleapis.com/token", form={
        "client_id": env("YT_CLIENT_ID"), "client_secret": env("YT_CLIENT_SECRET"),
        "refresh_token": env("YT_REFRESH_TOKEN"), "grant_type": "refresh_token"})["access_token"]


def post_yt(p, token):
    title = re.sub(r"\s*\(Short\)\s*$", "", p["title"])[:100]
    body = {"snippet": {"title": title, "description": p["text"][:4900], "categoryId": "22"},
            "status": {"privacyStatus": os.environ.get("YT_PRIVACY") or "public", "selfDeclaredMadeForKids": False}}
    _, _, video = http("GET", p["video"][0], timeout=600)
    _, headers, _ = http("POST", "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                         json.dumps(body).encode(), {
                             "Authorization": "Bearer " + token, "Content-Type": "application/json; charset=UTF-8",
                             "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(len(video))})
    _, _, raw = http("PUT", headers["Location"], video,
                     {"Authorization": "Bearer " + token, "Content-Type": "video/mp4"}, timeout=900)
    vid = json.loads(raw)["id"]
    return vid, f"https://youtube.com/shorts/{vid}"


# ---------- commands ----------

def load_state(live):
    if not os.environ.get("R2_STATE_BUCKET") and not live:
        return None, {}
    r2 = R2(env("R2_STATE_BUCKET"))
    raw = r2.get(STATE_KEY)
    return r2, json.loads(raw) if raw else {}


def save_state(r2, state):
    r2.put(STATE_KEY, json.dumps(state, indent=1).encode(), "application/json")


def label(p):
    return f"{p['platform']} {p['brand']} {p['id']} \"{p['title']}\""


def run(live):
    d, accounts = load_posts(), json.load(open(ACCOUNTS, encoding="utf-8"))
    now = dt.datetime.now(IST)
    items = [x for x in queue(d, live_statuses(d["board"]), now, dt.timedelta(0)) if x["linked"]]
    r2, state = load_state(live)
    posted = state.setdefault("posted", {})
    yt = None
    failed = 0
    print(f"{now:%d %b %H:%M} IST, {len(items)} due{'' if live else ' (dry run, nothing is posted)'}")
    for x in items[:MAX_PER_RUN]:
        p, key = x["post"], f"{x['post']['platform']}/{x['post']['brand']}/{x['post']['id']}"
        done_meta = {"p": now.strftime("%Y-%m-%d"), "d": x["meta"].get("d", "")}
        if key in posted:  # it went out but the calendar write failed last time
            print(f"- {label(p)}: already posted ({posted[key]['url']}), marking it on the calendar")
            if live:
                set_status(d["board"], p["brand"], p["id"], "posted", done_meta)
            continue
        if not live:
            print(f"- would post {label(p)}, due {x['due']:%d %b %H:%M}")
            continue
        try:
            if p["platform"] == "IG":
                acct = accounts["instagram"].get(p["brand"]) or {}
                token = ig_token(p["brand"], acct, state, refresh=False) if acct.get("ig_id") else ""
                if not token:
                    print(f"- skipped {label(p)}: no Instagram account set up for {p['brand']}")
                    continue
                remote, url = post_ig(p, acct, token)
            else:
                if p["brand"] not in accounts["youtube"]["brands"]:
                    print(f"- skipped {label(p)}: {p['brand']} is not posted to YouTube")
                    continue
                yt = yt or yt_token()
                if not yt:
                    print(f"- skipped {label(p)}: YouTube is not set up")
                    continue
                remote, url = post_yt(p, yt)
            posted[key] = {"at": now.isoformat(), "id": remote, "url": url}
            save_state(r2, state)  # saved before the calendar write, so a failure there never posts twice
            set_status(d["board"], p["brand"], p["id"], "posted", done_meta)
            print(f"- posted {label(p)}: {url}")
        except (HttpError, RuntimeError, KeyError) as e:
            failed += 1
            print(f"- FAILED {label(p)}: {e}")
    if live:
        for brand, acct in accounts["instagram"].items():
            if acct.get("ig_id"):
                ig_token(brand, acct, state, refresh=True)
        save_state(r2, state)
    return 1 if failed else 0


def check():
    d, accounts = load_posts(), json.load(open(ACCOUNTS, encoding="utf-8"))
    ok = True
    print("R2")
    try:
        r2, state = load_state(False)
        print(f"  state bucket: {'OK, ' + env('R2_STATE_BUCKET') if r2 else 'not set (R2_STATE_BUCKET)'}")
    except HttpError as e:
        ok, r2, state = False, None, {}
        print(f"  state bucket rejected the keys, {e}")
    print(f"  public base: {os.environ.get('R2_PUBLIC_BASE') or 'not set (R2_PUBLIC_BASE)'}")
    print("Instagram")
    for brand, acct in accounts["instagram"].items():
        token = ig_token(brand, acct, state, refresh=False) if acct.get("ig_id") else ""
        if not acct.get("ig_id") or not token:
            print(f"  {brand}: not set up (needs ig_id in accounts.json and {acct.get('token_env')})")
            continue
        try:
            me = http_json("GET", f"{GRAPH}/me?fields=user_id,username&access_token={q(token)}")
            match = str(me.get("user_id")) == str(acct["ig_id"])
            ok &= match
            print(f"  {brand}: @{me.get('username')} {'OK' if match else 'WRONG ACCOUNT: token is for user ' + str(me.get('user_id'))}")
        except HttpError as e:
            ok = False
            print(f"  {brand}: token rejected, {e}")
    print("YouTube")
    try:
        token = yt_token()
        if token:
            ch = http_json("GET", "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
                           headers={"Authorization": "Bearer " + token}).get("items", [])
            print(f"  channel: {ch[0]['snippet']['title'] if ch else 'none found on this Google account'}")
            ok &= bool(ch)
        else:
            print("  not set up (needs YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN)")
    except HttpError as e:
        ok = False
        print(f"  sign-in rejected, {e}")
    print("Queued for the next 7 days")
    now = dt.datetime.now(IST)
    for x in queue(d, live_statuses(d["board"]), now, dt.timedelta(days=7)):
        p = x["post"]
        acct = accounts["instagram"].get(p["brand"]) or {}
        blocked = ("video not uploaded to R2" if not x["linked"]
                   else "no Instagram account" if p["platform"] == "IG" and not acct.get("ig_id")
                   else "brand not on YouTube" if p["platform"] == "YT" and p["brand"] not in accounts["youtube"]["brands"]
                   else "")
        print(f"  {x['due']:%a %d %b %H:%M}  {label(p)}{'  [' + blocked + ']' if blocked else ''}")
    return 0 if ok else 1


if __name__ == "__main__":
    load_env()
    args = sys.argv[1:]
    cmd = args[0] if args else "run"
    if cmd == "check":
        sys.exit(check())
    if cmd == "run":
        sys.exit(run("--live" in args))
    sys.exit(__doc__)
