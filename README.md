# GM Availability Checker

Checks seat availability on your StartPlaying listings every 6 hours and
publishes the result as a public JSON file your results page can fetch.

**Live at:** `https://lars30.github.io/gm-availability/availability.json`
— this is already set up and running; the steps below are for reference
if you ever need to rebuild it or set up something similar elsewhere.

**Consumed by:** the player-interest results page, which lives in a
separate repo — [`square-space_landing_page`](https://bitbucket.org/larryworks/square-space_landing_page)
(`results-page.html`, plus `results-page-preview.html` for local testing).
It fetches the JSON this repo publishes and shows the seat counts. Any
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
   - Click "Check StartPlaying Availability" in the left sidebar
   - Click **Run workflow** → **Run workflow**
   - Wait ~30 seconds, refresh, and you should see a green checkmark

5. **Check the output**: visit
   `https://<your-username>.github.io/<repo-name>/availability.json`
   in your browser. You should see JSON like:
   ```json
   {
     "generatedAt": "2026-08-26T...",
     "listings": {
       "dnd2024": {
         "ref": "dnd2024",
         "title": "The Keep on the Cauldronlands",
         "url": "https://startplaying.games/adventure/...",
         "seatsFilled": 0,
         "seatsTotal": 5,
         "hasOpenSeats": true,
         "sessions": [
           {
             "id": "cmqpuqj2w001dl8040nqe24ow",
             "url": "https://startplaying.games/adventure/...",
             "schedule": "Weekly / Monday - 9:00 PM UTC",
             "nextDate": "2026-10-19T21:00:00.000Z",
             "costCents": 1500,
             "seatsFilled": 0,
             "seatsTotal": 5,
             "hasOpenSeats": true
           }
         ]
       },
       "lotr": { ... }
     }
   }
   ```

   Each game has one StartPlaying listing per day/time, so `sessions`
   has one entry per listing. At the game level, `hasOpenSeats` is true
   if **any** session has room, while `url`, `seatsFilled` and
   `seatsTotal` describe the **first** session only (kept so anything
   written for the old one-listing-per-game shape keeps working).
   `schedule` is as StartPlaying shows it (UTC); `nextDate` is the next
   occurrence as an ISO timestamp, for formatting in the viewer's own
   time zone. `costCents` is the price per player per session in cents
   (`2500` = $25), read from that listing's own "$X / Session" text — it
   can differ between time slots of the same game, so it lives on the
   session, not the game.

6. **Note this URL** — you'll need it for the results page fetch. It's:
   `https://<your-username>.github.io/<repo-name>/availability.json`

That's it. From here, GitHub runs `scrape.js` automatically every 6 hours
and commits the updated JSON — nothing else to maintain.

## Adding a new campaign listing

Edit the `LISTINGS` object at the top of `scrape.js`, add the new entry,
commit and push. The next scheduled run (or a manual "Run workflow" click)
will pick it up.

A game is an entry with a `title` and a list of `sessions`, one
StartPlaying listing ID per day/time. The ID is the part after
`/adventure/` in the listing URL (ignore `?slug=...`). To add a new time
slot to an existing game, add its ID to that game's `sessions` list; the
day and time are read from the page itself. The profile page
(`startplaying.games/gm/larrydotorg`) can't be scraped to find new
listings automatically because it renders in the browser, so a new
session won't appear until its ID is added here.

For a brand-new game, also add a matching entry (same ref) to
`CAMPAIGN_HIGHLIGHTS` in the landing page repo's `results-page.html` and
`results-page-preview.html`.

## Tests

```
npm test
```

Uses Node's built-in test runner (Node 20+, no dependencies). No network
access — everything runs against saved HTML in `test/fixtures/`.

- `test/parse.test.js` — the seat-count, schedule, next-date and cost parsing:
  open, partly filled and full listings, numbers split across tags, and
  the failure cases (seat text missing → "not found", schedule missing →
  seats still parse).
- `test/summarize.test.js` — how a game's sessions roll up: open if *any*
  session has room, full only if *every* session is, unknown if none could
  be read, and failed sessions ignored.
- `test/config.test.js` — the `LISTINGS` config: titles present, no ID
  listed twice (a pasted ID under the wrong game), IDs are bare listing IDs
  not full URLs, and the game refs the results page looks up still exist.
- `test/contract.test.js` — the shape of `docs/availability.json`. The
  results page in the landing page repo reads it, so a renamed or removed
  field fails here instead of silently breaking the campaign card.

GitHub runs these on every push and pull request via
`.github/workflows/test.yml`. It's a separate workflow from the scheduled
availability check, so a failing test emails you but never stops the data
from updating.

**If StartPlaying changes their markup**, the live run is what notices
(the red-X email described below). To make the tests reflect the new page,
save a trimmed copy of a real listing into `test/fixtures/`, update the
patterns in `scrape.js`, and make the fixtures pass again.

## Failure notifications

If a listing fails to parse — StartPlaying returns an HTTP error, or
changes their page markup so the seat-count pattern no longer matches —
`scrape.js` deliberately exits with an error code instead of quietly
succeeding. This marks the GitHub Actions run as failed (red X), which
triggers GitHub's built-in email notification (sent to whoever created
the workflow — check **Settings → Notifications → Actions** on your
GitHub account to confirm this is turned on and set to email).

Importantly, `docs/availability.json` still gets committed even when the
run is marked failed — the commit step is configured to run regardless
(`if: always()` in the workflow file), so any listings that *did* parse
successfully still update. A session that failed is written with an
`error` field and `null` seat values (not carried over from the previous
run), letting `results-page.html` (in the landing page repo) fall back gracefully (it
only shows seat counts when `hasOpenSeats` is an actual boolean, not
`null`, and leaves out any session that failed).

## If the seat count stops updating

Check the Actions tab for a red X — as of the failure-notification setup
above, this should now also show up as an email. Click into the failed
run and expand the "Run scraper" step's log; it prints exactly which
listing(s) failed and why (`HTTP 404`, `pattern not found`, etc.).
"Pattern not found" almost always means StartPlaying changed their page
markup, which would require updating the `SEATS_PATTERN` regex in
`scrape.js` to match their new structure — inspect the live listing
page's source to see what changed.
