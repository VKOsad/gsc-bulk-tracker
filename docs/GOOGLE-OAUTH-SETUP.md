# Google OAuth Setup

OpenGSC signs users in with Google and reads their Search Console (and,
optionally, GA4) data. You need a Google OAuth 2.0 Client. All scopes are
**read-only** and minimal.

Replace `gsc.22group.pro` below with your actual domain if different.

## 1. Enable the required APIs

In [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services
→ Library**, enable:

| API | Why |
|---|---|
| **Google Search Console API** | Core feature — reads GSC performance data (`webmasters.readonly`). |
| **Google Analytics Data API** | Optional — only if you use the GA4 panels (`analytics.readonly`). |

`openid`, `email`, `profile` are standard sign-in scopes and need no API toggle.

## 2. OAuth consent screen

**APIs & Services → OAuth consent screen**:

- User type: **External** (or Internal if you use Google Workspace and only
  workspace users will log in).
- App name, support email, developer contact — required fields.
- **Scopes** — add exactly these (nothing more):
  - `openid`
  - `.../auth/userinfo.email`
  - `.../auth/userinfo.profile`
  - `https://www.googleapis.com/auth/webmasters.readonly`
  - `https://www.googleapis.com/auth/analytics.readonly` (only if using GA4)
- While the app is in **Testing**, add each Google account that will log in as a
  **Test user**. (Publish the app later if you need users outside the test list.)
- Because these are sensitive/restricted scopes, an unpublished app is fine for a
  small internal team; publishing to production may trigger Google verification.

## 3. Create the OAuth Client ID

**APIs & Services → Credentials → Create Credentials → OAuth client ID**:

- Application type: **Web application**
- **Authorized JavaScript origins:**
  ```
  https://gsc.22group.pro
  ```
- **Authorized redirect URIs:**
  ```
  https://gsc.22group.pro/api/auth/callback/google
  ```
  The path is fixed by NextAuth. It must match `NEXTAUTH_URL` exactly, including
  the `https://` scheme and no trailing slash.

> For local testing you may additionally add `http://localhost:3000` (origin) and
> `http://localhost:3000/api/auth/callback/google` (redirect).

## 4. Put the values in `.env` (on the server)

```
NEXTAUTH_URL="https://gsc.22group.pro"
GOOGLE_CLIENT_ID="<client id>.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="<client secret>"
```

Then restart the app:

```bash
cd /opt/gsc-bulk-tracker/app
docker compose -f compose.prod.yaml restart opengsc
```

`NEXTAUTH_SECRET` is unrelated to Google — it is a local secret generated with
`openssl rand -base64 32`.

## 5. First login

Open `https://gsc.22group.pro` and sign in with Google. **The first account to
sign in becomes the owner** of the dashboard. Add more Google accounts later via
Settings to pull GSC data from all of them.

## Requested scopes (reference)

The app requests, at login (`src/lib/auth.ts`), with `access_type=offline` and
`prompt=consent` so it receives a refresh token:

```
openid email profile
https://www.googleapis.com/auth/webmasters.readonly
https://www.googleapis.com/auth/analytics.readonly
```

## Troubleshooting

- **`redirect_uri_mismatch`** — the redirect URI in Google Console doesn't match
  `NEXTAUTH_URL` + `/api/auth/callback/google` exactly (scheme, host, no trailing
  slash).
- **`access_blocked` / app not verified** — add the account under **Test users**,
  or publish the consent screen.
- **No data after login** — the account must have access to the properties in
  Search Console; the scope granted must include `webmasters.readonly`.
