// Development play tool: replay only real controls through the unmodified simulation.
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../engine.js');
const actionKeys = keys => ({
  axis: (keys.includes('ArrowRight') ? 1 : 0) - (keys.includes('ArrowLeft') ? 1 : 0),
  jumpHeld: keys.includes('Space'), down: keys.includes('ArrowDown')
});
function replay(level, actions, log = false) {
  const state = engine.create(level);
  let previous = [];
  const snapshots = [];
  for (const action of actions) {
    const keys = action.keys || [];
    for (let frame = 0; frame < action.frames; frame++) {
      engine.step(state, { ...actionKeys(keys),
        jump: frame === 0 && keys.includes('Space') && !previous.includes('Space'),
        rewind: frame === 0 && keys.includes('e') && !previous.includes('e') }, 1 / 120);
      if (state.status !== 'playing') break;
    }
    previous = keys;
    snapshots.push({ action, t: +state.elapsed.toFixed(3), x: +state.player.x.toFixed(1),
      y: +state.player.y.toFixed(1), grounded: state.player.onGround, vy: +state.player.vy.toFixed(1),
      seeds: state.collected.map(Number).join(''), rewinds: state.rewinds, status: state.status });
    if (state.status !== 'playing') break;
  }
  if (log) console.log(JSON.stringify(snapshots, null, 2));
  return state;
}
if (require.main === module) {
  const source = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
  replay(source.level, source.actions, true);
}
module.exports = { replay };
