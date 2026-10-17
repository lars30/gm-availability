import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseListingHtml } from '../scrape.js';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parses schedule, next date and seats from an open listing', () => {
  assert.deepEqual(parseListingHtml(fixture('listing-open.html')), {
    schedule: 'Weekly / Monday - 5:00 PM UTC',
    nextDate: '2026-10-19T17:00:00.000Z',
    costCents: 1500,
    seatsFilled: 0,
    seatsTotal: 6,
    hasOpenSeats: true
  });
});

test('a partly filled listing still has open seats', () => {
  const result = parseListingHtml(fixture('listing-partial.html'));
  assert.equal(result.seatsFilled, 2);
  assert.equal(result.seatsTotal, 6);
  assert.equal(result.hasOpenSeats, true);
});

// Each time slot has its own price, so the cost must come from that listing.
test('reads each listing\'s own per-session cost, in cents', () => {
  assert.equal(parseListingHtml(fixture('listing-open.html')).costCents, 1500);
  assert.equal(parseListingHtml(fixture('listing-partial.html')).costCents, 2500);
  assert.equal(parseListingHtml(fixture('listing-full.html')).costCents, 3500);
});

test('handles cents and spacing in the price', () => {
  const cost = (price) => parseListingHtml(`<p>${price}</p><p>0 / 5 Seats Filled</p>`).costCents;
  assert.equal(cost('$12.50 / Session'), 1250);
  assert.equal(cost('$ 40 /Session'), 4000);
  assert.equal(cost('$7.5 / Session'), 750);
});

test('a missing price comes back null but seats still parse', () => {
  const result = parseListingHtml('<p>0 / 5 Seats Filled</p>');
  assert.equal(result.costCents, null);
  assert.equal(result.seatsTotal, 5);
});

// The page also embeds the GM's default rate; the listing's own price wins.
test('ignores the embedded default rate and uses the visible price', () => {
  const html = '<p>$25.00 / Session</p><p>0 / 5 Seats Filled</p>' +
    '<script>{"GMProfile":{"costPerPlayerCents":1500}}</script>';
  assert.equal(parseListingHtml(html).costCents, 2500);
});

test('a full listing has no open seats', () => {
  const result = parseListingHtml(fixture('listing-full.html'));
  assert.equal(result.seatsFilled, 6);
  assert.equal(result.seatsTotal, 6);
  assert.equal(result.hasOpenSeats, false);
});

test('finds seat counts split across inline tags and whitespace', () => {
  const result = parseListingHtml(fixture('listing-split-tags.html'));
  assert.equal(result.seatsFilled, 3);
  assert.equal(result.seatsTotal, 5);
});

// If StartPlaying rewords the page, we must report "not found" (null) rather
// than guess — the caller turns that into a failed run and an email.
test('returns null when the seat-count text is missing', () => {
  assert.equal(parseListingHtml(fixture('listing-no-seats.html')), null);
});

test('returns null for a page with nothing recognizable', () => {
  assert.equal(parseListingHtml('<html><body>Not found</body></html>'), null);
  assert.equal(parseListingHtml(''), null);
});

// Schedule and date are best-effort: losing them must not lose the seat count.
test('missing schedule and date come back null but seats still parse', () => {
  const result = parseListingHtml(fixture('listing-no-schedule.html'));
  assert.equal(result.schedule, null);
  assert.equal(result.nextDate, null);
  assert.equal(result.seatsFilled, 1);
  assert.equal(result.seatsTotal, 4);
  assert.equal(result.hasOpenSeats, true);
});

test('takes the first seat count on the page', () => {
  const html = '<p>1 / 6 Seats Filled</p><p>5 / 5 Seats Filled</p>';
  const result = parseListingHtml(html);
  assert.equal(result.seatsFilled, 1);
  assert.equal(result.seatsTotal, 6);
});
