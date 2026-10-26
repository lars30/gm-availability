import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGameHtml } from '../scrape.js';

// Saved copies of real RoleCall game pages.
//   open       Ash and Anchors (online, 0 / 6)
//   mines      Suspicious Mines (online, 0 / 6)
//   remote     The Keep on the Cauldronlands (Remote) (online, 0 / 3)
//   in-person  The Keep on the Cauldronlands (Fate Brewing) (in person, 1 / 6, needs 2 more)
const fixture = (name) =>
  readFileSync(new URL(`./fixtures/rolecall-${name}.html`, import.meta.url), 'utf8');

// Minimal page with just the facts block, for the edge cases.
const page = ({ players = '0 / 5', price = 'Paid · $25/session', format = 'Online', when = 'Mondays 6:00 PM MST', title = 'Game' } = {}) => {
  const fact = (label, value) =>
    `<div class="rc-fact"><span class="rc-fact__label">${label}</span><span class="rc-fact__value ">${value}</span></div>`;
  return `<h1 class="campaign-pub__title">${title}</h1>` +
    [players && fact('Players', players), format && fact('Format', format), when && fact('When', when), price && fact('Price', price)].join('');
};

test('parses an online game with open seats', () => {
  assert.deepEqual(parseGameHtml(fixture('open')), {
    format: 'online',
    venue: null,
    schedule: 'Mon, Wed or Sat, 10:00 AM–1:00 PM MST',
    nextDate: null,
    costCents: 2500,
    seatsFilled: 0,
    seatsTotal: 6,
    needsMore: null,
    hasOpenSeats: true
  });
});

// The remote and in-person Keep are separate pages with their own price,
// seat count and format.
test('the remote game is online with its own seats and price', () => {
  const result = parseGameHtml(fixture('remote'));
  assert.equal(result.format, 'online');
  assert.equal(result.venue, null);
  assert.equal(result.seatsTotal, 3);
  assert.equal(result.costCents, 3000);
});

test('the in-person game has a venue, its own price and a "needs more" count', () => {
  assert.deepEqual(parseGameHtml(fixture('in-person')), {
    format: 'in_person',
    venue: 'Fate Brewing Midtown Phx',
    schedule: 'Tuesdays 6:00–9:30 PM MST',
    nextDate: null,
    costCents: 4000,
    seatsFilled: 1,
    seatsTotal: 6,
    needsMore: 2,
    hasOpenSeats: true
  });
});

test('reads each game\'s own per-session cost, in cents', () => {
  assert.equal(parseGameHtml(fixture('open')).costCents, 2500);
  assert.equal(parseGameHtml(fixture('mines')).costCents, 3500);
  assert.equal(parseGameHtml(fixture('remote')).costCents, 3000);
});

test('uses the per-session price, not the 6-session pack price', () => {
  assert.equal(parseGameHtml(page({ price: 'Paid · $25/session 6-session packs: $112.50 (25% off)' })).costCents, 2500);
});

test('handles cents and spacing in the price', () => {
  const cost = (price) => parseGameHtml(page({ price })).costCents;
  assert.equal(cost('Paid · $12.50 / session'), 1250);
  assert.equal(cost('Paid · $ 40 /Session'), 4000);
  assert.equal(cost('Paid · $7.5/session'), 750);
});

test('a missing or free price comes back null but seats still parse', () => {
  for (const price of [null, 'Free']) {
    const result = parseGameHtml(page({ price }));
    assert.equal(result.costCents, null);
    assert.equal(result.seatsTotal, 5);
  }
});

test('a full game has no open seats', () => {
  const result = parseGameHtml(page({ players: '6 / 6' }));
  assert.equal(result.seatsFilled, 6);
  assert.equal(result.hasOpenSeats, false);
});

test('"needs N more" is only set when the page says so', () => {
  assert.equal(parseGameHtml(page({ players: '1 / 6 · needs 2 more to start' })).needsMore, 2);
  assert.equal(parseGameHtml(page({ players: '1 / 6' })).needsMore, null);
});

test('a parenthetical in the title is only a venue for in-person games', () => {
  assert.equal(parseGameHtml(page({ title: 'Game (Remote)', format: 'Online' })).venue, null);
  assert.equal(parseGameHtml(page({ title: 'Game (The Pub)', format: 'In Person' })).venue, 'The Pub');
  assert.equal(parseGameHtml(page({ title: 'Game', format: 'In Person' })).venue, null);
});

test('decodes HTML entities in the schedule', () => {
  assert.equal(parseGameHtml(page({ when: 'Tue &amp; Thu 6:00 PM MST' })).schedule, 'Tue & Thu 6:00 PM MST');
});

// If RoleCall rewords the page, we must report "not found" (null) rather
// than guess — the caller turns that into a failed run and an email.
test('returns null when the Players fact is missing', () => {
  assert.equal(parseGameHtml(page({ players: null })), null);
  assert.equal(parseGameHtml(page({ players: 'Full' })), null);
});

test('returns null for a page with nothing recognizable', () => {
  assert.equal(parseGameHtml('<html><body>Page not found</body></html>'), null);
  assert.equal(parseGameHtml(''), null);
});

// Schedule and format are best-effort: losing them must not lose the seat count.
test('missing schedule and format come back null but seats still parse', () => {
  const result = parseGameHtml(page({ when: null, format: null }));
  assert.equal(result.schedule, null);
  assert.equal(result.format, null);
  assert.equal(result.seatsFilled, 0);
  assert.equal(result.seatsTotal, 5);
});

test('takes the first Players fact on the page', () => {
  const result = parseGameHtml(page({ players: '1 / 6' }) + page({ players: '5 / 5' }));
  assert.equal(result.seatsFilled, 1);
  assert.equal(result.seatsTotal, 6);
});
