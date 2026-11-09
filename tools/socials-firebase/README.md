# Socials posting: Instagram and YouTube from the calendar

The calendar at `/socials/` posts to each app's Instagram account (single images, carousels and reels) and to the
YouTube channel (Shorts). Nothing goes out on its own: a post goes live only when you tap **Post now**, or at the time you
pick with **Schedule**. LinkedIn and X stay manual.

Everything runs in the `tappstudio-socials` Firebase project. GitHub is not involved.

## How it works

1. On the calendar, tap **Sign in to post** and sign in with Google. Only the emails in `functions/.env`
   (`OWNER_EMAILS`) are let in.
2. On an Instagram or YouTube post, tap **Post now** or **Schedule**.
   - Images and carousels: the page turns the WebP slides into JPEGs (Instagram only takes JPEG) and uploads them.
   - Reels and Shorts: pick the MP4 from `~/Projects/tappstudio_socials/reels/out/<brand>/`. The IG reel and its YT
     twin share one upload, so the second one says "uploaded" and needs no file.
3. The `api` Cloud Function posts right away, or saves the job for the `tick` function, which runs on the hour and half
   hour (IST) and posts whatever is due. The Schedule picker works in half-hour steps; any other time rounds up to the
   next slot. A scheduled post shows **⏱ time** and **Cancel** on its row; a posted one shows **View post**;
   a failed one shows the reason, **Retry** and **Cancel**. The calendar status moves to scheduled, then posted.
4. Instagram posts also go to that account's Story, unless you untick **Also post to Story** for it in Accounts. The
   Story is the image, the first carousel slide, or the reel video, with no caption. The API can't use the app's
   "share post to story" sticker, so it's a separate Story. If the Story fails, the post still counts as posted and
   the row says the Story didn't go out.
5. Once a post is live its media is deleted from Storage, unless another queued post still uses it.

Safety:
- A post can only be claimed once (a Firestore transaction moves it from scheduled to posting), so two runs can't post
  it twice. A post still "posting" after 20 minutes is marked failed with a note to check the account first.
- Instagram tokens and the YouTube refresh token are stored in `private/creds` in Firestore. Only the functions read it
  (the Admin SDK skips the rules; the live rules refuse public reads and writes on `private/` and `jobs/`, checked on
  9 Nov 2026). The page never gets them back. If you ever add a catch-all rule, keep `private/` locked.
- The Firestore rules were not changed. Storage rules (`storage.rules`) only let the signed-in owner upload JPEGs and MP4s
  under `media/`.
- Instagram refreshes each 60-day token every week, so a connected account keeps working.

## Cost: the Blaze plan at $0

Cloud Storage and Cloud Functions need the Blaze (pay-as-you-go) plan. At this volume everything stays inside the
no-cost quotas: about 1,500 scheduler runs a month (2M invocations free), a few hundred MB of media at a time (5 GB free,
and it's deleted after posting), and under 1 GB of YouTube uploads a month (1 GB of outbound traffic free). Cloud Scheduler
gives 3 free jobs per billing account; this uses 1. Container images for the 2 functions may cost a few cents a month in
Artifact Registry; the deploy offers a cleanup policy that keeps that near zero.

Google has no hard spending cap, so set a budget alert: Google Cloud console > Billing > Budgets & alerts > Create
budget, project `tappstudio-socials`, amount ₹100, alerts at 50%, 90% and 100%.

## One-time setup

### 1. Blaze plan and Storage
1. Firebase console > tappstudio-socials > Upgrade > Blaze, and link a billing account. Then add the budget alert above.
2. Build > Storage > Get started > choose **us-central1** (a no-cost location) > production mode.
3. Build > Authentication > Get started > Sign-in method > enable **Google**.
4. Authentication > Settings > Authorized domains > add `www.tappstudio.in` (`localhost` is already there).

### 2. Deploy
From this folder (`tools/socials-firebase`):

```bash
cd functions && npm install && cd ..
firebase deploy --only functions,storage --project tappstudio-socials
```

`functions/.env` holds `OWNER_EMAILS` and is deployed with the functions. Add another Google account there
(comma-separated) and deploy again to let it post too.

### 3. Instagram (once per app account)
1. Each Instagram account must be a Professional account (Instagram app > Settings > Account type and tools).
2. At [developers.facebook.com](https://developers.facebook.com) log in (register as a developer if asked), then
   My Apps > **Create App**. Under Add use cases, filter by **Content management** and pick **Manage messaging & content
   on Instagram**. Skip connecting a business portfolio and create the app.
3. Use cases > Manage messaging & content on Instagram > Customize > **API setup with Instagram login** (not Facebook
   login). The messaging and webhook sections there aren't needed.
4. Under **Generate access tokens**, click **Add account** for each Instagram account, with `instagram_business_basic`
   and `instagram_business_content_publish`, then **Generate token**. If an account can't be added, add it under
   App roles > Roles as an **Instagram Tester** and accept the invite in the Instagram app (Settings > Website
   permissions > Apps and websites > Tester invites). Meta renames these screens often; its current guide is
   [Create an Instagram app](https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app).
5. On the calendar, open **Accounts**, paste the token next to the brand and tap **Save**. It checks the token and shows
   the account's @name and how many of today's posts are used.

The app can stay in development mode: you are its admin and the accounts are testers, so no App Review is needed.

### 4. YouTube (one channel for every brand)
1. Verify the channel at youtube.com/verify, so Shorts can run longer than 15 seconds.
2. [Google Cloud console](https://console.cloud.google.com), project `tappstudio-socials`: APIs & Services > Library >
   enable **YouTube Data API v3**.
3. OAuth consent screen: External, add yourself as a test user, then **Publish app** (in Testing mode sign-ins expire
   every 7 days; an unverified app is fine, you click through a warning).
4. Credentials > Create credentials > OAuth client ID > **Web application**. Authorized JavaScript origins:
   `https://www.tappstudio.in` and `http://localhost:8123`.
5. On the calendar, open **Accounts**, paste the client ID and secret, tap **Save**, then **Connect YouTube** and sign
   in with the account that owns the channel.
6. Fill in the [YouTube API audit form](https://support.google.com/youtube/contact/yt_api_form) (use case: uploading
   your own Shorts to your own channel). Until Google approves it, uploads from the API stay private whatever you pick, and
   you make them public in YouTube Studio.

## Limits
- Instagram: a carousel takes 2 to 10 images; JPEG only (done for you). Each account can publish a limited number of
  posts a day through the API; the dialog and Accounts show today's usage.
- YouTube: about 6 uploads a day on the free API quota.
- Alt text isn't sent through the API. Add it in the Instagram app after posting if you want it.
- Stories: a 4:5 image is shown letterboxed on the 9:16 Story. Story videos over 60 seconds may be refused (the post
  itself still goes out). Stories may count toward the daily publishing limit.

## Testing locally (no real accounts touched)
The emulators need Java 21+ (Android Studio's bundled one works).

```bash
cd tools/socials-firebase
node functions/test/fake-apis.js &                       # stands in for Instagram, Google OAuth and YouTube
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  firebase emulators:start --only auth,functions,firestore,storage --project tappstudio-socials
node functions/test/e2e.js                               # 16 scenarios, about 2.5 minutes
```

`functions/.env.local` points the functions at the fake APIs and lets `owner@example.com` in. Open
`http://localhost:8123/socials/?emu` to drive the calendar against the emulators. In emulator mode the calendar's own
statuses are still read from the live board, so don't press the old status buttons there.
