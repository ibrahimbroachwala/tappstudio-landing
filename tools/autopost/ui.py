#!/usr/bin/env python3
"""A small local page for running autopost: upload reels, check, dry run, post live, commit posts.json.

Usage: python3 tools/autopost/ui.py   (opens http://127.0.0.1:8790)

Binds to this machine only and runs the same scripts as the terminal, with your tools/autopost/.env.
"""
import glob
import json
import os
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from common import HERE, POSTS, ROOT, load_env, load_posts

PORT = 8790
OUT = os.path.expanduser("~/Projects/tappstudio_socials/reels/out")
JOBS = {}
BUSY = threading.Lock()

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autopost</title><style>
:root{--bg:#f6f5f1;--card:#fff;--ink:#1a1a1a;--mute:#6b6b66;--line:#e4e2da;--teal:#0f8f83;--red:#c0392b;--term:#111;--termink:#d7f5e8}
@media(prefers-color-scheme:dark){:root{--bg:#121413;--card:#1b1e1d;--ink:#ecebe6;--mute:#9a9a92;--line:#2c302e;--teal:#2ec4b6;--red:#ff6b5b;--term:#0a0c0b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 4px}p.sub{color:var(--mute);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:0 0 10px}
.row{display:flex;flex-wrap:wrap;gap:8px}button{font:inherit;font-weight:600;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:9px 14px;border-radius:9px;cursor:pointer}
button.pri{background:var(--teal);border-color:var(--teal);color:#06201d}button.danger{background:var(--red);border-color:var(--red);color:#fff}
button:disabled{opacity:.45;cursor:not-allowed}.reel{display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line)}
.reel:first-of-type{border-top:0}.reel label{flex:1;display:flex;gap:10px;align-items:center;cursor:pointer}.tag{font-size:12px;color:var(--mute)}
.tag.ok{color:var(--teal)}pre{background:var(--term);color:var(--termink);border-radius:10px;padding:14px;margin:0;min-height:160px;max-height:420px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:13px/1.45 ui-monospace,Menlo,monospace}
.hint{color:var(--mute);font-size:13px;margin:8px 0 0}
</style></head><body><main>
<h1>Autopost</h1><p class="sub">Runs the Instagram and YouTube posting scripts on this machine.</p>
<div class="card"><h2>1. Upload reels to R2</h2><div id="reels">Loading…</div>
<div class="row" style="margin-top:10px"><button class="pri" id="upload">Upload selected</button><button id="commit">Commit and push posts.json</button></div>
<p class="hint">Upload links the reel in posts.json. Commit and push it so the scheduled job sees the links.</p></div>
<div class="card"><h2>2. Check and post</h2><div class="row">
<button id="check">Check accounts and queue</button><button id="dry">Dry run</button><button class="danger" id="live">Post live now</button></div>
<p class="hint">Dry run lists what is due without posting. Post live publishes every due Ready reel immediately.</p></div>
<div class="card"><h2>Output</h2><pre id="out">Nothing run yet.</pre></div></main>
<script>
const $=s=>document.querySelector(s),out=$('#out');let busy=false;
function lock(b){busy=b;document.querySelectorAll('button').forEach(x=>x.disabled=b)}
async function reels(){const r=await (await fetch('/api/reels')).json();
$('#reels').innerHTML=r.length?r.map(x=>`<div class="reel"><label><input type="checkbox" value="${x.name}"> ${x.name}</label><span class="tag ${x.linked?'ok':''}">${x.used?(x.linked?'uploaded and linked':'not uploaded'):'not on the calendar yet'}</span></div>`).join(''):'No built reels found in '+${JSON.stringify(OUTDIR)}}
async function run(cmd,args,confirmMsg){if(busy)return;if(confirmMsg&&!confirm(confirmMsg))return;
lock(true);out.textContent='Starting…\\n';
const j=await (await fetch('/api/run',{method:'POST',body:JSON.stringify({cmd,args,confirm:!!confirmMsg})})).json();
if(j.error){out.textContent=j.error;lock(false);return}
let n=0;for(;;){const s=await (await fetch('/api/job/'+j.id+'?from='+n)).json();
if(s.text){out.textContent=(n?out.textContent:'')+s.text;n=s.next;out.scrollTop=out.scrollHeight}
if(s.done){out.textContent+=`\\n[${s.code===0?'finished':'exited with code '+s.code}]`;break}
await new Promise(r=>setTimeout(r,700))}
lock(false);reels()}
$('#upload').onclick=()=>{const names=[...document.querySelectorAll('#reels input:checked')].map(x=>x.value);
if(!names.length){out.textContent='Tick at least one reel first.';return}run('upload',names)};
$('#commit').onclick=()=>run('commit',[],'Commit socials/posts.json and push it to the current branch?');
$('#check').onclick=()=>run('check',[]);$('#dry').onclick=()=>run('dry',[]);
$('#live').onclick=()=>run('live',[],'Post every due Ready reel to Instagram and YouTube right now? This publishes for real.');
reels();
</script></body></html>"""


def reel_list():
    used = {}
    for p in load_posts()["posts"]:
        v = p.get("video")
        if v and v[2]:
            used[v[2]] = used.get(v[2], True) and bool(v[0])
    names = sorted(os.path.basename(f) for f in glob.glob(os.path.join(OUT, "*", "*.mp4"))
                   if not f.endswith(("-nomusic.mp4", "-DEMO-LOOP.mp4", "-DEMO-HOOK.mp4", "-DEMO-CAROUSEL.mp4")))
    return [{"name": n, "used": n in used, "linked": used.get(n, False)} for n in names]


def command(cmd, args):
    py, ap = sys.executable, os.path.join(HERE, "autopost.py")
    if cmd == "upload":
        names = [os.path.basename(a) for a in args]
        return [py, os.path.join(HERE, "upload.py")] + names
    if cmd == "check":
        return [py, ap, "check"]
    if cmd == "dry":
        return [py, ap, "run"]
    if cmd == "live":
        return [py, ap, "run", "--live"]
    if cmd == "commit":
        return ["sh", "-c", f"cd '{ROOT}' && git add socials/posts.json && git commit -m 'socials: link uploaded reels' "
                            f"-m 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>' && git push"]
    return None


def start_job(argv):
    jid = str(len(JOBS) + 1)
    job = JOBS[jid] = {"text": "", "done": False, "code": None}

    def work():
        with BUSY:
            p = subprocess.Popen(argv, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                 env=dict(os.environ, PYTHONUNBUFFERED="1"))
            for line in p.stdout:
                job["text"] += line
            job["code"] = p.wait()
            job["done"] = True

    threading.Thread(target=work, daemon=True).start()
    return jid


class Handler(BaseHTTPRequestHandler):
    def send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def local_only(self):
        host = self.headers.get("Host", "")
        return host.split(":")[0] in ("127.0.0.1", "localhost")

    def do_GET(self):
        if not self.local_only():
            return self.send(403, "{}")
        path, _, qs = self.path.partition("?")
        if path == "/":
            return self.send(200, PAGE.replace("${JSON.stringify(OUTDIR)}", json.dumps(OUT)), "text/html")
        if path == "/api/reels":
            return self.send(200, json.dumps(reel_list()))
        if path.startswith("/api/job/"):
            job = JOBS.get(path.rsplit("/", 1)[1])
            if not job:
                return self.send(404, "{}")
            start = int(dict(x.split("=") for x in qs.split("&") if "=" in x).get("from", 0))
            text = job["text"]
            return self.send(200, json.dumps({"text": text[start:], "next": len(text), "done": job["done"] and start >= len(text) or False,
                                              "code": job["code"]}))
        self.send(404, "{}")

    def do_POST(self):
        if not self.local_only() or self.path != "/api/run":
            return self.send(403, "{}")
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or "{}")
        if body.get("cmd") in ("live", "commit") and not body.get("confirm"):
            return self.send(200, json.dumps({"error": "This needs a confirmation."}))
        argv = command(body.get("cmd"), body.get("args") or [])
        if not argv:
            return self.send(200, json.dumps({"error": "Unknown command."}))
        if BUSY.locked():
            return self.send(200, json.dumps({"error": "Another command is still running."}))
        self.send(200, json.dumps({"id": start_job(argv)}))

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    load_env()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Autopost UI on http://127.0.0.1:{PORT} (Ctrl+C to stop)")
    webbrowser.open(f"http://127.0.0.1:{PORT}")
    server.serve_forever()
