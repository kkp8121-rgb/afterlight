const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { replay } = require('./route-lab.cjs');
const AL = require('../levels.js');

function route(index) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'replays', `${String(index + 1).padStart(2, '0')}.json`), 'utf8'));
}
for (let index = 0; index < AL.levels.length; index++) {
  test(`Campaign room ${index + 1}: every seed and exit reachable with ordinary controls`, () => {
    const recording = route(index);
    const state = replay(index, recording.actions);
    assert.equal(state.status, 'complete', JSON.stringify({ player: state.player, collected: state.collected }));
    assert.ok(state.collected.every(Boolean));
    assert.equal(state.deathReason, null);
  });
}
test('First chamber route requires its physical afterimage', () => {
  const withoutMemory = route(0).actions.map(action => ({ ...action, keys: action.keys.filter(key => key !== 'e') }));
  const state = replay(0, withoutMemory);
  assert.notEqual(state.status, 'complete');
  assert.equal(state.collected[0], false, 'The high light is beyond a normal jump');
});
