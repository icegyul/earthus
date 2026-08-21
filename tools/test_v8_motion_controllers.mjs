import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/v8/motion-controllers.js', import.meta.url), 'utf8');
const { FollowController, CinemaController } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

let now = 0;
const followEvents = [];
const follow = new FollowController({ now: () => now, onEvent: event => followEvents.push(event) });
follow.start('current-17');
assert.equal(follow.snapshot().endsAt, 12000);
now = 11999; follow.tick();
assert.equal(follow.snapshot().state, 'PLAYING');
now = 12000; follow.tick();
assert.equal(follow.snapshot().state, 'COMPLETED');
assert.equal(followEvents.at(-1).reason, 'COMPLETED');

now = 20000; follow.start('cyclone-demo', 120000);
assert.equal(follow.snapshot().endsAt, 80000, 'follow duration is capped at 60 seconds');
follow.onUserCameraInput();
assert.equal(follow.snapshot().state, 'STOPPED');
assert.equal(followEvents.at(-1).reason, 'USER');

const cinemaEvents = [];
now = 0;
const cinema = new CinemaController({ now: () => now, onEvent: event => cinemaEvents.push(event) });
cinema.load({ schemaVersion: '8.0', cinemaId: 'cinema_demo', finite: true, shots: [
  { shotId: 'wide', durationMs: 1000, sceneId: 'scene_wide' },
  { shotId: 'detail', durationMs: 1500, sceneId: 'scene_detail' },
] });
cinema.play();
assert.equal(cinema.snapshot().shotId, 'wide');
now = 1000; cinema.tick();
assert.equal(cinema.snapshot().shotId, 'detail');
now = 2500; cinema.tick();
assert.equal(cinema.snapshot().state, 'COMPLETED');
assert.equal(cinemaEvents.at(-1).reason, 'COMPLETED');

now = 3000; cinema.play(); cinema.stop('SAFETY');
assert.equal(cinema.snapshot().state, 'STOPPED');
assert.equal(cinemaEvents.at(-1).reason, 'SAFETY');

now = 4000; cinema.play();
now = 4500; cinema.pause();
now = 9000; cinema.play(); cinema.tick();
assert.equal(cinema.snapshot().shotId, 'wide', 'paused wall time must not consume a cinema shot');
now = 9500; cinema.tick();
assert.equal(cinema.snapshot().shotId, 'detail');
assert.throws(() => cinema.load({ cinemaId: 'bad', finite: false, shots: [] }), /finite/);

console.log('EARTHUS v8 follow and cinema controllers: PASS');
