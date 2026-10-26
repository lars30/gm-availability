# GM Availability Checker

Checks seat availability, schedule, format and price for each of your RoleCall
games every hour from 8 AM to 6 PM MST and publishes the result
as a public JSON file your results page can fetch.

**Live at:** `https://lars30.github.io/gm-availability/availability.json`
— this is already set up and running; the steps below are for reference
if you ever need to rebuild it or set up something similar elsewhere.

**Consumed by:** the player-interest results page, which lives in a
separate repo — [`square-space_landing_page`](https://bitbucket.org/larryworks/square-space_landing_page)
(`results-page.html`, plus `results-page-preview.html` for local testing).
It fetches the JSON this repo publishes and shows each session's day/time,
price and open seats. Any
change to the shape of `availability.json` needs a matching change there;
this repo only produces the data.

## One-time setup

1. **Create a new GitHub repo** (public — GitHub Pages on the free tier
   needs a public repo, and this data isn't sensitive). Name it whatever
   you like, e.g. `gm-availability`.

2. **Add these files** to the repo, keeping the folder structure exactly
   as given:
   ```
   scrape.js
   package.json
   .github/workflows/check-availability.yml
   docs/            (empty folder is fine — the script creates the file)
   ```
   Optional but recommended: `test/` and `.github/workflows/test.yml` (see
   "Tests" below).
   Easiest way: on github.com, click "Add file" → "Upload files" and drag
   all of these in, preserving the folder paths.

3. **Enable GitHub Pages**, serving from the `docs` folder:
   - Go to your repo → **Settings** → **Pages**
   - Under "Build and deployment", set **Source** to "Deploy from a branch"
   - Set **Branch** to `main` and folder to `/docs`
   - Save. GitHub will give you a URL like:
     `https://<your-username>.github.io/<repo-name>/`

4. **Run the workflow once manually** to generate the first
   `availability.json`:
   - Go to the **Actions** tab in your repo
   - Click "Check RoleCall Availability" in the left sidebar
   - Click **Run workflow** → **Run workflow**
   - Wait ~30 seconds, refresh, and you should see a green checkmark

5. **Check the output**: visit
   `https://<your-username>.github.io/<repo-name>/availability.json`
   in your browser. You should see JSON like:
   ```json
   {
     "generatedAt": "2026-10-26T...",
     "listings": {
       "dnd2024inperson": {
         "ref": "dnd2024inperson",
         "title": "The Keep on the Cauldronlands (In Person)",
         "url": "https://rolecall.games/games/larrydotorg/the-keep-on-the-cauldronlands",
         "format": "in_person",
         "venue": "Fate Brewing Midtown Phx",
         "seatsFilled": 1,
         "seatsTotal": 6,
         "hasOpenSeats": true,
         "sessions": [
           {
             "id": "the-keep-on-the-cauldronlands",
             "url": "https://rolecall.games/games/larrydotorg/the-keep-on-the-cauldronlands",
             "schedule": "Tuesdays 6:00–9:30 PM MST",
             "nextDate": null,
             "costCents": 4000,
             "needsMore": 2,
             "seatsFilled": 1,
             "seatsTotal": 6,
             "hasOpenSeats": true
           }
         ]
       },
       "lotr": { ... }
     }
   }
   ```

   Each game is one RoleCall page, so `sessions` has a single entry (kept
   as a list so the shape matches the old per-day/time listings).
   `format` is `online` or `in_person`; `venue` is only set for in-person
   games. `schedule` is the page's own "When" text, in MST, and may name
   several possible days. `nextDate` is always `null`: RoleCall's game page
   doesn't publish a next-session date. `costCents` is the price per
   player per session in cents (`2500` = $25). `needsMore` is how many more
   players the game needs before it starts, or `null`.

6. **Note this URL** — you'll need it for the results page fetch. It's:
   `https://<your-username>.github.io/<repo-name>/availability.json`

That's it. From here, GitHub runs `scrape.js` automatically every hour from 8 AM to 6 PM MST
and commits the updated JSON — nothing else to maintain.

## Adding a new game

Edit the `LISTINGS` object at the top of `scrape.js`, add the new entry,
commit and push. The next scheduled run (or a manual "Run workflow" click)
will pick it up.

A game is an entry with a `title` and a `slug`: the last part of its
RoleCall page URL (`rolecall.games/games/larrydotorg/<slug>`; ignore any
`?preview=...`). A remote and an in-person version of the same game are
separate pages, so they are separate entries with their own refs. The
profile page (`rolecall.games/larrydotorg`) isn't scraped to find new
games, so a new game won't appear until its slug is added here.

For a brand-new game, also add a matching entry (same ref) to
`CAMPAIGN_HIGHLIGHTS` in the landing page repo's `results-page.html` and
`results-page-preview.html`.

## Tests

```
npm test
```

Uses Node's built-in test runner (Node 20+, no dependencies). No network
access — everything runs against saved HTML in `test/fixtures/`.

- `test/parse.test.js` — parsing a game page's seats, schedule, price,
  format and venue: online and in-person games (saved real pages), the
  "needs N more" count, the per-session price vs. the 6-session pack, and
  the failure cases (Players fact missing → "not found", schedule missing →
  seats still parse).
- `test/summarize.test.js` — how a game is rolled up: open, full, or
  unknown if the page couldn't be read.
- `test/config.test.js` — the `LISTINGS` config: titles and slugs present,
  no slug listed twice, slugs are bare slugs not full URLs, and the game
  refs the results page looks up still exist.
- `test/contract.test.js` — the shape of `docs/availability.json`. The
  results page in the landing page repo reads it, so a renamed or removed
  field fails here instead of silently breaking the campaign card.

GitHub runs these on every push and pull request via
`.github/workflows/test.yml`. It's a separate workflow from the scheduled
availability check, so a failing test emails you but never stops the data
from updating.

**If RoleCall changes their markup**, the live run is what notices
(the red-X email described below). To make the tests reflect the new page,
save a copy of a real game page into `test/fixtures/`, update the
patterns in `scrape.js`, and make the fixtures pass again.

## Failure notifications

If a game fails to parse — RoleCall returns an HTTP error, or
changes their page markup so the Players fact is no longer found —
`scrape.js` deliberately exits with an error code instead of quietly
succeeding. This marks the GitHub Actions run as failed (red X), which
triggers GitHub's built-in email notification (sent to whoever created
the workflow — check **Settings → Notifications → Actions** on your
GitHub account to confirm this is turned on and set to email).

Importantly, `docs/availability.json` still gets committed even when the
run is marked failed — the commit step is configured to run regardless
(`if: always()` in the workflow file), so any games that *did* parse
successfully still update. A session that failed is written with an
`error` field and `null` seat values (not carried over from the previous
run), letting `results-page.html` (in the landing page repo) fall back gracefully (it
only shows seat counts when `hasOpenSeats` is an actual boolean, not
`null`, and leaves out any session that failed).

## If the seat count stops updating

Check the Actions tab for a red X — as of the failure-notification setup
above, this should now also show up as an email. Click into the failed
run and expand the "Run scraper" step's log; it prints exactly which
game(s) failed and why (`HTTP 404`, `pattern not found`, etc.).
"Pattern not found" almost always means RoleCall changed their page
markup, which would require updating `readFacts` / `PLAYERS_PATTERN` in
`scrape.js` to match their new structure — inspect the live game
page's source to see what changed.
