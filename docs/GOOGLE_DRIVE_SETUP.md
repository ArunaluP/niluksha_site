# Google Drive for report exports — one-time setup

When this is set up, the **Excel** button on the Reports pages can save files straight into a
company Google Drive folder (`<folder>/<YYYY-MM>/…xlsx`). Staff never sign in to Google; the
Director connects the company Google account once in **Settings**.

There are two parts:
- **A. Google Cloud**: create the app's "key" (OAuth client). Done once, about 10 minutes.
- **B. The app**: put the key in `.env.local`, then connect in Settings.

---

## A. Google Cloud (with the company Google account)

1. Open <https://console.cloud.google.com/> and sign in with the **company Google account**
   (the one whose Drive will hold the reports).
2. Top bar → project picker → **New project** → name it `Care Booking` → **Create**, then select it.
3. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
4. **APIs & Services → OAuth consent screen** (also called "Google Auth Platform"):
   - **App name**: `Care Booking`, **User support email**: the company email.
   - **Audience / User type**:
     - Google Workspace (company email on your own domain): choose **Internal**. No warnings, done.
     - Normal Gmail: choose **External**.
   - **Contact email**: the company email → **Save**.
   - **Data access / Scopes** → **Add or remove scopes** → tick
     `.../auth/drive`, `openid` and `.../auth/userinfo.email` → **Update** → **Save**.
   - External only — **Audience → Publish app → In production**.
     (In "Testing" mode Google cancels the connection after 7 days.)
     You'll see "Google hasn't verified this app" when connecting: that's expected for a private
     business app. Click **Advanced → Go to Care Booking (unsafe)** — it's your own app.
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type**: Web application, **Name**: `Care Booking web`.
   - **Authorised redirect URIs** → **Add URI** — every address the app is opened at, ending in
     `/api/google/callback`:
     - `http://localhost:3000/api/google/callback`  (on this PC)
     - later, the real site: `https://your-domain/api/google/callback`
     - a **fixed** ngrok domain works too (`https://your-name.ngrok-free.app/api/google/callback`);
       a random ngrok link that changes each time does not.
   - **Create** → copy the **Client ID** and **Client secret**.

## B. The app

1. Add to `.env.local` (next to `DATABASE_URL`):
   ```
   GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```
   Restart the app (`Ctrl + C`, then `npm run dev`).
2. Make sure the database is up to date: `npm run db:migrate -- --apply` (adds the Drive and
   export-log tables, migration 010).
3. Log in as the **Director** → **Settings → Google Drive → Connect Google Drive** → pick the
   company account → **Allow**. You come back to Settings: "Connected as …".
4. In Google Drive, create (or open) the folder for reports, copy its address from the browser
   (it contains `/folders/…`), paste it in **Drive folder link** → **Save folder**.
   The app checks the folder exists and that the account can add files to it.

Done. On any report: **Excel → Save to Google Drive** (or **Both**).

## Good to know

| | |
|---|---|
| Who can save to Drive | Director and call center. Branch managers can only download. |
| Where files go | `<your folder>/<YYYY-MM of the report's end date>/<report name>.xlsx` |
| Changing the account | Settings → **Disconnect**, then **Connect** with the other account, then set the folder again. |
| "Reconnect Google Drive" message | Access was removed in the Google account, the app was left in Testing mode (7 days), or `SESSION_SECRET` changed. Click **Reconnect**. |
| Security | The Google key (refresh token) is stored **encrypted** in the database; only the server can read it. Disconnect also cancels it at Google. |
| Record of exports | Settings → **Recent exports** (every export: who, which report, downloaded and/or Drive link). |
