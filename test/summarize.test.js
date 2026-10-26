import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGame, failedSession } from '../scrape.js';

const config = { title: 'Test Game' };
const ok = (id, filled, total, extra = {}) => ({
  id,
  url: `https://example.test/${id}`,
  format: 'online',
  venue: null,
  schedule: 'Mondays 6:00 PM MST',
  nextDate: null,
  costCents: 1500,
  needsMore: null,
  seatsFilled: filled,
  seatsTotal: total,
  hasOpenSeats: filled < total,
  ...extra
});
const failed = (id, error = 'pattern not found') =>
  failedSession({ id, url: `https://example.test/${id}` }, error);

test('open when the game has room', () => {
  assert.equal(summarizeGame('g', config, [ok('a', 2, 6)]).hasOpenSeats, true);
});

test('full when every seat is taken', () => {
  assert.equal(summarizeGame('g', config, [ok('a', 6, 6)]).hasOpenSeats, false);
});

test('null (unknown) when the page could not be read', () => {
  assert.equal(summarizeGame('g', config, [failed('a', 'HTTP 404')]).hasOpenSeats, null);
});

test('top-level fields describe the game page', () => {
  const sessions = [ok('first', 3, 5, { format: 'in_person', venue: 'The Pub' })];
  const game = summarizeGame('ref1', config, sessions);
  assert.equal(game.ref, 'ref1');
  assert.equal(game.title, 'Test Game');
  assert.equal(game.url, 'https://example.test/first');
  assert.equal(game.format, 'in_person');
  assert.equal(game.venue, 'The Pub');
  assert.equal(game.seatsFilled, 3);
  assert.equal(game.seatsTotal, 5);
  assert.deepEqual(game.sessions, sessions);
});

test('a failed game has null format and venue', () => {
  const game = summarizeGame('g', config, [failed('a')]);
  assert.equal(game.format, null);
  assert.equal(game.venue, null);
});

test('failedSession nulls every value and records why', () => {
  assert.deepEqual(failedSession({ id: 'x', url: 'u' }, 'HTTP 500'), {
    id: 'x',
    url: 'u',
    schedule: null,
    nextDate: null,
    costCents: null,
    needsMore: null,
    seatsFilled: null,
    seatsTotal: null,
    hasOpenSeats: null,
    error: 'HTTP 500'
  });
});
