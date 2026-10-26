import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LISTINGS, gameUrl } from '../scrape.js';

test('every game has a title and a slug', () => {
  for (const [ref, game] of Object.entries(LISTINGS)) {
    assert.ok(game.title, `${ref} needs a title`);
    assert.ok(game.slug, `${ref} needs a slug`);
  }
});

// A slug pasted under the wrong game, or twice, would show wrong or
// duplicate data on the results page.
test('no slug appears twice', () => {
  const seen = new Map();
  for (const [ref, game] of Object.entries(LISTINGS)) {
    assert.ok(!seen.has(game.slug), `${game.slug} is in both "${seen.get(game.slug)}" and "${ref}"`);
    seen.set(game.slug, ref);
  }
});

test('slugs look like RoleCall slugs (catches a pasted full URL or stray space)', () => {
  for (const [ref, game] of Object.entries(LISTINGS)) {
    assert.match(game.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${ref}: "${game.slug}" is not a bare slug`);
  }
});

test('game refs match the ones the results page looks up', () => {
  // results-page.html keys CAMPAIGN_HIGHLIGHTS and availability.listings by these refs.
  assert.deepEqual(Object.keys(LISTINGS).sort(), ['dnd2024', 'dnd2024inperson', 'lotr', 'pirateborg']);
});

test('gameUrl builds the game page URL under the profile', () => {
  assert.equal(
    gameUrl('ash-and-anchors'),
    'https://rolecall.games/games/larrydotorg/ash-and-anchors'
  );
});
