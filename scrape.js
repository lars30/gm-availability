// scrape.js
// Fetches each StartPlaying listing page (one per game per day/time slot),
// extracts the schedule and seat availability via
// regex against the server-rendered HTML (no headless browser needed —
// StartPlaying's listing pages render this text directly in the HTML),
// and writes the result to docs/availability.json for GitHub Pages to serve.
//
// Uses Node's built-in fetch (Node 18+, no dependencies required).

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ---- CONFIGURE YOUR LISTINGS HERE ----
// Add a new entry whenever a new campaign goes live on StartPlaying.
// Leave a system out entirely if it has no listing yet — the results
// page already falls back gracefully when a ref is missing.
//
// Each game has one StartPlaying listing per time slot (the tiles on your
// profile page), so `sessions` is a list of listing IDs. Add an ID here when
// you add a new day/time; the day and time are read from the page itself.
const BASE = 'https://startplaying.games/adventure';
export const sessionUrl = (id) => `${BASE}/${id}?slug=larrydotorg`;

export const LISTINGS = {
  dnd2024: {
    title: 'The Keep on the Cauldronlands',
    sessions: [
      'cmvbjy5zf003zl108nxzw7min', // Sat
      'cmqpuqj2w001dl8040nqe24ow', // Mon
      'cmvbjmqt20033jw08eoahfb4o', // Tue
      'cmvbjq06s004mle0806j0s159', // Wed
      'cmvbjsyp4003eju07edxkwwhy', // Thu
      'cmvbjv0ua004pla0878kvh8jt'  // Fri
    ]
  },
  lotr: {
    title: 'Suspicious Mines',
    sessions: [
      'cmvbmtz08002fl508opfapax0', // Sun
      'cmqpunbf30019lc04evv2i9i6', // Tue
      'cmvbmrgjk012bjy075n44coqc'  // Thu
    ]
  },
  pirateborg: {
    title: 'Ash and Anchors',
    sessions: [
      'cmvbogn9400val6078skpn98t', // Sat
      'cmtaodf77003ijr04iqe7yoyy', // Mon
      'cmvbof5mo00sml607a616ntk7'  // Wed
    ]
  }
};

// Matches text like "2 / 5 Seats Filled" in the rendered page.
const SEATS_PATTERN = /(\d+)\s*\/\s*(\d+)\s*Seats Filled/i;

// Matches text like "Weekly / Monday - 5:00 PM UTC" in the rendered page.
const SCHEDULE_PATTERN = /((?:Weekly|Biweekly|Monthly)\s*\/\s*\w+day\s*-\s*\d{1,2}:\d{2}\s*[AP]M\s*\w+)/i;

// Matches text like "$25.00 / Session" in the rendered page. Read from the
// visible text, not the embedded data: the page's data also carries the GM's
// default rate, which can differ from this listing's price.
const COST_PATTERN = /\$\s*(\d+(?:\.\d{1,2})?)\s*\/\s*Session/i;

// Next occurrence as an ISO timestamp, from the page's embedded data.
const NEXT_DATE_PATTERN = /"scheduledDate":"([^"]+)"/;

// Pulls the schedule and seat counts out of a listing page's HTML.
// Returns null if the seat-count text isn't on the page (StartPlaying may
// have changed their markup). The schedule, next date and cost are
// best-effort: if any is missing it comes back null but the seat counts
// still count.
export function parseListingHtml(html) {
  // Strip HTML tags before matching, in case the numbers/slash are split
  // across separate inline elements (common in React/Next.js output).
  // Collapse whitespace so "2  /  5" and "2/5" both match cleanly.
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const match = plainText.match(SEATS_PATTERN);
  if (!match) return null;

  const seatsFilled = parseInt(match[1], 10);
  const seatsTotal = parseInt(match[2], 10);
  const cost = plainText.match(COST_PATTERN)?.[1];

  return {
    schedule: plainText.match(SCHEDULE_PATTERN)?.[1] ?? null,
    nextDate: html.match(NEXT_DATE_PATTERN)?.[1] ?? null,
    // Per player, per session, in cents (so $25.00 -> 2500) to avoid float math.
    costCents: cost === undefined ? null : Math.round(parseFloat(cost) * 100),
    seatsFilled,
    seatsTotal,
    hasOpenSeats: seatsFilled < seatsTotal
  };
}

// A session we couldn't read: null values plus the reason.
export function failedSession(base, error) {
  return { ...base, schedule: null, nextDate: null, costCents: null, seatsFilled: null, seatsTotal: null, hasOpenSeats: null, error };
}

// Rolls a game's sessions up into one entry.
// `url`, `seatsFilled` and `seatsTotal` describe the first session, so
// anything reading the old one-listing-per-game shape keeps working.
// `hasOpenSeats` is true if ANY session has room, false if every readable
// session is full, and null if no session could be read.
export function summarizeGame(ref, config, sessions) {
  const [first] = sessions;
  const parsed = sessions.filter((s) => !s.error);
  return {
    ref,
    title: config.title,
    url: first.url,
    seatsFilled: first.seatsFilled,
    seatsTotal: first.seatsTotal,
    hasOpenSeats: parsed.length ? parsed.some((s) => s.hasOpenSeats) : null,
    sessions
  };
}

async function scrapeSession(id) {
  const url = sessionUrl(id);
  const base = { id, url };
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (availability-check-bot)' }
    });

    if (!res.ok) {
      console.warn(`[${id}] fetch failed: HTTP ${res.status}`);
      return failedSession(base, `HTTP ${res.status}`);
    }

    const parsed = parseListingHtml(await res.text());

    if (!parsed) {
      console.warn(`[${id}] could not find seat count in page — StartPlaying may have changed their markup`);
      return failedSession(base, 'pattern not found');
    }

    return { ...base, ...parsed };
  } catch (err) {
    console.warn(`[${id}] error: ${err.message}`);
    return failedSession(base, err.message);
  }
}

async function scrapeListing(ref, config) {
  const sessions = [];
  for (const id of config.sessions) {
    sessions.push(await scrapeSession(id));
    // Be polite — small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return summarizeGame(ref, config, sessions);
}

async function main() {
  const results = {};

  for (const [ref, config] of Object.entries(LISTINGS)) {
    console.log(`Checking ${ref}: ${config.title} (${config.sessions.length} sessions)...`);
    results[ref] = await scrapeListing(ref, config);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    listings: results
  };

  await mkdir('docs', { recursive: true });
  await writeFile('docs/availability.json', JSON.stringify(output, null, 2));
  console.log('Wrote docs/availability.json');
  console.log(JSON.stringify(output, null, 2));

  // If any listing failed to parse (HTTP error, or StartPlaying changed
  // their markup so the seat-count pattern no longer matches), fail this
  // run on purpose. The file above still gets written with whatever DID
  // parse successfully — this exit code only controls whether GitHub
  // marks the run as failed, which is what triggers the email
  // notification you've already got configured on your GitHub account.
  const failedSessions = Object.values(results).flatMap((r) =>
    r.sessions.filter((s) => s.error).map((s) => ({ ...s, title: r.title }))
  );
  if (failedSessions.length > 0) {
    console.error(`\n${failedSessions.length} session(s) failed to parse:`);
    failedSessions.forEach((s) => console.error(`  - ${s.id} (${s.title}): ${s.error}`));
    console.error('\nExiting with an error code so this run is marked failed and you get notified.');
    process.exitCode = 1;
  }
}

// Run only when executed directly (`node scrape.js`), not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
