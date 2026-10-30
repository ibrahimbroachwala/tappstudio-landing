"""Shared helpers for autopost: env, HTTP, Cloudflare R2 (S3 SigV4), posts.json and the Firestore statuses.

Standard library only, so the GitHub Actions job needs no installs.
"""
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
POSTS = os.path.join(ROOT, "socials", "posts.json")
ACCOUNTS = os.path.join(HERE, "accounts.json")
IST = ZoneInfo("Asia/Kolkata")

# Same project and public web key as socials/index.html (the key is already public there).
FS = "https://firestore.googleapis.com/v1/projects/tappstudio-socials/databases/(default)/documents"
FS_KEY = "AIzaSyDQ191Pr07oIAV9_hZNuO9SYyAIOUU8mB4"


def load_env():
    """tools/autopost/.env (gitignored) fills in anything not already exported."""
    path = os.path.join(HERE, ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


def env(name, required=True):
    v = os.environ.get(name, "")
    if required and not v:
        sys.exit(f"Missing {name}. Set it in tools/autopost/.env, or as a GitHub Actions secret.")
    return v


class HttpError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body[:400]}")
        self.status = status
        self.body = body


def http(method, url, data=None, headers=None, timeout=120):
    """Returns (status, headers, body bytes). Raises HttpError on 4xx/5xx."""
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        raise HttpError(e.code, e.read().decode("utf-8", "replace"))
    except urllib.error.URLError as e:
        raise HttpError(0, f"network error: {e.reason}")


def http_json(method, url, body=None, form=None, headers=None, timeout=120):
    h, data = dict(headers or {}), None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    _, _, raw = http(method, url, data, h, timeout)
    return json.loads(raw) if raw else {}


# ---------- Cloudflare R2 ----------

class R2:
    """Minimal S3 client for one R2 bucket: PUT and GET objects, signed with SigV4 (region "auto")."""

    def __init__(self, bucket):
        self.account = env("R2_ACCOUNT_ID")
        self.key_id = env("R2_ACCESS_KEY_ID")
        self.secret = env("R2_SECRET_ACCESS_KEY")
        self.host = f"{self.account}.r2.cloudflarestorage.com"
        self.bucket = bucket

    def _request(self, method, key, data=b"", content_type=None):
        amz = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        day = amz[:8]
        uri = "/" + self.bucket + "/" + urllib.parse.quote(key, safe="/-_.~")
        payload = hashlib.sha256(data).hexdigest()
        headers = {"host": self.host, "x-amz-content-sha256": payload, "x-amz-date": amz}
        if content_type:
            headers["content-type"] = content_type
        names = sorted(headers)
        signed = ";".join(names)
        canonical = "\n".join([method, uri, "", "".join(f"{n}:{headers[n]}\n" for n in names), signed, payload])
        scope = f"{day}/auto/s3/aws4_request"
        to_sign = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canonical.encode()).hexdigest()])
        k = ("AWS4" + self.secret).encode()
        for part in (day, "auto", "s3", "aws4_request"):
            k = hmac.new(k, part.encode(), hashlib.sha256).digest()
        sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
        headers["authorization"] = f"AWS4-HMAC-SHA256 Credential={self.key_id}/{scope}, SignedHeaders={signed}, Signature={sig}"
        del headers["host"]  # urllib sends the same Host itself
        return http(method, f"https://{self.host}{uri}", data if method == "PUT" else None, headers, timeout=600)

    def put(self, key, data, content_type):
        self._request("PUT", key, data, content_type)

    def get(self, key):
        try:
            return self._request("GET", key)[2]
        except HttpError as e:
            if e.status == 404:
                return None
            raise


# ---------- posts.json ----------

def load_posts():
    with open(POSTS, encoding="utf-8") as f:
        return json.load(f)


def save_posts(d):
    d["built"] = dt.datetime.now(IST).strftime("%-d %b %Y, %H:%M")
    with open(POSTS, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)


def due_at(date, time_str):
    """Calendar times look like "6:00 pm IST", "7-9 pm", "09:30 IST" or "18:30 IST". A range uses its start."""
    h, m = 18, 0
    hit = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(?:-\s*\d{1,2}(?::\d{2})?\s*)?(am|pm)?", time_str or "", re.I)
    if hit:
        h, m = int(hit.group(1)), int(hit.group(2) or 0)
        ampm = (hit.group(3) or "").lower()
        if ampm == "pm" and h < 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
    y, mo, d = map(int, date.split("-"))
    return dt.datetime(y, mo, d, min(h, 23), min(m, 59), tzinfo=IST)


# ---------- Firestore statuses (same encoding as socials/index.html) ----------

def dec_meta(s):
    """`posted` holds "p=<posted date>;a=1;d=<moved date>", or a bare posted date from older writes."""
    s = s or ""
    if s and "=" not in s:
        return {"p": s}
    return dict(part.split("=", 1) for part in s.split(";") if "=" in part)


def enc_meta(m):
    return ";".join(f"{k}={m[k]}" for k in ("p", "a", "d") if m.get(k))


def live_statuses(board):
    """{(brand, id): {"status": ..., "meta": {...}}} for every status the calendar page has saved."""
    out, token = {}, ""
    while True:
        url = f"{FS}/boards/{board}/status?key={FS_KEY}&pageSize=300" + (f"&pageToken={token}" if token else "")
        j = http_json("GET", url)
        for doc in j.get("documents", []):
            f = {k: next(iter(v.values())) for k, v in doc.get("fields", {}).items()}
            if f.get("brand") and f.get("id") and f.get("status"):
                out[(f["brand"], f["id"])] = {"status": f["status"], "meta": dec_meta(f.get("posted"))}
        token = j.get("nextPageToken", "")
        if not token:
            return out


def set_status(board, brand, pid, status, meta):
    doc = urllib.parse.quote(f"{brand}__{pid}", safe="")
    fields = {"brand": {"stringValue": brand}, "id": {"stringValue": pid}, "status": {"stringValue": status},
              "posted": {"stringValue": enc_meta(meta)},
              "updated": {"timestampValue": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")}}
    http_json("PATCH", f"{FS}/boards/{board}/status/{doc}?key={FS_KEY}", body={"fields": fields})
