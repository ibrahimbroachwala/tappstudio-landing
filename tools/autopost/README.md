# Autopost: Instagram reels and YouTube Shorts

Posts the reels on the socials calendar for you. LinkedIn and X stay manual.

How it works:

1. You build a reel as usual in `~/Projects/tappstudio_socials/reels`, then run `upload.py`. It puts the MP4 and its cover in a public R2 bucket and writes the link into `video[0]` of the IG post and its YT twin in `socials/posts.json`.
2. You commit and push `posts.json` to `release`, and set the post to **Ready** on the calendar page.
3. Every 30 minutes a GitHub Action runs `autopost.py`. A reel is posted once its date and time (IST) has passed, as long as its link is in R2 and its live status is **Ready**. The calendar then shows it as **Posted**.

Rules worth knowing:

- **Scheduled** on the calendar means you scheduled it yourself in Meta Business Suite or YouTube Studio, so autopost leaves it alone. Use **Ready** for the ones you want autoposted.
- Moving a post on the calendar page moves when it goes out.
- A post more than 36 hours late is not posted. It shows as late on the calendar and waits for you.
- At most 4 posts go out per run. Nothing is posted until the `AUTOPOST_LIVE` variable is `1`.
- What went out is recorded in a private R2 bucket before the calendar is updated, so a post can't go out twice.
- Videos in the public bucket can be opened by anyone with the link before they post. The links are in `posts.json`, which is public.

## Setup

All names below go in `tools/autopost/.env` (gitignored, template in `.env.example`) for running locally, and in GitHub (repo > Settings > Secrets and variables > Actions) for the scheduled job. Never paste them into a chat or a file that is committed.

### 1. Cloudflare R2

1. In the Cloudflare dashboard go to R2 and create two buckets: `tappstudio-reels` (public, the videos) and `tappstudio-autopost` (private, the state).
2. On `tappstudio-reels`, open Settings > Public access and either connect a custom domain (for example `media.tappstudio.in`) or allow the `r2.dev` subdomain. The r2.dev link is rate limited and meant for testing, so a custom domain is better.
3. R2 > Manage API tokens > Create API token: permission **Object Read & Write**, applied to those two buckets only. Copy the Access Key ID, Secret Access Key and your Account ID.

| Name | Where in GitHub | Value |
|---|---|---|
| `R2_ACCOUNT_ID` | secret | your Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | secret | from the API token |
| `R2_SECRET_ACCESS_KEY` | secret | from the API token |
| `R2_PUBLIC_BUCKET` | `.env` only | `tappstudio-reels` |
| `R2_PUBLIC_BASE` | variable | the public URL, e.g. `https://media.tappstudio.in` |
| `R2_STATE_BUCKET` | variable | `tappstudio-autopost` |

### 2. Instagram (one token per app account)

Do this once for Misbaha, Nasab and Splitup, and later for Kadak.

1. Make sure each Instagram account is a Professional account (Business or Creator): Instagram app > Settings > Account type and tools.
2. At [developers.facebook.com](https://developers.facebook.com/apps) create one app (type Business) and add the **Instagram** product. Choose **API setup with Instagram login**.
3. Under App roles > Roles, add each Instagram account as an **Instagram Tester**. Accept each invite in the Instagram app (Settings > Website permissions > Apps and websites > Tester invites).
4. Back in API setup with Instagram login, under **Generate access tokens**, click **Add account** for each account and sign in to it. Make sure the permissions include `instagram_business_basic` and `instagram_business_content_publish`.
5. For each account, copy its **Instagram user ID** (shown next to the account) into `ig_id` in `accounts.json`, and click **Generate token**. That token is long-lived (60 days). Autopost refreshes it every week from then on, so you only do this once.

| Name | Where in GitHub | Value |
|---|---|---|
| `IG_TOKEN_MISBAHA`, `IG_TOKEN_NASAB`, `IG_TOKEN_SPLITUP` (later `IG_TOKEN_KADAK`) | secret | the generated token |

The app can stay in development mode: you are its admin and the accounts are testers, so no App Review is needed. If a token ever stops working, generate a new one and replace the secret. Autopost notices the new secret and uses it.

### 3. YouTube (one channel)

1. Create the channel on YouTube if it doesn't exist, and verify it with your phone (youtube.com/verify) so Shorts can be longer than 15 seconds and you can set custom thumbnails.
2. In [Google Cloud console](https://console.cloud.google.com) create a project, then APIs & Services > Library > enable **YouTube Data API v3**.
3. APIs & Services > OAuth consent screen: user type External, add yourself as a test user, then **Publish app** so it is "In production". In Testing mode the sign-in expires every 7 days. An unverified app is fine, you just click through a warning when you sign in.
4. APIs & Services > Credentials > Create credentials > OAuth client ID > **Desktop app**. Put the client ID and secret in `tools/autopost/.env`.
5. Run `python3 tools/autopost/yt_auth.py` and sign in with the account that owns the channel. It saves `YT_REFRESH_TOKEN` in `.env`. Copy it from there into the GitHub secret.
6. Videos uploaded from a new API project are locked to private until Google audits it. Fill in the [YouTube API Services audit form](https://support.google.com/youtube/contact/yt_api_form) once (use case: uploading your own Shorts to your own channel). Until it is approved, the Shorts upload as private and you make them public in YouTube Studio.

| Name | Where in GitHub | Value |
|---|---|---|
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` | secret | from the steps above |
| `YT_PRIVACY` | variable (optional) | `public` (default), `unlisted` or `private` |

YouTube allows about 6 uploads a day on the free quota. All four app brands post to the same channel (`youtube.brands` in `accounts.json`).

### 4. Turn it on

1. Run the check locally: `python3 tools/autopost/autopost.py check`. Each account should say OK, and the queue shows what goes out in the next 7 days and what is blocked.
2. The scheduled workflow only runs from the default branch, so `.github/workflows/autopost.yml` must be on `main` too. It always checks out `release`.
3. In GitHub, Actions > autopost > Run workflow with mode **check**. Then run it with mode **run** for a dry run: it prints what it would post.
4. When that looks right, add the variable `AUTOPOST_LIVE` = `1`. From the next half hour, due reels go out.

To pause it, set `AUTOPOST_LIVE` to `0`, or disable the workflow in the Actions tab.

## Commands

```bash
python3 tools/autopost/upload.py misbaha-R01.mp4 nasab-R02.mp4   # upload and link reels in posts.json
python3 tools/autopost/autopost.py check                         # accounts, R2 and the next 7 days
python3 tools/autopost/autopost.py run                           # dry run
python3 tools/autopost/autopost.py run --live                    # post what is due now, from this machine
```
