import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LISTINGS, sessionUrl } from '../scrape.js';

test('every game has a title and at least one session', () => {
  for (const [ref, game] of Object.entries(LISTINGS)) {
    assert.ok(game.title, `${ref} needs a title`);
    assert.ok(Array.isArray(game.sessions) && game.sessions.length > 0, `${ref} needs sessions`);
  }
});

// A pasted ID landing under the wrong game, or twice, would show wrong or
// duplicate times on the results page.
test('no session ID appears twice, within or across games', () => {
  const seen = new Map();
  for (const [ref, game] of Object.entries(LISTINGS)) {
    for (const id of game.sessions) {
      assert.ok(!seen.has(id), `${id} is in both "${seen.get(id)}" and "${ref}"`);
      seen.set(id, ref);
    }
  }
});

test('session IDs look like StartPlaying IDs (catches a pasted full URL or stray space)', () => {
  for (const [ref, game] of Object.entries(LISTINGS)) {
    for (const id of game.sessions) {
      assert.match(id, /^c[a-z0-9]{20,}$/, `${ref}: "${id}" is not a bare listing ID`);
    }
  }
});

test('game refs match the ones the results page looks up', () => {
  // results-page.html keys CAMPAIGN_HIGHLIGHTS and availability.listings by these refs.
  assert.deepEqual(Object.keys(LISTINGS).sort(), ['dnd2024', 'lotr', 'pirateborg']);
});

test('sessionUrl builds the listing URL with the profile slug', () => {
  assert.equal(
    sessionUrl('cabc123'),
    'https://startplaying.games/adventure/cabc123?slug=larrydotorg'
  );
});
