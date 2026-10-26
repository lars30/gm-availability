// scrape.js
// Fetches each RoleCall game page, extracts the schedule, price, format and
// seat availability from the server-rendered HTML (no headless browser
// needed — RoleCall renders the "facts" block directly in the HTML), and
// writes the result to docs/availability.json for GitHub Pages to serve.
//
// Uses Node's built-in fetch (Node 18+, no dependencies required).

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ---- CONFIGURE YOUR GAMES HERE ----
// Add a new entry whenever a new game goes live on RoleCall. Leave a game
// out entirely if it has no page yet — the results page already falls back
// gracefully when a ref is missing.
//
// Each game is one RoleCall page, so `slug` is the last part of its URL:
// rolecall.games/games/larrydotorg/<slug>. The remote and in-person versions
// of a game are separate pages, so they are separate entries.
const BASE = 'https://rolecall.games/games/larrydotorg';
export const gameUrl = (slug) => `${BASE}/${slug}`;

export const LISTINGS = {
  dnd2024: {
    title: 'The Keep on the Cauldronlands',
    slug: 'the-keep-on-the-cauldronlands-remote'
  },
  dnd2024inperson: {
    title: 'The Keep on the Cauldronlands (In Person)',
    slug: 'the-keep-on-the-cauldronlands'
  },
  lotr: {
    title: 'Suspicious Mines',
    slug: 'suspicious-mines'
  },
  pirateborg: {
    title: 'Ash and Anchors',
    slug: 'ash-and-anchors'
  }
};

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

const stripTags = (s) => decode(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

// The facts block is a list of label/value pairs, e.g.
//   <span class="rc-fact__label">Players</span>
//   <span class="rc-fact__value ">0 / 6</span>
// Returns { Label: 'value text' } for every pair on the page.
function readFacts(html) {
  const facts = {};
  const pattern =
    /rc-fact__label">([^<]+)<\/span>\s*<(span|div)[^>]*rc-fact__value[^>]*>([\s\S]*?)<\/\2>/g;
  for (const m of html.matchAll(pattern)) {
    if (!(m[1] in facts)) facts[m[1]] = stripTags(m[3]);
  }
  return facts;
}

// "1 / 6 · needs 2 more to start" -> { seatsFilled: 1, seatsTotal: 6, needsMore: 2 }
const PLAYERS_PATTERN = /(\d+)\s*\/\s*(\d+)(?:.*?needs\s+(\d+)\s+more)?/i;

// "Paid · $25/session 6-session packs: ..." -> the first "$X/session" price.
const COST_PATTERN = /\$\s*(\d+(?:\.\d{1,2})?)\s*\/\s*session/i;

// The page title is "Game Name (Venue)" for in-person games, or
// "Game Name (Remote)" for online ones; the parenthetical is only a venue
// when the format says the game is in person.
const IN_PERSON_PATTERN = /in[\s-]?person/i;

// Pulls the game details out of a RoleCall game page's HTML.
// Returns null if the seat count isn't on the page (RoleCall may have
// changed their markup). The schedule, price, format and venue are
// best-effort: if any is missing it comes back null but the seat counts
// still count.
export function parseGameHtml(html) {
  const facts = readFacts(html);
  const players = facts.Players?.match(PLAYERS_PATTERN);
  if (!players) return null;

  const seatsFilled = parseInt(players[1], 10);
  const seatsTotal = parseInt(players[2], 10);
  const cost = facts.Price?.match(COST_PATTERN)?.[1];

  const inPerson = IN_PERSON_PATTERN.test(facts.Format ?? '');
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const venue = inPerson && heading ? stripTags(heading[1]).match(/\(([^)]+)\)\s*$/)?.[1] ?? null : null;

  return {
    format: facts.Format ? (inPerson ? 'in_person' : 'online') : null,
    venue,
    schedule: facts.When ?? null,
    // RoleCall doesn't publish a next-session date on the game page.
    nextDate: null,
    // Per player, per session, in cents (so $25.00 -> 2500) to avoid float math.
    costCents: cost === undefined ? null : Math.round(parseFloat(cost) * 100),
    seatsFilled,
    seatsTotal,
    needsMore: players[3] === undefined ? null : parseInt(players[3], 10),
    hasOpenSeats: seatsFilled < seatsTotal
  };
}

// A game we couldn't read: null values plus the reason.
export function failedSession(base, error) {
  return {
    ...base,
    schedule: null, nextDate: null, costCents: null, needsMore: null,
    seatsFilled: null, seatsTotal: null, hasOpenSeats: null, error
  };
}

// Builds a game's entry. Each game is a single RoleCall page, so `sessions`
// holds one entry (kept as a list so the results page's shape is unchanged).
// `hasOpenSeats` is null if the page couldn't be read.
export function summarizeGame(ref, config, sessions) {
  const [first] = sessions;
  const parsed = sessions.filter((s) => !s.error);
  return {
    ref,
    title: config.title,
    url: first.url,
    format: first.format ?? null,
    venue: first.venue ?? null,
    seatsFilled: first.seatsFilled,
    seatsTotal: first.seatsTotal,
    hasOpenSeats: parsed.length ? parsed.some((s) => s.hasOpenSeats) : null,
    sessions
  };
}

// `fetchPage` is injectable so tests can simulate HTTP errors and outages.
export async function scrapeGame(ref, config, fetchPage = fetch) {
  const url = gameUrl(config.slug);
  const base = { id: config.slug, url };
  try {
    const res = await fetchPage(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (availability-check-bot)' }
    });

    if (!res.ok) {
      console.warn(`[${ref}] fetch failed: HTTP ${res.status}`);
      return summarizeGame(ref, config, [failedSession(base, `HTTP ${res.status}`)]);
    }

    const parsed = parseGameHtml(await res.text());

    if (!parsed) {
      console.warn(`[${ref}] could not find seat count in page — RoleCall may have changed their markup`);
      return summarizeGame(ref, config, [failedSession(base, 'pattern not found')]);
    }

    const { format, venue, ...session } = parsed;
    return summarizeGame(ref, config, [{ ...base, format, venue, ...session }]);
  } catch (err) {
    console.warn(`[${ref}] error: ${err.message}`);
    return summarizeGame(ref, config, [failedSession(base, err.message)]);
  }
}

async function main() {
  const results = {};

  for (const [ref, config] of Object.entries(LISTINGS)) {
    console.log(`Checking ${ref}: ${config.title}...`);
    results[ref] = await scrapeGame(ref, config);
    // Be polite — small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    listings: results
  };

  await mkdir('docs', { recursive: true });
  await writeFile('docs/availability.json', JSON.stringify(output, null, 2));
  console.log('Wrote docs/availability.json');
  console.log(JSON.stringify(output, null, 2));

  // If any game failed to parse (HTTP error, or RoleCall changed their
  // markup so the seat-count pattern no longer matches), fail this run on
  // purpose. The file above still gets written with whatever DID parse
  // successfully — this exit code only controls whether GitHub marks the
  // run as failed, which is what triggers the email notification you've
  // already got configured on your GitHub account.
  const failedSessions = Object.values(results).flatMap((r) =>
    r.sessions.filter((s) => s.error).map((s) => ({ ...s, title: r.title }))
  );
  if (failedSessions.length > 0) {
    console.error(`\n${failedSessions.length} game(s) failed to parse:`);
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
