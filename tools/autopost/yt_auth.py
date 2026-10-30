#!/usr/bin/env python3
"""One-time YouTube sign-in. Opens Google's consent page, then writes YT_REFRESH_TOKEN into tools/autopost/.env.

Needs YT_CLIENT_ID and YT_CLIENT_SECRET (a "Desktop app" OAuth client) in tools/autopost/.env first.
Sign in with the Google account that owns the channel. The token is never printed.
"""
import http.server
import os
import secrets
import urllib.parse
import webbrowser

from common import HERE, env, http_json, load_env

PORT = 8765
SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"


def main():
    cid, csec = env("YT_CLIENT_ID"), env("YT_CLIENT_SECRET")
    redirect, state, got = f"http://127.0.0.1:{PORT}", secrets.token_urlsafe(16), {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if qs.get("state", [""])[0] == state:
                got.update({k: v[0] for k, v in qs.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Done. You can close this tab and go back to the terminal." if "code" in got
                             else b"Sign-in did not finish. Check the terminal.")

        def log_message(self, *a):
            pass

    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code", "scope": SCOPES,
        "access_type": "offline", "prompt": "consent", "state": state})
    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    print("Opening Google sign-in. If no browser opens, visit:\n" + url)
    webbrowser.open(url)
    while "code" not in got and "error" not in got:
        server.handle_request()
    if "error" in got:
        raise SystemExit(f"Google returned: {got['error']}")
    tok = http_json("POST", "https://oauth2.googleapis.com/token", form={
        "code": got["code"], "client_id": cid, "client_secret": csec, "redirect_uri": redirect,
        "grant_type": "authorization_code"})
    if "refresh_token" not in tok:
        raise SystemExit("Google sent no refresh token. Remove the app at myaccount.google.com/permissions and run this again.")

    path = os.path.join(HERE, ".env")
    lines = [l for l in open(path, encoding="utf-8").read().splitlines() if not l.startswith("YT_REFRESH_TOKEN=")] \
        if os.path.exists(path) else []
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines + [f"YT_REFRESH_TOKEN={tok['refresh_token']}"]) + "\n")
    ch = http_json("GET", "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
                   headers={"Authorization": "Bearer " + tok["access_token"]}).get("items", [])
    print(f"Saved YT_REFRESH_TOKEN to tools/autopost/.env. Channel: {ch[0]['snippet']['title'] if ch else 'none on this account'}")


if __name__ == "__main__":
    load_env()
    main()
