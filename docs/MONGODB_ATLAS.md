# MongoDB Atlas setup

This app uses MongoDB Atlas for:

- **Pregame odds** — 11am ET daily snapshot (collection `pregame_odds`). The games API uses **only** the DB + ESPN (no Odds API call on page load), so credits are used once per day by the cron.
- **EV P/L chart** — minute-by-minute snapshots (collection `ev_snapshots`)

---

## Step 1: Network Access (required for Vercel)

1. In the left sidebar, go to **Security** → **Network Access**.
2. Click **Add IP Address**.
3. For local dev you can add your current IP. For **Vercel (production)** you need to allow all:
   - Click **Allow Access from Anywhere** — this adds `0.0.0.0/0`.
   - Confirm. (Atlas only accepts connections from whitelisted IPs; Vercel’s IPs change, so “anywhere” is standard for serverless.)

---

## Step 2: Database user (if you don’t have one)

1. Go to **Security** → **Database Access** → **Add New Database User**.
2. Choose **Password** authentication.
3. Set a username (e.g. `3ptventures-app`) and a strong password (save it somewhere safe).
4. Under **Database User Privileges**, leave **Read and write to any database** (or restrict to the `3ptventures` db if you prefer).
5. Click **Add User**.

---

## Step 3: Get the connection string

1. Go back to **Database** (or the main overview).
2. On **Cluster0**, click **Connect**.
3. Choose **Drivers** (or “Connect your application”).
4. Select **Node.js** and your driver version (e.g. 6.4 or later).
5. Copy the connection string. It looks like:
   ```text
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<username>` with your database user and `<password>` with that user’s password.  
   **Important:** If the password contains `@`, `#`, `:`, `/`, or `%`, you must URL-encode them in the URI (e.g. `@` → `%40`, `#` → `%23`, `:` → `%3A`). Otherwise you’ll see errors like “option … is not supported”.
7. Add the database name so the app uses a dedicated db. After `.mongodb.net/` put `3ptventures`:
   ```text
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/3ptventures?retryWrites=true&w=majority
   ```

---

## Step 4: Add the URI to your project

1. In the project root, create `.env.local` (it’s gitignored).
2. Add one line (paste your full URI from step 3):

```bash
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/3ptventures?retryWrites=true&w=majority
```

3. Restart the dev server (`npm run dev`) so it picks up the new env var.

Optional: if you ever use a different database name, set:

```bash
MONGODB_DB_NAME=your_db_name
```

---

## Step 5: Production (Vercel)

1. In Vercel: Project → **Settings** → **Environment Variables**.
2. Add `MONGODB_URI` with the same connection string (same user/password and `3ptventures` db).
3. Redeploy so the cron and API routes use the DB.

---

## Collections (no manual setup)

The app creates collections on first use:

- **ev_snapshots** — `{ t, v }` for the EV P/L chart.
- **pregame_odds** — daily pregame odds from the cron job.
- **completed_games** — finished games (scores, result, odds). Source of truth for finals; new finals from ESPN are written here automatically.

No schema or migration steps required.

---

## Backfilling completed games and EV chart

To backfill the 7 completed games (with scores/times from ESPN) and the EV P/L chart:

```bash
curl -X POST http://localhost:3000/api/backfill-completed
```

If `CRON_SECRET` is set, include it:  
`curl -X POST "http://localhost:3000/api/backfill-completed?secret=YOUR_CRON_SECRET"`

This writes to `completed_games` and `ev_snapshots`. The games list and P/L chart then use the DB as the source of truth.
