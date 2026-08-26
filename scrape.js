// scrape.js
// Fetches each StartPlaying listing page, extracts seat availability via
// regex against the server-rendered HTML (no headless browser needed —
// StartPlaying's listing pages render this text directly in the HTML),
// and writes the result to docs/availability.json for GitHub Pages to serve.
//
// Uses Node's built-in fetch (Node 18+, no dependencies required).

import { writeFile, mkdir } from 'node:fs/promises';

// ---- CONFIGURE YOUR LISTINGS HERE ----
// Add a new entry whenever a new campaign goes live on StartPlaying.
// Leave a system out entirely if it has no listing yet — the results
// page already falls back gracefully when a ref is missing.
const LISTINGS = {
  dnd2024: {
    title: 'The Keep on the Cauldronlands',
    url: 'https://startplaying.games/adventure/cmqpuqj2w001dl8040nqe24ow?slug=larrydotorg'
  },
  lotr: {
    title: 'Suspicious Mines',
    url: 'https://startplaying.games/adventure/cmqpunbf30019lc04evv2i9i6?slug=larrydotorg'
  },
  pirateborg: {
    title: 'Ash and Anchors',
    url: 'https://startplaying.games/adventure/cmtaodf77003ijr04iqe7yoyy?slug=larrydotorg'
  }
};

// Matches text like "2 / 5 Seats Filled" in the rendered page.
const SEATS_PATTERN = /(\d+)\s*\/\s*(\d+)\s*Seats Filled/i;

async function scrapeListing(ref, config) {
  try {
    const res = await fetch(config.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (availability-check-bot)' }
    });

    if (!res.ok) {
      console.warn(`[${ref}] fetch failed: HTTP ${res.status}`);
      return { ref, ...config, seatsFilled: null, seatsTotal: null, hasOpenSeats: null, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    // Strip HTML tags before matching, in case the numbers/slash are split
    // across separate inline elements (common in React/Next.js output).
    // Collapse whitespace so "2  /  5" and "2/5" both match cleanly.
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const match = plainText.match(SEATS_PATTERN);

    if (!match) {
      console.warn(`[${ref}] could not find seat count in page — StartPlaying may have changed their markup`);
      return { ref, ...config, seatsFilled: null, seatsTotal: null, hasOpenSeats: null, error: 'pattern not found' };
    }

    const seatsFilled = parseInt(match[1], 10);
    const seatsTotal = parseInt(match[2], 10);

    return {
      ref,
      ...config,
      seatsFilled,
      seatsTotal,
      hasOpenSeats: seatsFilled < seatsTotal
    };
  } catch (err) {
    console.warn(`[${ref}] error: ${err.message}`);
    return { ref, ...config, seatsFilled: null, seatsTotal: null, hasOpenSeats: null, error: err.message };
  }
}

async function main() {
  const results = {};

  for (const [ref, config] of Object.entries(LISTINGS)) {
    console.log(`Checking ${ref}: ${config.title}...`);
    results[ref] = await scrapeListing(ref, config);
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
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
