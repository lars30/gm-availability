// The results page (square-space_landing_page/results-page.html) reads
// docs/availability.json. These tests pin the shape it depends on, so a
// rename or removed field fails here instead of silently breaking the card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LISTINGS, summarizeGame, failedSession } from '../scrape.js';

const GAME_FIELDS = ['ref', 'title', 'url', 'seatsFilled', 'seatsTotal', 'hasOpenSeats', 'sessions'];
const SESSION_FIELDS = ['id', 'url', 'schedule', 'nextDate', 'costCents', 'seatsFilled', 'seatsTotal', 'hasOpenSeats'];

const published = JSON.parse(
  readFileSync(new URL('../docs/availability.json', import.meta.url), 'utf8')
);

function assertHasFields(obj, fields, label) {
  for (const f of fields) assert.ok(f in obj, `${label} is missing "${f}"`);
}

test('published file has a timestamp and a listing for every configured game', () => {
  assert.ok(!Number.isNaN(Date.parse(published.generatedAt)), 'generatedAt must be a date');
  assert.deepEqual(Object.keys(published.listings).sort(), Object.keys(LISTINGS).sort());
});

test('published games and sessions have every field the results page reads', () => {
  for (const [ref, game] of Object.entries(published.listings)) {
    assertHasFields(game, GAME_FIELDS, `listings.${ref}`);
    assert.equal(game.ref, ref);
    assert.ok(game.sessions.length > 0, `${ref} has no sessions`);
    for (const s of game.sessions) assertHasFields(s, SESSION_FIELDS, `${ref} session ${s.id}`);
  }
});

test('published sessions are either fully parsed or marked with an error', () => {
  for (const game of Object.values(published.listings)) {
    for (const s of game.sessions) {
      if (s.error) {
        assert.equal(s.hasOpenSeats, null);
      } else {
        assert.equal(typeof s.hasOpenSeats, 'boolean', `${s.id} hasOpenSeats`);
        assert.equal(typeof s.seatsFilled, 'number');
        assert.equal(typeof s.seatsTotal, 'number');
        assert.ok(s.seatsFilled <= s.seatsTotal, `${s.id} is over capacity`);
      }
    }
  }
});

test('published game-level hasOpenSeats agrees with its sessions', () => {
  for (const game of Object.values(published.listings)) {
    const readable = game.sessions.filter((s) => !s.error);
    const expected = readable.length ? readable.some((s) => s.hasOpenSeats) : null;
    assert.equal(game.hasOpenSeats, expected, `${game.ref} roll-up`);
  }
});

// Same checks against what the code produces, so a change to the writer
// is caught before the next scheduled run overwrites the published file.
test('summarizeGame output has every field the results page reads', () => {
  const session = {
    id: 'a', url: 'u', schedule: 's', nextDate: 'd', costCents: 1500,
    seatsFilled: 1, seatsTotal: 6, hasOpenSeats: true
  };
  const game = summarizeGame('g', { title: 'T' }, [session, failedSession({ id: 'b', url: 'u2' }, 'x')]);
  assertHasFields(game, GAME_FIELDS, 'game');
  for (const s of game.sessions) assertHasFields(s, SESSION_FIELDS, 'session');
});
