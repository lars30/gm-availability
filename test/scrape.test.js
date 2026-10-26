import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scrapeGame, gameUrl } from '../scrape.js';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/rolecall-${name}.html`, import.meta.url), 'utf8');

const config = { title: 'Test Game', slug: 'test-game' };
const respond = (status, body = '') => async () => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body
});

// scrapeGame is the part main() calls per game; these pin how each way the
// fetch can go wrong is reported, since a non-null `error` is what turns the
// GitHub run red and sends the notification email.
test('a readable page becomes a game with one parsed session', async () => {
  const game = await scrapeGame('ref', config, respond(200, fixture('in-person')));
  assert.equal(game.ref, 'ref');
  assert.equal(game.url, gameUrl('test-game'));
  assert.equal(game.format, 'in_person');
  assert.equal(game.venue, 'Fate Brewing Midtown Phx');
  assert.equal(game.hasOpenSeats, true);
  assert.equal(game.sessions.length, 1);
  assert.equal(game.sessions[0].id, 'test-game');
  assert.equal(game.sessions[0].needsMore, 2);
  assert.equal(game.sessions[0].error, undefined);
});

test('an HTTP error is reported, not treated as full or open', async () => {
  const game = await scrapeGame('ref', config, respond(404));
  assert.equal(game.hasOpenSeats, null);
  assert.equal(game.sessions[0].error, 'HTTP 404');
  assert.equal(game.sessions[0].seatsFilled, null);
});

test('a page without the Players fact is reported as "pattern not found"', async () => {
  const game = await scrapeGame('ref', config, respond(200, '<html>Page not found</html>'));
  assert.equal(game.hasOpenSeats, null);
  assert.equal(game.sessions[0].error, 'pattern not found');
});

test('a network error is reported with its message', async () => {
  const game = await scrapeGame('ref', config, async () => { throw new Error('socket hang up'); });
  assert.equal(game.hasOpenSeats, null);
  assert.equal(game.sessions[0].error, 'socket hang up');
});

test('the request goes to the game page URL', async () => {
  let requested;
  await scrapeGame('ref', config, async (url) => {
    requested = url;
    return { ok: true, status: 200, text: async () => fixture('open') };
  });
  assert.equal(requested, 'https://rolecall.games/games/larrydotorg/test-game');
});
