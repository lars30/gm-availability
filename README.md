# GM Availability Checker

Checks seat availability on your StartPlaying listings every 6 hours and
publishes the result as a public JSON file your results page can fetch.

**Live at:** `https://lars30.github.io/gm-availability/availability.json`
— this is already set up and running; the steps below are for reference
if you ever need to rebuild it or set up something similar elsewhere.

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
         "hasOpenSeats": true
       },
       "lotr": { ... }
     }
   }
   ```

6. **Note this URL** — you'll need it for the results page fetch. It's:
   `https://<your-username>.github.io/<repo-name>/availability.json`

That's it. From here, GitHub runs `scrape.js` automatically every 6 hours
and commits the updated JSON — nothing else to maintain.

## Adding a new campaign listing

Edit the `LISTINGS` object at the top of `scrape.js`, add the new entry,
commit and push. The next scheduled run (or a manual "Run workflow" click)
will pick it up.

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
successfully still update. Only the listings that failed keep their
`error` field and `null` values from the last successful check, letting
`results-page.html` fall back gracefully (it only shows a seat-count
line when `hasOpenSeats` is an actual boolean, not `null`).

## If the seat count stops updating

Check the Actions tab for a red X — as of the failure-notification setup
above, this should now also show up as an email. Click into the failed
run and expand the "Run scraper" step's log; it prints exactly which
listing(s) failed and why (`HTTP 404`, `pattern not found`, etc.).
"Pattern not found" almost always means StartPlaying changed their page
markup, which would require updating the `SEATS_PATTERN` regex in
`scrape.js` to match their new structure — inspect the live listing
page's source to see what changed.
