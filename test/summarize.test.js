import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGame, failedSession } from '../scrape.js';

const config = { title: 'Test Game' };
const ok = (id, filled, total) => ({
  id,
  url: `https://example.test/${id}`,
  schedule: 'Weekly / Monday - 5:00 PM UTC',
  nextDate: '2026-10-19T17:00:00.000Z',
  costCents: 1500,
  seatsFilled: filled,
  seatsTotal: total,
  hasOpenSeats: filled < total
});
const failed = (id, error = 'pattern not found') =>
  failedSession({ id, url: `https://example.test/${id}` }, error);

test('open if ANY session has room', () => {
  const game = summarizeGame('g', config, [ok('a', 6, 6), ok('b', 2, 6), ok('c', 6, 6)]);
  assert.equal(game.hasOpenSeats, true);
});

test('full only when EVERY session is full', () => {
  const game = summarizeGame('g', config, [ok('a', 6, 6), ok('b', 5, 5)]);
  assert.equal(game.hasOpenSeats, false);
});

test('null (unknown) when no session could be read', () => {
  const game = summarizeGame('g', config, [failed('a'), failed('b', 'HTTP 404')]);
  assert.equal(game.hasOpenSeats, null);
});

test('a failed session is ignored in the roll-up, not treated as full or open', () => {
  assert.equal(summarizeGame('g', config, [failed('a'), ok('b', 6, 6)]).hasOpenSeats, false);
  assert.equal(summarizeGame('g', config, [failed('a'), ok('b', 1, 6)]).hasOpenSeats, true);
});

// url / seatsFilled / seatsTotal keep the old one-listing-per-game meaning
// (the FIRST session), so anything written for that shape keeps working.
test('legacy top-level fields describe the first session', () => {
  const sessions = [ok('first', 3, 5), ok('second', 0, 6)];
  const game = summarizeGame('ref1', config, sessions);
  assert.equal(game.ref, 'ref1');
  assert.equal(game.title, 'Test Game');
  assert.equal(game.url, 'https://example.test/first');
  assert.equal(game.seatsFilled, 3);
  assert.equal(game.seatsTotal, 5);
  assert.deepEqual(game.sessions, sessions);
});

test('failedSession nulls every value and records why', () => {
  assert.deepEqual(failedSession({ id: 'x', url: 'u' }, 'HTTP 500'), {
    id: 'x',
    url: 'u',
    schedule: null,
    nextDate: null,
    costCents: null,
    seatsFilled: null,
    seatsTotal: null,
    hasOpenSeats: null,
    error: 'HTTP 500'
  });
});
