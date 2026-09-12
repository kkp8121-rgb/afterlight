const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine.js');
const AL = require('../levels.js');

const dt = AL.tuning.nominalDt;
const stepFor = (state, frames, input = {}) => {
  for (let i = 0; i < frames && state.status === 'playing'; i++) engine.step(state, input, dt);
  return state;
};

test('create is isolated and an empty tape cannot rewind', () => {
  const a = engine.create(0);
  const b = engine.create(0);
  engine.step(a, { rewind: true }, dt);
  assert.equal(a.events[0].type, 'denied');
  assert.deepEqual(a.level, b.level);
  assert.notStrictEqual(a.level, b.level);
  assert.notStrictEqual(a.player, b.player);
});

test('rewind returns to the oldest sample and replaces the echo path', () => {
  const state = engine.create(0);
  stepFor(state, 150, { axis: 1 });
  const oldest = { ...state.history[0] };
  const oldHistory = state.history.length;
  engine.step(state, { rewind: true }, dt);
  assert.equal(state.rewinds, 1);
  assert.equal(state.echo.length, oldHistory);
  assert.equal(state.echoRemaining, AL.tuning.echoSeconds);
  assert.equal(state.player.x, oldest.x);
  assert.equal(state.player.y, oldest.y);
  assert.equal(state.echo[0].y, oldest.y + state.player.h);

  stepFor(state, 90, { axis: -1 });
  const firstEcho = state.echo;
  stepFor(state, 75, { axis: 1 });
  engine.step(state, { rewind: true }, dt);
  assert.equal(state.rewinds, 2);
  assert.notStrictEqual(state.echo, firstEcho);
  assert.equal(state.echoRemaining, AL.tuning.echoSeconds);
});

test('recorded jump afterimage is a physical landing surface', () => {
  const state = engine.create(0);
  stepFor(state, 145, { axis: 1 });
  stepFor(state, 1, { axis: 1, jump: true, jumpHeld: true });
  stepFor(state, 75, { axis: 1, jumpHeld: true });
  engine.step(state, { rewind: true }, dt);
  // Walk back to the recorded jump and jump onto its raised portion.
  stepFor(state, 100, { axis: 1 });
  stepFor(state, 1, { axis: 1, jump: true, jumpHeld: true });
  stepFor(state, 70, { axis: 1, jumpHeld: true });
  assert.equal(state.status, 'playing');
  assert.ok(state.echo.length > 20);
  assert.ok(state.player.y < 434, 'the player should have landed above the room floor');
});

test('rewind does not auto-elevate while idle on a recorded trajectory', () => {
  const state = engine.create(0);
  stepFor(state, 145, { axis: 1 });
  stepFor(state, 1, { axis: 1, jump: true, jumpHeld: true });
  stepFor(state, 75, { axis: 1, jumpHeld: true });
  engine.step(state, { rewind: true }, dt);
  const rewindY = state.player.y;
  stepFor(state, 10);
  assert.ok(Math.abs(state.player.y - rewindY) < 2, `idle rewind moved from ${rewindY} to ${state.player.y}`);
});

test('falling past a chamber edge emits a void death', () => {
  const state = engine.create(4);
  stepFor(state, 240, { axis: 1 });
  assert.equal(state.status, 'dead');
  assert.equal(state.deathReason, 'void');
  assert.ok(state.events.some(event => event.type === 'death'));
});

test('hazard motion and simulation are deterministic', () => {
  const hazard = AL.levels[4].hazards[0];
  assert.deepEqual(engine.hazardRect(hazard, 1.25), engine.hazardRect(hazard, 1.25));
  const a = engine.create(4);
  const b = engine.create(4);
  for (let frame = 0; frame < 360; frame++) {
    const input = { axis: frame < 120 ? 1 : 0, jump: frame === 70, jumpHeld: frame >= 70 && frame < 110 };
    engine.step(a, input, dt);
    engine.step(b, input, dt);
  }
  assert.deepEqual(a, b);
});
