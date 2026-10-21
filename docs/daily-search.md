# Daily search

The cloud Radar (Worker `instaradar`, D1 database `instaradar`) does not crawl Instagram. Once a day, search by hand, save a JSON file in the same shape as a local import, turn it into SQL, and apply that file to D1.

New usernames land in the Radar with a **Nuevos hoy** badge. Usernames already stored are left as they are. The run markers update even when the file adds nobody.

## 1. Search at a human pace

Use the research Instagram account, the one whose Chrome profile lives in `data/ig-profile`. Do not use the outreach account, and do not send messages.

Work the way the local search does:

- Open the city's hashtags and place pages one profile at a time.
- Pause several seconds between profiles. A daily pass is a handful of accounts, not a crawl.
- Stop if Instagram shows a challenge or asks you to wait. Resolve that in the window, then continue only when you are ready.
- Skip anyone already in the Radar. The SQL also skips those usernames, but leaving them out of the file keeps the diff small.

Stay inside the follower range the Radar is using (2,000 to 25,000 unless that lock changes).

## 2. Produce the JSON

Save one file per day, for example `data/daily/2026-10-21.json`. It is the same object `scripts/import.mjs` and `make import` already accept:

- `city` — a catalog name or id, such as `Medellín` or `medellin`
- `collected_at` — `YYYY-MM-DD` (optional)
- `source` — short note about this pass (optional)
- `competitors` — array, may be empty. The first username is used only to score a public mention
- `influencers` — the new profiles. An empty array is valid

Each influencer uses the research fields: `username`, `url`, `display_name`, `followers`, `following`, `posts`, `bio`, `location`, `niche`, `mentioned_pergamino`, `verified`, `source`, `followers_source`, `evidence_url`, `notes`, `avatar_url`.

`followers`, `following`, and `posts` may be a number, a compact string such as `6.4k`, or empty. `verified: false` keeps the **Por verificar** badge. `location` should name a zone the city already has (`Laureles`, `El Poblado`, `Envigado`, and the rest) when you know it.

```json
{
  "city": "Medellín",
  "collected_at": "2026-10-21",
  "source": "daily search",
  "competitors": [],
  "influencers": [
    {
      "username": "cafe.ejemplo",
      "url": "https://www.instagram.com/cafe.ejemplo/",
      "display_name": "Café Ejemplo",
      "followers": 4200,
      "following": 300,
      "posts": 80,
      "bio": "Café de barrio en Laureles",
      "location": "Laureles",
      "niche": "café de especialidad",
      "mentioned_pergamino": false,
      "verified": true,
      "source": "instagram",
      "followers_source": "instagram",
      "evidence_url": "https://www.instagram.com/cafe.ejemplo/",
      "notes": "",
      "avatar_url": ""
    }
  ]
}
```

## 3. Generate the SQL

From the repo root, with Node 22:

```bash
node scripts/daily-import.mjs data/daily/2026-10-21.json --out cloudflare/dist/daily-search.sql
```

The same step through Make:

```bash
make daily-import FILE=data/daily/2026-10-21.json
```

`OUT` overrides the SQL path. The default is `cloudflare/dist/daily-search.sql`. Omit `--out` to print SQL on stdout.

The file does four things:

1. Inserts each candidate into `profiles` (`username`, `city_id`, `data`) only when that username is not already there. The stored JSON is a profile card with `newToday: true` and `foundOn` set to the America/Bogota calendar date of this run.
2. Does not replace an existing row. A repeated username keeps its name, score, notes, and earlier `foundOn`.
3. Clears `newToday` on rows whose `foundOn` is an earlier Bogota date, so yesterday's badge does not stick. Rows found today keep the flag if you apply the file twice.
4. Always writes the meta keys `daily_search_last_run_at` (ISO time of this generation) and `daily_search_last_run_new` (how many rows the file actually inserted). Both are written when the insert count is 0.

`daily_search_last_run_new` is computed in SQL from the profile count before and after the inserts, so a file that only repeats known usernames records `0`.

## 4. Apply it to D1

On a machine logged into the Cloudflare account that owns the database:

```bash
wrangler d1 execute instaradar --remote --file cloudflare/dist/daily-search.sql
```

`npx wrangler d1 execute instaradar --remote --file=cloudflare/dist/daily-search.sql` is the same command. Add `--yes` when it must not prompt. This writes to the remote database named `instaradar`. It does not deploy the Worker.

Check the markers:

```bash
wrangler d1 execute instaradar --remote --command "SELECT key, value FROM meta WHERE key LIKE 'daily_search_%'"
```

## 5. Read it in the Radar

Reload the cloud Radar after the static UI from this repo has been deployed (the usual export in `docs/deploy-cloudflare.md`).

- Each profile with today's `foundOn` shows a **Nuevos hoy** badge. The day boundary is America/Bogota, so a pass run in the evening is still "hoy" until midnight in Medellín.
- The **Nuevos hoy** chip filters the list to that batch. Follower range and zone still apply.
- The **Búsqueda diaria** switch calls `POST /api/daily-search`, which toggles `daily_search_enabled`. `GET /api/daily-search` returns `{ enabled, lastRunAt, lastRunNew }`. The switch does not run the search and does not block the SQL import. It is the on/off mark for whether today's pass should happen.
- `GET /api/state` includes the same three meta keys. A fresh seed from `cloudflare/build.py` creates them as `false`, `null`, and `0` when the Mac dump does not already have them. A full reseed drops `meta` and writes those defaults again, so it clears the last run unless the state file already contains the three keys.

New usernames show initials until a later full deploy embeds `data/avatars/<username>.jpg`. The daily SQL does not upload photos.

## What stays manual

In-app **Buscar**, JSON import on the Mac, and invitations still return 403 on the Worker. This path only adds profiles and records the run.
